import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projectsTable } from "./dashboard";

// Outbound webhook delivery queue. One row per (eventId, projectId) pair —
// `eventId` is unique within a project so retries of the same event during
// transient produce only a single delivery row regardless of source path.
//
// The poller picks up rows where `status='pending' AND next_attempt_at <= now()`,
// signs the captured payload with the project's `webhook_signing_secret`,
// POSTs to `target_url`, and then either marks the row delivered or schedules
// the next retry from RETRY_SCHEDULE_MS. After the schedule is exhausted the
// row transitions to `abandoned`.
//
// `target_url` and `signing_secret_snapshot` are captured at enqueue time so
// rotating the URL or secret does not change the destination/signature for
// already-queued deliveries (matches Stripe's behavior).
export const webhookDeliveriesTable = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    // Stable id for this logical event. Same id across all retry rows of the
    // same event (e.g. when the customer hits "redeliver", a NEW row with a
    // NEW id is created — redelivery is a fresh delivery, not a retry).
    eventId: text("event_id").notNull(),
    // e.g. "verification.completed", "webhook.test"
    eventType: text("event_type").notNull(),
    // Frozen at enqueue time — this is the exact JSON that will be signed
    // and sent on every retry attempt of THIS row.
    payload: jsonb("payload").notNull(),
    // "pending" | "delivered" | "failed" | "abandoned"
    //   pending   — queued, awaiting next_attempt_at
    //   delivered — destination returned 2xx
    //   failed    — last attempt failed but retries remain (transient state
    //               between attempts; status flips back to pending when
    //               next_attempt_at is set)
    //   abandoned — exhausted RETRY_SCHEDULE_MS without success
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    lastResponseStatus: integer("last_response_status"),
    // First ~512 bytes of the response body, for debugging in the dashboard.
    lastResponseBodyPreview: text("last_response_body_preview"),
    lastResponseTimeMs: integer("last_response_time_ms"),
    // e.g. "ECONNREFUSED", "timeout", "non_2xx", "url_not_configured"
    lastError: text("last_error"),
    targetUrl: text("target_url").notNull(),
    // The signing secret captured at enqueue time. Snapshotting protects
    // already-queued deliveries from secret rotation between the enqueue and
    // the (possibly retried) delivery.
    signingSecretSnapshot: text("signing_secret_snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Poller reads: pending rows whose next_attempt_at has elapsed.
    pollerIdx: index("webhook_deliveries_poller_idx").on(t.status, t.nextAttemptAt),
    // Dashboard reads: most recent deliveries per project.
    byProject: index("webhook_deliveries_project_idx").on(t.projectId, t.createdAt),
    // Dedup: never enqueue the same (project, eventId) twice. Customers
    // explicitly opt into a fresh delivery via the "redeliver" endpoint,
    // which generates a fresh eventId.
    eventDedup: uniqueIndex("webhook_deliveries_event_dedup_idx").on(
      t.projectId,
      t.eventId,
    ),
  }),
);

export type WebhookDelivery = typeof webhookDeliveriesTable.$inferSelect;
export type InsertWebhookDelivery = typeof webhookDeliveriesTable.$inferInsert;
