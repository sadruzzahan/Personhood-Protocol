import { Router, type IRouter } from "express";
import { eq, sql, and, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  commitmentsTable,
  verificationStatsTable,
  personaInquiriesTable,
} from "@workspace/db";
import {
  GetProtocolStatsResponse,
  CheckNullifierParams,
  CheckNullifierResponse,
} from "@workspace/api-zod";
import { ApiError } from "../lib/errors";
import { requireApiKey } from "../middlewares/apiKeyAuth";
import { rateLimit } from "../middlewares/rateLimit";
import { idempotencyMiddleware } from "../middlewares/idempotency";
import { requestLoggerMiddleware } from "../middlewares/requestLogger";
import { deriveNullifier, deriveCommitment } from "../lib/nullifier";
// DESIGN NOTE — /verify trust model.
// The badge JWT deliberately does NOT carry the vendor subject identifier
// (embedding it would create a stable cross-app linker that defeats the
// privacy goal of this protocol). Therefore /verify cannot recompute the
// expected nullifier from "subject + appContext"; it instead validates
// the badge by:
//   1) checking the RS256 signature against the JWKS,
//   2) confirming aud/iss/exp,
//   3) looking up the commitment by JWT.sub (commitment hash) in the
//      server-side registry, and
//   4) confirming the badge's nullifier and app_context match what was
//      recorded at /register time.
// Any tampered claim (different nullifier or app_context for the same
// commitment) fails step 4 even if the signature could somehow be
// re-signed. This is a deliberate protocol choice over the
// "recompute from subject" model — see replit.md "Verification flow &
// key boundary" for the full rationale.
import { signHumanBadge, verifyHumanBadge } from "../lib/jwt";
import { getVendorByName } from "../lib/vendor";
import { enqueueWebhook } from "../lib/webhookDelivery";
import { logger } from "../lib/logger";

const STATS_ROW_ID = 1;
const serverStartedAt = Date.now();

const RegisterBody = z.object({
  inquiryId: z.string().min(8).max(128),
  appContext: z.string().min(1).max(128),
});
const VerifyBody = z.object({
  humanBadge: z.string().min(20).max(8192),
  appContext: z.string().min(1).max(128),
});

async function incrementStats(field: "success" | "failure"): Promise<void> {
  if (field === "success") {
    await db
      .insert(verificationStatsTable)
      .values({
        id: STATS_ROW_ID,
        totalVerifications: 1,
        totalFailedVerifications: 0,
      })
      .onConflictDoUpdate({
        target: verificationStatsTable.id,
        set: {
          totalVerifications: sql`${verificationStatsTable.totalVerifications} + 1`,
        },
      });
  } else {
    await db
      .insert(verificationStatsTable)
      .values({
        id: STATS_ROW_ID,
        totalVerifications: 0,
        totalFailedVerifications: 1,
      })
      .onConflictDoUpdate({
        target: verificationStatsTable.id,
        set: {
          totalFailedVerifications: sql`${verificationStatsTable.totalFailedVerifications} + 1`,
        },
      });
  }
}

const router: IRouter = Router();

const publicWrite = [
  requestLoggerMiddleware,
  requireApiKey,
  rateLimit("write"),
  idempotencyMiddleware,
] as const;
const publicRead = [
  requestLoggerMiddleware,
  requireApiKey,
  rateLimit("read"),
] as const;

