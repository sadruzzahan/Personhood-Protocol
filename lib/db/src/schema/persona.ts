import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projectsTable } from "./dashboard";

// One row per Persona inquiry. We never store raw biometric data — only
// the inquiry id, status, and the derived subject id (which is itself a
// one-way identifier from Persona). raw_payload keeps the most recent
// vendor event payload for support / debugging only.
export const personaInquiriesTable = pgTable(
  "persona_inquiries",
  {
    inquiryId: text("inquiry_id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    // "pending" | "completed" | "approved" | "declined" | "expired" | "failed"
    status: text("status").notNull(),
    // Vendor-provided one-way subject identifier. Null until the inquiry
    // is completed. This is the key off which we derive the nullifier.
    subjectId: text("subject_id"),
    // Most recent vendor event payload (for debugging, redactable).
    rawPayload: jsonb("raw_payload"),
    // Set of webhook event ids we've already applied (idempotency).
    receivedEventIds: jsonb("received_event_ids").$type<string[]>().notNull().default([]),
    // "mock" | "persona". Lets us evolve to multi-vendor without a migration.
    vendor: text("vendor").notNull(),
    // Set once /register has exchanged this inquiry for a commitment + badge.
    // Used to make /register single-use per inquiry so an approved inquiry
    // can't be replayed across multiple appContexts.
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    bySubject: index("persona_inquiries_subject_idx").on(t.projectId, t.subjectId),
    byProject: index("persona_inquiries_project_idx").on(t.projectId, t.createdAt),
  }),
);

// RSA-2048 signing keys for human-badge JWTs. Public key is published at
// /.well-known/jwks.json so any relying party can verify offline. The
// private key is also stored in this table — the trust boundary is the
// database itself, which is gated by DATABASE_URL the same way an env
// secret is gated by an env var. See docs/key-rotation.md.
export const jwtKeysTable = pgTable(
  "jwt_keys",
  {
    kid: text("kid").primaryKey(),
    // PEM-encoded SPKI public key.
    publicPem: text("public_pem").notNull(),
    // PEM-encoded PKCS8 private key.
    privatePem: text("private_pem").notNull(),
    alg: text("alg").notNull().default("RS256"),
    // "active" | "deprecated". Exactly one row should be active at a time;
    // deprecated keys remain published in the JWKS until their grace
    // period elapses so already-issued badges can still be verified.
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
  },
  (t) => ({
    byStatus: uniqueIndex("jwt_keys_active_idx")
      .on(t.status)
      .where(sql`status = 'active'`),
  }),
);

export type PersonaInquiry = typeof personaInquiriesTable.$inferSelect;
export type JwtKey = typeof jwtKeysTable.$inferSelect;
