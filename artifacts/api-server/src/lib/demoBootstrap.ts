import { and, eq } from "drizzle-orm";
import {
  db,
  organizationsTable,
  orgMembershipsTable,
  projectsTable,
  apiKeysTable,
} from "@workspace/db";
import { newId, hashApiKey } from "./ids";
import { logger } from "./logger";

const DEMO_ORG_SLUG = "pop-demo";
const DEMO_PROJECT_SLUG = "demo";

function deterministicDemoKey(): string {
  const explicit = process.env.DEMO_API_KEY;
  if (explicit && /^pk_test_[A-Z2-7]+$/.test(explicit)) return explicit;
  // Stable, throwaway test key. Safe to expose publicly — bound to the
  // demo project only, with the standard test-tier rate limits and no
  // origin restrictions. NOT for production traffic.
  return "pk_test_DEMOKEY2345677AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
}

let cachedKey: string | null = null;

export async function ensureDemoApiKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  const fullKey = deterministicDemoKey();
  const keyHash = hashApiKey(fullKey);

  // 1. Org
  let [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, DEMO_ORG_SLUG))
    .limit(1);
  if (!org) {
    const newOrg = {
      id: newId("org"),
      name: "Proof of Personhood Demo",
      slug: DEMO_ORG_SLUG,
      createdByUserId: "system",
    };
    await db.insert(organizationsTable).values(newOrg).onConflictDoNothing();
    [org] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.slug, DEMO_ORG_SLUG))
      .limit(1);
    // best-effort: an owner membership row
    await db
      .insert(orgMembershipsTable)
      .values({ organizationId: org.id, userId: "system", role: "owner" })
      .onConflictDoNothing();
  }

  // 2. Project — must match by (org, slug, environment) so we never bind
  // the public demo key to some unrelated project that happens to share
  // the org. The demo project is always test-tier.
  let [project] = await db
    .select()
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.organizationId, org.id),
        eq(projectsTable.slug, DEMO_PROJECT_SLUG),
        eq(projectsTable.environment, "test"),
      ),
    )
    .limit(1);
  if (!project) {
    project = (
      await db
        .insert(projectsTable)
        .values({
          id: newId("prj"),
          organizationId: org.id,
          name: "Demo Project",
          slug: DEMO_PROJECT_SLUG,
          environment: "test",
          allowedOrigins: "",
        })
        .returning()
    )[0];
  }

  // 3. API key — match by hash so re-running the bootstrap with the same
  // deterministic key is a no-op.
  const [existingKey] = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.keyHash, keyHash))
    .limit(1);
  if (!existingKey) {
    const prefix = fullKey.slice(0, 16);
    const last4 = fullKey.slice(-4);
    await db.insert(apiKeysTable).values({
      id: newId("key"),
      projectId: project.id,
      name: "Demo Key (public)",
      prefix,
      last4,
      keyHash,
      createdByUserId: "system",
    });
    logger.info(
      { projectId: project.id, prefix },
      "Provisioned public demo API key",
    );
  }

  cachedKey = fullKey;
  return fullKey;
}

export function getCachedDemoApiKey(): string | null {
  return cachedKey;
}
