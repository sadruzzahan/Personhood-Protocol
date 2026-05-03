import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
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
    // It NEVER leaves the server — it's not echoed in any API response and
    // is not embedded in human-badge JWTs.
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

// NOTE: there is intentionally NO `jwt_keys` table. RSA-2048 signing keys
// for human-badge JWTs are loaded exclusively from environment secrets
// (JWT_PRIVATE_KEY_PEM / JWT_PUBLIC_KEY_PEM / JWT_KID) so the private key
// never crosses the database trust boundary. See docs/key-rotation.md for
// rotation procedure.

export type PersonaInquiry = typeof personaInquiriesTable.$inferSelect;
