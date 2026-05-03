import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

export const organizationsTable = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdByUserId: text("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orgMembershipsTable = pgTable(
  "org_memberships",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["owner", "admin", "member"] })
      .notNull()
      .default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.userId] }),
    byUser: index("org_memberships_user_idx").on(t.userId),
  }),
);

export const projectsTable = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    environment: text("environment", { enum: ["test", "live"] })
      .notNull()
      .default("test"),
    // Comma-separated list of origins allowed for browser-based use of the
    // API keys issued under this project. Consumed by Task #8 auth middleware.
    // Empty string means "no browser origins allowed" (server-to-server only).
    allowedOrigins: text("allowed_origins").notNull().default(""),
    // Optional webhook URL the project owner wants verification events
    // delivered to. Wired in Task #10.
    webhookUrl: text("webhook_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgSlug: uniqueIndex("projects_org_slug_idx").on(t.organizationId, t.slug),
    byOrg: index("projects_org_idx").on(t.organizationId),
  }),
);

export const apiKeysTable = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    last4: text("last4").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    // When set, identifies the new key that supersedes this one (rotation).
    rotatedToKeyId: text("rotated_to_key_id"),
  },
  (t) => ({
    byProject: index("api_keys_project_idx").on(t.projectId),
  }),
);

export const requestLogsTable = pgTable(
  "request_logs",
  {
    id: text("id").primaryKey(),
    // Nullable so we can also persist auth-failed requests (no project
    // attribution) for observability of denied traffic.
    projectId: text("project_id").references(() => projectsTable.id, {
      onDelete: "cascade",
    }),
    apiKeyId: text("api_key_id").references(() => apiKeysTable.id, {
      onDelete: "set null",
    }),
    // HTTP method (GET/POST/...) for completeness.
    method: text("method").notNull(),
    // The endpoint name (e.g. "register", "verify"). Set by Task #8 when it
    // wires API key auth + logging into the public protocol routes.
    endpoint: text("endpoint").notNull(),
    // Full request path (e.g. "/api/verify"); kept alongside `endpoint`
    // because endpoint is logical/normalized while path is raw.
    path: text("path").notNull(),
    statusCode: integer("status_code").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    // Truncated client IP for privacy (e.g. "203.0.113.0/24" or "2001:db8::/64").
    ipPrefix: text("ip_prefix"),
    // Server-generated request id for correlation with logs/Sentry.
    requestId: text("request_id"),
    // Set on failures (e.g. "invalid_signature", "rate_limited"). Null on success.
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byProject: index("request_logs_project_idx").on(t.projectId, t.createdAt),
  }),
);

export type Organization = typeof organizationsTable.$inferSelect;
export type OrgMembership = typeof orgMembershipsTable.$inferSelect;
export type Project = typeof projectsTable.$inferSelect;
export type ApiKey = typeof apiKeysTable.$inferSelect;
export type RequestLog = typeof requestLogsTable.$inferSelect;
