import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  organizationsTable,
  orgMembershipsTable,
  projectsTable,
  apiKeysTable,
  requestLogsTable,
} from "@workspace/db";
import { requireAuth, getUserId } from "../../lib/auth";
import {
  generateApiKey,
  newId,
  shortHash,
  slugify,
} from "../../lib/ids";

const router: IRouter = Router();

router.use(requireAuth);

async function ensurePersonalOrg(userId: string) {
  // Run as a single transaction so concurrent first-login requests cannot
  // create duplicate orgs or leave a half-created membership behind.
  return await db.transaction(async (tx) => {
    const existing = await tx
      .select({ org: organizationsTable })
      .from(orgMembershipsTable)
      .innerJoin(
        organizationsTable,
        eq(organizationsTable.id, orgMembershipsTable.organizationId),
      )
      .where(eq(orgMembershipsTable.userId, userId))
      .orderBy(organizationsTable.createdAt)
      .limit(1);
    if (existing.length > 0) return existing[0].org;

    const slug = `org-${shortHash(userId, 8)}`;
    // ON CONFLICT on slug → re-select. Two concurrent inserts will see one
    // succeed and the other fall through to the SELECT below.
    const inserted = await tx
      .insert(organizationsTable)
      .values({
        id: newId("org"),
        name: "Personal",
        slug,
        createdByUserId: userId,
      })
      .onConflictDoNothing({ target: organizationsTable.slug })
      .returning();

    let org = inserted[0];
    if (!org) {
      const [row] = await tx
        .select()
        .from(organizationsTable)
        .where(eq(organizationsTable.slug, slug))
        .limit(1);
      if (!row) {
        throw new Error("Failed to create or load personal organization");
      }
      org = row;
    }

    await tx
      .insert(orgMembershipsTable)
      .values({ organizationId: org.id, userId, role: "owner" })
      .onConflictDoNothing();

    return org;
  });
}

async function getUserOrgIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: orgMembershipsTable.organizationId })
    .from(orgMembershipsTable)
    .where(eq(orgMembershipsTable.userId, userId));
  return rows.map((r) => r.id);
}

async function assertProjectAccess(userId: string, projectId: string) {
  const [row] = await db
    .select({
      project: projectsTable,
      membership: orgMembershipsTable,
    })
    .from(projectsTable)
    .innerJoin(
      orgMembershipsTable,
      and(
        eq(orgMembershipsTable.organizationId, projectsTable.organizationId),
        eq(orgMembershipsTable.userId, userId),
      ),
    )
    .where(eq(projectsTable.id, projectId))
    .limit(1);
  if (!row) return null;
  return row.project;
}

router.get("/me", async (req, res) => {
  const userId = getUserId(req);
  const org = await ensurePersonalOrg(userId);
  const orgs = await db
    .select({ org: organizationsTable, role: orgMembershipsTable.role })
    .from(orgMembershipsTable)
    .innerJoin(
      organizationsTable,
      eq(organizationsTable.id, orgMembershipsTable.organizationId),
    )
    .where(eq(orgMembershipsTable.userId, userId))
    .orderBy(organizationsTable.createdAt);
  res.json({
    userId,
    activeOrganization: org,
    organizations: orgs.map((o) => ({ ...o.org, role: o.role })),
  });
});

