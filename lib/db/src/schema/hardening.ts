import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";

// Token-bucket state per (project_id, bucket_key). bucket_key is the endpoint
// family ("write" / "read") so we can apply different limits without an
// extra config table. Atomic refill is done in SQL on each request.
export const rateLimitBucketsTable = pgTable(
  "rate_limit_buckets",
  {
    projectId: text("project_id").notNull(),
    bucketKey: text("bucket_key").notNull(),
    // Tokens currently available. Refilled lazily when a request arrives.
    tokens: integer("tokens").notNull(),
    // Bucket capacity (also serves as the per-minute rate ceiling).
    capacity: integer("capacity").notNull(),
    // Tokens added per second.
    refillRate: integer("refill_rate").notNull(),
    lastRefillAt: timestamp("last_refill_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: index("rate_limit_buckets_pk_idx").on(t.projectId, t.bucketKey),
  }),
);

// Idempotency cache. Keyed by (project_id, key). Stores the original response
// so that a retried POST returns byte-identical bodies.
export const idempotencyRecordsTable = pgTable(
  "idempotency_records",
  {
    projectId: text("project_id").notNull(),
    key: text("key").notNull(),
    // sha256 of the request body. A retry with the same key but a different
    // body returns 409 Conflict.
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBody: text("response_body").notNull(),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: index("idempotency_records_pk_idx").on(t.projectId, t.key),
    byCreatedAt: index("idempotency_records_created_idx").on(t.createdAt),
  }),
);

export type RateLimitBucket = typeof rateLimitBucketsTable.$inferSelect;
export type IdempotencyRecord = typeof idempotencyRecordsTable.$inferSelect;
