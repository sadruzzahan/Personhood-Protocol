import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, personaInquiriesTable } from "@workspace/db";
import { ApiError } from "../lib/errors";
import { verifyPersonaSignature } from "../lib/personaWebhook";
import { logger } from "../lib/logger";
import { deriveSubjectId } from "../lib/vendor/persona";

const router: IRouter = Router();

interface PersonaWebhookEvent {
  data?: {
    id?: string;
    type?: string;
    attributes?: {
      name?: string;
      payload?: {
        data?: {
          id?: string;
          type?: string;
          attributes?: { status?: string };
          relationships?: {
            account?: { data?: { id?: string } | null };
          };
        };
      };
    };
  };
}

function mapStatus(s: string | undefined): string {
  switch (s) {
    case "approved":
    case "completed":
    case "declined":
    case "expired":
    case "failed":
      return s;
    default:
      return "pending";
  }
}

router.post(
  "/webhooks/persona",
  // Raw body is captured globally by express.json({ verify }) in app.ts so
  // we can compute HMAC over the exact bytes Persona signed. Trying to
  // re-stringify req.body would break the signature for any payload whose
  // canonical form differs from JSON.stringify (key order, whitespace, etc).
  async (req, res, next) => {
    try {
      const secret = process.env.PERSONA_WEBHOOK_SECRET;
      if (!secret) {
        // The endpoint is exposed unconditionally so customers can register
        // it ahead of time, but we refuse to act on payloads until the
        // secret is configured.
        throw new ApiError({
          code: "service_unavailable",
          status: 503,
          message: "Persona webhook receiver is not configured on this server.",
        });
      }
      const rawBuf = (req as typeof req & { rawBody?: Buffer }).rawBody;
      if (!rawBuf) {
        throw new ApiError({
          code: "validation_error",
          status: 400,
          message: "Webhook raw body was not captured",
        });
      }
      const rawBody = rawBuf.toString("utf8");
      const sig = req.header("Persona-Signature") ?? req.header("persona-signature");
      const verdict = verifyPersonaSignature({
        rawBody,
        signatureHeader: sig,
        secret,
      });
      if (!verdict.ok) {
        throw new ApiError({
          code: "webhook_signature_invalid",
          status: 401,
          message: "Webhook signature verification failed.",
          details: verdict.reason,
        });
      }

      let event: PersonaWebhookEvent;
      try {
        event = JSON.parse(rawBody);
      } catch {
        throw new ApiError({
          code: "validation_error",
          status: 422,
          message: "Webhook body is not valid JSON",
        });
      }

      const eventId = event.data?.id;
      const inquiry = event.data?.attributes?.payload?.data;
      const inquiryId = inquiry?.id;
      const status = mapStatus(inquiry?.attributes?.status);
      const accountId = inquiry?.relationships?.account?.data?.id ?? null;
      if (!eventId || !inquiryId || inquiry?.type !== "inquiry") {
        // We acknowledge non-inquiry events so Persona doesn't retry them.
        res.status(200).json({ received: true, ignored: true });
        return;
      }

      const [existing] = await db
        .select()
        .from(personaInquiriesTable)
        .where(eq(personaInquiriesTable.inquiryId, inquiryId))
        .limit(1);

      if (!existing) {
        // Webhook arrived before /api/inquiries created the row, or for an
        // inquiry created out-of-band. Acknowledge but do not insert: we
        // don't know which project to attribute it to.
        logger.warn({ inquiryId }, "Persona webhook for unknown inquiry");
        res.status(200).json({ received: true, ignored: "unknown_inquiry" });
        return;
      }

      if (existing.receivedEventIds.includes(eventId)) {
        // Already applied — Persona retries on non-2xx; we want both the
        // first and the retry to be no-ops past this point.
        res.status(200).json({ received: true, replayed: true });
        return;
      }

      const subjectId = accountId ? deriveSubjectId(accountId) : existing.subjectId;
      await db
        .update(personaInquiriesTable)
        .set({
          status,
          subjectId,
          rawPayload: event as unknown as Record<string, unknown>,
          receivedEventIds: [...existing.receivedEventIds, eventId],
          updatedAt: new Date(),
        })
        .where(eq(personaInquiriesTable.inquiryId, inquiryId));

      res.status(200).json({ received: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