router.get("/projects", async (req, res) => {
  const userId = getUserId(req);
  await ensurePersonalOrg(userId);
  const orgIds = await getUserOrgIds(userId);
  if (orgIds.length === 0) {
    res.json({ projects: [] });
    return;
  }
  const projects = await db
    .select({
      project: projectsTable,
      orgName: organizationsTable.name,
      keyCount: sql<number>`(select count(*)::int from ${apiKeysTable} where ${apiKeysTable.projectId} = ${projectsTable.id} and ${apiKeysTable.revokedAt} is null)`,
    })
    .from(projectsTable)
    .innerJoin(
      organizationsTable,
      eq(organizationsTable.id, projectsTable.organizationId),
    )
    .where(
      sql`${projectsTable.organizationId} in (${sql.join(
        orgIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    .orderBy(desc(projectsTable.createdAt));
  res.json({
    projects: projects.map((p) => ({
      ...p.project,
      organizationName: p.orgName,
      activeKeyCount: p.keyCount,
    })),
  });
});

const CreateProjectBody = z.object({
  name: z.string().min(1).max(80),
  environment: z.enum(["test", "live"]).default("test"),
});

router.post("/projects", async (req, res) => {
  const userId = getUserId(req);
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Invalid project payload", details: parsed.error.message });
    return;
  }
  const org = await ensurePersonalOrg(userId);
  const id = newId("prj");
  const baseSlug = slugify(parsed.data.name);
  const slug = `${baseSlug}-${shortHash(id, 4)}`;
  const [project] = await db
    .insert(projectsTable)
    .values({
      id,
      organizationId: org.id,
      name: parsed.data.name,
      slug,
      environment: parsed.data.environment,
    })
    .returning();
  res.status(201).json({ project });
});

router.get("/projects/:id", async (req, res) => {
  const userId = getUserId(req);
  const project = await assertProjectAccess(userId, req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      success: sql<number>`count(*) filter (where ${requestLogsTable.statusCode} < 400)::int`,
      failure: sql<number>`count(*) filter (where ${requestLogsTable.statusCode} >= 400)::int`,
      avgDurationMs: sql<number>`coalesce(avg(${requestLogsTable.durationMs})::int, 0)`,
    })
    .from(requestLogsTable)
    .where(
      and(
        eq(requestLogsTable.projectId, project.id),
        sql`${requestLogsTable.createdAt} >= ${since}`,
      ),
    );

  const keyCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(apiKeysTable)
    .where(
      and(eq(apiKeysTable.projectId, project.id), sql`${apiKeysTable.revokedAt} is null`),
    );

  res.json({
    project,
    stats24h: {
      totalRequests: stats?.total ?? 0,
      successRequests: stats?.success ?? 0,
      failureRequests: stats?.failure ?? 0,
      avgDurationMs: stats?.avgDurationMs ?? 0,
    },
    activeKeyCount: keyCount[0]?.count ?? 0,
  });
});

const UpdateProjectBody = z.object({
  name: z.string().min(1).max(80).optional(),
  environment: z.enum(["test", "live"]).optional(),
});

router.patch("/projects/:id", async (req, res) => {
  const userId = getUserId(req);
  const project = await assertProjectAccess(userId, req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Invalid update payload", details: parsed.error.message });
    return;
  }
  const [updated] = await db
    .update(projectsTable)
    .set(parsed.data)
    .where(eq(projectsTable.id, project.id))
    .returning();
  res.json({ project: updated });
});

router.delete("/projects/:id", async (req, res) => {
  const userId = getUserId(req);
  const project = await assertProjectAccess(userId, req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  await db.delete(projectsTable).where(eq(projectsTable.id, project.id));
  res.status(204).end();
});

router.get("/projects/:id/keys", async (req, res) => {
  const userId = getUserId(req);
  const project = await assertProjectAccess(userId, req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const keys = await db
    .select({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      prefix: apiKeysTable.prefix,
      last4: apiKeysTable.last4,
      createdAt: apiKeysTable.createdAt,
      lastUsedAt: apiKeysTable.lastUsedAt,
      revokedAt: apiKeysTable.revokedAt,
    })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.projectId, project.id))
    .orderBy(desc(apiKeysTable.createdAt));
  res.json({ keys });
});

const CreateKeyBody = z.object({
  name: z.string().min(1).max(80),
});

router.post("/projects/:id/keys", async (req, res) => {
  const userId = getUserId(req);
  const project = await assertProjectAccess(userId, req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const parsed = CreateKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Invalid key payload", details: parsed.error.message });
    return;
  }
  const env = project.environment;
  const { fullKey, prefix, last4, keyHash } = generateApiKey(env);
  const id = newId("key");
  const [key] = await db
    .insert(apiKeysTable)
    .values({
      id,
      projectId: project.id,
      name: parsed.data.name,
      prefix,
      last4,
      keyHash,
      createdByUserId: userId,
    })
    .returning({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      prefix: apiKeysTable.prefix,
      last4: apiKeysTable.last4,
      createdAt: apiKeysTable.createdAt,
    });
  res.status(201).json({
    key: {
      ...key,
      fullKey,
    },
    notice:
      "Save this key now — for your security, the full value will not be shown again.",
  });
});

router.post("/projects/:id/keys/:keyId/revoke", async (req, res) => {
  const userId = getUserId(req);
  const project = await assertProjectAccess(userId, req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const [updated] = await db
    .update(apiKeysTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeysTable.id, req.params.keyId),
        eq(apiKeysTable.projectId, project.id),
      ),
    )
    .returning();
  if (!updated) {
    res.status(404).json({ error: "API key not found" });
    return;
  }
  res.json({ ok: true });
});

router.get("/projects/:id/events", async (req, res) => {
  const userId = getUserId(req);
  const project = await assertProjectAccess(userId, req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const rawLimit = Number(req.query.limit ?? 50);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 200)
      : 50;
  const events = await db
    .select()
    .from(requestLogsTable)
    .where(eq(requestLogsTable.projectId, project.id))
    .orderBy(desc(requestLogsTable.createdAt))
    .limit(limit);
  res.json({ events });
});

export default router;
