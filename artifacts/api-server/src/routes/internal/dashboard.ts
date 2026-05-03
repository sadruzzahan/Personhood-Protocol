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
      avgDurationMs: sql<number>`coalesce(avg(${requestLogsTable.latencyMs})::int, 0)`,
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
  // Comma- or newline-separated origin list. We normalize before persisting.
  allowedOrigins: z.string().max(2000).optional(),
  webhookUrl: z
    .string()
    .max(500)
    .url()
    .optional()
    .or(z.literal("")),
});

function normalizeOrigins(input: string): string {
  return input
    .split(/[\s,]+/)
    .map((o) => o.trim())
    .filter((o) => o.length > 0)
    .join(",");
}

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
  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.environment !== undefined) patch.environment = parsed.data.environment;
  if (parsed.data.allowedOrigins !== undefined) {
    patch.allowedOrigins = normalizeOrigins(parsed.data.allowedOrigins);
  }
  if (parsed.data.webhookUrl !== undefined) {
    patch.webhookUrl = parsed.data.webhookUrl === "" ? null : parsed.data.webhookUrl;
  }
  const [updated] = await db
    .update(projectsTable)
    .set(patch)
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

router.post("/projects/:id/keys/:keyId/rotate", async (req, res) => {
  const userId = getUserId(req);
  const project = await assertProjectAccess(userId, req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [old] = await tx
      .select()
      .from(apiKeysTable)
      .where(
        and(
          eq(apiKeysTable.id, req.params.keyId),
          eq(apiKeysTable.projectId, project.id),
        ),
      )
      .limit(1);
    if (!old) return null;
    if (old.revokedAt) return { error: "Key is already revoked" };

    const env = project.environment;
    const { fullKey, prefix, last4, keyHash } = generateApiKey(env);
    const newId_ = newId("key");
    const [created] = await tx
      .insert(apiKeysTable)
      .values({
        id: newId_,
        projectId: project.id,
        name: old.name,
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
    await tx
      .update(apiKeysTable)
      .set({ revokedAt: new Date(), rotatedToKeyId: created.id })
      .where(eq(apiKeysTable.id, old.id));
    return { key: { ...created, fullKey } };
  });
  if (!result) {
    res.status(404).json({ error: "API key not found" });
    return;
  }
  if ("error" in result) {
    res.status(409).json({ error: result.error });
    return;
  }
  res.status(201).json({
    ...result,
    notice:
      "Save this new key now — for your security, the full value will not be shown again. The previous key has been revoked.",
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
      ? Math.min(Math.floor(rawLimit), 50)
      : 50;
  const events = await db
    .select({
      id: requestLogsTable.id,
      endpoint: requestLogsTable.endpoint,
      statusCode: requestLogsTable.statusCode,
      latencyMs: requestLogsTable.latencyMs,
      ipPrefix: requestLogsTable.ipPrefix,
      requestId: requestLogsTable.requestId,
      errorCode: requestLogsTable.errorCode,
      createdAt: requestLogsTable.createdAt,
    })
    .from(requestLogsTable)
    .where(eq(requestLogsTable.projectId, project.id))
    .orderBy(desc(requestLogsTable.createdAt))
    .limit(limit);
  res.json({ events });
});

router.get("/projects/:id/usage", async (req, res) => {
  const userId = getUserId(req);
  const project = await assertProjectAccess(userId, req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const now = new Date();
  const startOfTodayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const startOfMonthUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const sevenDaysAgo = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6),
  );

  const [today] = await db
    .select({
      total: sql<number>`count(*)::int`,
      success: sql<number>`count(*) filter (where ${requestLogsTable.statusCode} < 400)::int`,
      failure: sql<number>`count(*) filter (where ${requestLogsTable.statusCode} >= 400)::int`,
    })
    .from(requestLogsTable)
    .where(
      and(
        eq(requestLogsTable.projectId, project.id),
        sql`${requestLogsTable.createdAt} >= ${startOfTodayUtc}`,
      ),
    );

  const [month] = await db
    .select({
      total: sql<number>`count(*)::int`,
      success: sql<number>`count(*) filter (where ${requestLogsTable.statusCode} < 400)::int`,
      failure: sql<number>`count(*) filter (where ${requestLogsTable.statusCode} >= 400)::int`,
    })
    .from(requestLogsTable)
    .where(
      and(
        eq(requestLogsTable.projectId, project.id),
        sql`${requestLogsTable.createdAt} >= ${startOfMonthUtc}`,
      ),
    );

  const series = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${requestLogsTable.createdAt}) at time zone 'UTC', 'YYYY-MM-DD')`,
      total: sql<number>`count(*)::int`,
      success: sql<number>`count(*) filter (where ${requestLogsTable.statusCode} < 400)::int`,
      failure: sql<number>`count(*) filter (where ${requestLogsTable.statusCode} >= 400)::int`,
    })
    .from(requestLogsTable)
    .where(
      and(
        eq(requestLogsTable.projectId, project.id),
        sql`${requestLogsTable.createdAt} >= ${sevenDaysAgo}`,
      ),
    )
    .groupBy(sql`date_trunc('day', ${requestLogsTable.createdAt})`)
    .orderBy(sql`date_trunc('day', ${requestLogsTable.createdAt})`);

  // Densify last 7 days so the chart always renders 7 bars.
  const byDay = new Map(series.map((r) => [r.day, r]));
  const last7Days: Array<{ day: string; total: number; success: number; failure: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i),
    );
    const day = d.toISOString().slice(0, 10);
    const row = byDay.get(day);
    last7Days.push({
      day,
      total: row?.total ?? 0,
      success: row?.success ?? 0,
      failure: row?.failure ?? 0,
    });
  }

  res.json({
    today: {
      totalRequests: today?.total ?? 0,
      successRequests: today?.success ?? 0,
      failureRequests: today?.failure ?? 0,
    },
    month: {
      totalRequests: month?.total ?? 0,
      successRequests: month?.success ?? 0,
      failureRequests: month?.failure ?? 0,
    },
    last7Days,
  });
});

export default router;