router.post("/register", ...publicWrite, async (req, res, next) => {
  try {
    if (!req.apiContext) throw new Error("missing apiContext");
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError({
        code: "validation_error",
        status: 422,
        message: "Invalid register payload",
        details: parsed.error.message,
      });
    }
    const { inquiryId, appContext } = parsed.data;

    // Look up the inquiry and confirm it belongs to the calling project.
    const [inquiry] = await db
      .select()
      .from(personaInquiriesTable)
      .where(eq(personaInquiriesTable.inquiryId, inquiryId))
      .limit(1);
    if (!inquiry || inquiry.projectId !== req.apiContext.project.id) {
      throw new ApiError({
        code: "inquiry_not_found",
        status: 404,
        message: "Unknown inquiry id for this project",
      });
    }

    // For the mock vendor (and any case where the row hasn't caught up
    // yet), poll the vendor inline so /register doesn't require the
    // caller to first poll /inquiries.
    let subjectId = inquiry.subjectId;
    let status = inquiry.status;
    if (status !== "approved" || !subjectId) {
      try {
        // Use the vendor that was selected when the inquiry was created,
        // not the server default — they may differ if the caller chose
        // an explicit `mode` at /inquiries time.
        const vendor = getVendorByName(inquiry.vendor);
        const latest = vendor ? await vendor.getInquiry(inquiryId) : null;
        if (latest && latest.subjectId && latest.status === "approved") {
          subjectId = latest.subjectId;
          status = "approved";
          await db
            .update(personaInquiriesTable)
            .set({
              status,
              subjectId,
              updatedAt: new Date(),
            })
            .where(eq(personaInquiriesTable.inquiryId, inquiryId));
        } else if (latest) {
          status = latest.status;
        }
      } catch {
        // fall through to the not-approved error below
      }
    }
    if (status !== "approved" || !subjectId) {
      throw new ApiError({
        code: "inquiry_not_approved",
        status: 409,
        message:
          "Inquiry is not in an approved state yet. Wait for the user to complete the hosted flow, or poll GET /inquiries/{id}.",
      });
    }

    // Single-use consume: atomically mark the inquiry consumed *only* if
    // it is currently approved AND not already consumed. If zero rows are
    // updated, another request beat us to it (or the inquiry was already
    // exchanged) — surface that as an explicit `inquiry_consumed` error so
    // callers know to start a new inquiry instead of replaying.
    const consumedNow = new Date();
    const consumeResult = await db
      .update(personaInquiriesTable)
      .set({ consumedAt: consumedNow, updatedAt: consumedNow })
      .where(
        and(
          eq(personaInquiriesTable.inquiryId, inquiryId),
          eq(personaInquiriesTable.status, "approved"),
          isNull(personaInquiriesTable.consumedAt),
        ),
      )
      .returning({ inquiryId: personaInquiriesTable.inquiryId });
    if (consumeResult.length === 0) {
      throw new ApiError({
        code: "inquiry_consumed",
        status: 409,
        message:
          "This inquiry has already been exchanged for a human badge. Start a new inquiry to register again.",
      });
    }

    const nullifier = deriveNullifier(subjectId, appContext);
    const { commitmentHash } = deriveCommitment(subjectId);

    const existing = await db
      .select({ nullifier: commitmentsTable.nullifier })
      .from(commitmentsTable)
      .where(eq(commitmentsTable.nullifier, nullifier))
      .limit(1);
    if (existing.length > 0) {
      throw new ApiError({
        code: "conflict",
        status: 409,
        message: "Nullifier already registered",
        details:
          "This human is already registered for this app context. Each person can register once per appContext.",
      });
    }

    const registeredAt = new Date();
    try {
      await db.insert(commitmentsTable).values({
        commitmentHash,
        nullifier,
        appContext,
        registeredAt,
      });
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "23505"
      ) {
        throw new ApiError({
          code: "conflict",
          status: 409,
          message: "Nullifier already registered",
        });
      }
      throw err;
    }

    const { token, expiresAt } = await signHumanBadge({
      commitmentHash,
      audience: req.apiContext.project.id,
      nullifier,
      appContext,
    });

    res.json({
      commitmentHash,
      nullifier,
      humanBadge: token,
      registeredAt: registeredAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/verify", ...publicWrite, async (req, res, next) => {
  try {
    if (!req.apiContext) throw new Error("missing apiContext");
    const parsed = VerifyBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError({
        code: "validation_error",
        status: 422,
        message: "Invalid verify payload",
        details: parsed.error.message,
      });
    }
    const { humanBadge, appContext } = parsed.data;
    const now = new Date();

    let claims;
    try {
      claims = await verifyHumanBadge(humanBadge);
    } catch (err) {
      await incrementStats("failure");
      const msg = err instanceof Error ? err.message : String(err);
      const expired = /exp/i.test(msg) && /expired/i.test(msg);
      res.json({
        verified: false,
        verifiedAt: now.toISOString(),
        message: expired
          ? "Human badge has expired"
          : "Human badge signature did not verify",
      });
      return;
    }

    // Audience check: the badge must have been issued *to* this project.
    if (claims.aud !== req.apiContext.project.id) {
      await incrementStats("failure");
      res.json({
        verified: false,
        verifiedAt: now.toISOString(),
        message: "Badge audience does not match this project",
      });
      return;
    }
    // App-context check: caller must declare the same context the badge
    // was minted for.
    if (claims.app_context !== appContext) {
      await incrementStats("failure");
      res.json({
        verified: false,
        verifiedAt: now.toISOString(),
        message: "App context does not match the badge",
      });
      return;
    }

    // The badge contains no subject identifier — verify by looking up the
    // server-side commitment record by the JWT subject (commitment hash)
    // and confirming the badge's nullifier + appContext match what we
    // recorded at /register time. A signed badge whose claims have been
    // tampered with (different nullifier or appContext for the same
    // commitment) will fail this cross-check even though the signature
    // verifies.
    const [record] = await db
      .select()
      .from(commitmentsTable)
      .where(eq(commitmentsTable.commitmentHash, claims.sub))
      .limit(1);
    if (!record) {
      await incrementStats("failure");
      res.json({
        verified: false,
        verifiedAt: now.toISOString(),
        message: "Commitment is not registered",
      });
      return;
    }
    if (record.nullifier !== claims.nullifier || record.appContext !== appContext) {
      await incrementStats("failure");
      res.json({
        verified: false,
        verifiedAt: now.toISOString(),
        message: "Badge claims do not match the registered commitment",
      });
      return;
    }

    await incrementStats("success");
    // Fire-and-forget outbound webhook to the project's configured URL.
    // Failures are recorded in webhook_deliveries and retried by the
    // poller — they MUST NOT fail the /verify response.
    enqueueWebhook({
      projectId: req.apiContext.project.id,
      eventType: "verification.completed",
      data: {
        nullifier: claims.nullifier,
        commitmentHash: claims.sub,
        appContext,
        verifiedAt: now.toISOString(),
        // Echo the badge expiry so customers can decide whether to renew.
        badgeExpiresAt: new Date((claims.exp ?? 0) * 1000).toISOString(),
      },
    }).catch((err) => {
      logger.warn({ err, projectId: req.apiContext?.project.id }, "Failed to enqueue webhook");
    });
    res.json({
      verified: true,
      nullifier: claims.nullifier,
      commitmentHash: claims.sub,
      verifiedAt: now.toISOString(),
      message: "Proof of personhood verified successfully",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/stats", ...publicRead, async (_req, res, next) => {
  try {
    const uptimeSeconds = (Date.now() - serverStartedAt) / 1000;

    const [counts] = await db
      .select({ totalCommitments: sql<number>`count(*)::int` })
      .from(commitmentsTable);

    const [stats] = await db
      .select()
      .from(verificationStatsTable)
      .where(eq(verificationStatsTable.id, STATS_ROW_ID))
      .limit(1);

    const response = GetProtocolStatsResponse.parse({
      totalCommitments: counts?.totalCommitments ?? 0,
      totalVerifications: stats?.totalVerifications ?? 0,
      totalFailedVerifications: stats?.totalFailedVerifications ?? 0,
      uptimeSeconds,
      activeNullifiers: counts?.totalCommitments ?? 0,
    });
    res.json(response);
  } catch (err) {
    next(err);
  }
});

router.get("/nullifier/:hash", ...publicRead, async (req, res, next) => {
  try {
    const parsed = CheckNullifierParams.safeParse(req.params);
    if (!parsed.success) {
      throw new ApiError({
        code: "validation_error",
        status: 422,
        message: "Invalid nullifier hash",
        details: parsed.error.message,
      });
    }
    const { hash } = parsed.data;
    const found = await db
      .select()
      .from(commitmentsTable)
      .where(eq(commitmentsTable.nullifier, hash))
      .limit(1);
    const record = found[0];
    const response = CheckNullifierResponse.parse({
      hash,
      used: !!record,
      registeredAt: record?.registeredAt,
    });
    res.json(response);
  } catch (err) {
    next(err);
  }
});

export default router;
