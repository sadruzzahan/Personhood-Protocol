import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, personaInquiriesTable } from "@workspace/db";
import { z } from "zod/v4";
import { ApiError } from "../lib/errors";
import { requireApiKey } from "../middlewares/apiKeyAuth";
import { rateLimit } from "../middlewares/rateLimit";
import { requestLoggerMiddleware } from "../middlewares/requestLogger";
import { idempotencyMiddleware } from "../middlewares/idempotency";
import { getVendor } from "../lib/vendor";
import { newId } from "../lib/ids";

const CreateInquiryBody = z.object({
  // Optional. We pass it to the vendor as reference-id so customers can
  // correlate the hosted flow back to their own user record.
  referenceId: z.string().min(1).max(128).optional(),
  redirectUri: z.string().url().max(512).optional(),
});

const PollInquiryParams = z.object({
  inquiryId: z.string().min(8).max(128),
});

const router: IRouter = Router();

const writeStack = [
  requestLoggerMiddleware,
  requireApiKey,
  rateLimit("write"),
  idempotencyMiddleware,
] as const;
const readStack = [
  requestLoggerMiddleware,
  requireApiKey,
  rateLimit("read"),
] as const;

router.post("/inquiries", ...writeStack, async (req, res, next) => {
  try {
    if (!req.apiContext) throw new Error("missing apiContext");
    const parsed = CreateInquiryBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError({
        code: "validation_error",
        status: 422,
        message: "Invalid inquiry payload",
        details: parsed.error.message,
      });
    }
    const vendor = getVendor();
    const referenceId =
      parsed.data.referenceId ?? `${req.apiContext.project.id}:${newId("ref")}`;
    let session;
    try {
      session = await vendor.createInquiry({
        referenceId,
        redirectUri: parsed.data.redirectUri,
      });
    } catch (err) {
      throw new ApiError({
        code: "vendor_unavailable",
        status: 502,
        message: "Identity vendor is currently unreachable.",
        details: err instanceof Error ? err.message : String(err),
      });
    }
    await db
      .insert(personaInquiriesTable)
      .values({
        inquiryId: session.inquiryId,
        projectId: req.apiContext.project.id,
        status: "pending",
        subjectId: null,
        rawPayload: { reference_id: referenceId, vendor: session.vendor },
        receivedEventIds: [],
        vendor: session.vendor,
      })
      .onConflictDoNothing();
    res.json({
      inquiryId: session.inquiryId,
      hostedUrl: session.hostedUrl,
      vendor: session.vendor,
      status: "pending",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/inquiries/:inquiryId", ...readStack, async (req, res, next) => {
  try {
    if (!req.apiContext) throw new Error("missing apiContext");
    const parsed = PollInquiryParams.safeParse(req.params);
    if (!parsed.success) {
      throw new ApiError({
        code: "validation_error",
        status: 422,
        message: "Invalid inquiry id",
      });
    }
    const { inquiryId } = parsed.data;
    const [row] = await db
      .select()
      .from(personaInquiriesTable)
      .where(eq(personaInquiriesTable.inquiryId, inquiryId))
      .limit(1);
    if (!row || row.projectId !== req.apiContext.project.id) {
      throw new ApiError({
        code: "inquiry_not_found",
        status: 404,
        message: "Unknown inquiry id for this project",
      });
    }

    // Pull the latest from the vendor so callers can poll without us
    // requiring webhooks for the demo flow. Webhooks still update the
    // canonical row when delivered.
    const vendor = getVendor();
    let latest = null;
    try {
      latest = await vendor.getInquiry(inquiryId);
    } catch {
      latest = null;
    }
    if (latest && latest.status !== row.status) {
      await db
        .update(personaInquiriesTable)
        .set({
          status: latest.status,
          subjectId: latest.subjectId ?? row.subjectId,
          updatedAt: new Date(),
        })
        .where(eq(personaInquiriesTable.inquiryId, inquiryId));
    }

    res.json({
      inquiryId,
      status: latest?.status ?? row.status,
      decision: latest?.decision ?? null,
      // We deliberately do NOT echo the subjectId — it's a server-side
      // input to nullifier derivation, not a client-facing identifier.
    });
  } catch (err) {
    next(err);
  }
});

export default router;
