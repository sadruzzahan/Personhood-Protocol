import { pgTable, text, timestamp, integer, serial } from "drizzle-orm/pg-core";

export const commitmentsTable = pgTable("commitments", {
  commitmentHash: text("commitment_hash").primaryKey(),
  nullifier: text("nullifier").notNull().unique(),
  appContext: text("app_context").notNull(),
  registeredAt: timestamp("registered_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const verificationStatsTable = pgTable("verification_stats", {
  id: serial("id").primaryKey(),
  totalVerifications: integer("total_verifications").notNull().default(0),
  totalFailedVerifications: integer("total_failed_verifications")
    .notNull()
    .default(0),
});

export type Commitment = typeof commitmentsTable.$inferSelect;
export type InsertCommitment = typeof commitmentsTable.$inferInsert;
