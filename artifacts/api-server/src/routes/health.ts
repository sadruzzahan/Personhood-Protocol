import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { ensureDemoApiKey, getCachedDemoApiKey } from "../lib/demoBootstrap";

const router: IRouter = Router();

async function pingDb(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await db.execute(sql`select 1`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    logger.warn({ err }, "Healthcheck DB ping failed");
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Tables the server requires to be present before it can serve traffic.
// We don't use a separate migration runner — schema is bootstrapped on
// process start — so readiness verifies that bootstrap actually completed
// rather than just that Postgres is reachable.
const REQUIRED_TABLES = [
  "organizations",
  "org_memberships",
  "projects",
  "api_keys",
  "commitments",
  "verification_stats",
  "rate_limit_buckets",
  "idempotency_records",
  "request_logs",
] as const;

async function checkSchema(): Promise<{ ok: boolean; missing: string[]; error?: string }> {
  try {
    const result = await db.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
    `);
    const rows = (result as unknown as { rows: Array<{ table_name: string }> }).rows;
    const present = new Set(rows.map((r) => r.table_name));
    const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
    return { ok: missing.length === 0, missing };
  } catch (err) {
    return {
      ok: false,
      missing: [...REQUIRED_TABLES],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

router.get("/healthz", async (_req, res) => {
  const dbState = await pingDb();
  if (!dbState.ok) {
    res.status(503).json({
      status: "degraded",
      checks: { db: dbState },
    });
    return;
  }
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json({ ...data, checks: { db: dbState } });
});

router.get("/readyz", async (_req, res) => {
  const dbState = await pingDb();
  if (!dbState.ok) {
    res.status(503).json({
      status: "not_ready",
      checks: { db: dbState, schema: { ok: false, missing: [] } },
    });
    return;
  }
  const schemaState = await checkSchema();
  if (!schemaState.ok) {
    res.status(503).json({
      status: "not_ready",
      checks: { db: dbState, schema: schemaState },
    });
    return;
  }
  res.json({
    status: "ready",
    checks: { db: dbState, schema: schemaState },
  });
});

// Public, intentionally-shared demo key for the marketing playground on the
// protocol site. Bound to the "demo" project (test environment), with normal
// per-project rate limits, no origin restrictions. Anyone may use it.
//
// Gated: enabled by default in non-production runtimes; in production it must
// be explicitly turned on with ENABLE_PUBLIC_DEMO_KEY=1. This keeps deploys
// of the API server that don't host a public demo from inadvertently exposing
// a working test-tier key.
const demoKeyEndpointEnabled =
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_PUBLIC_DEMO_KEY === "1";

if (demoKeyEndpointEnabled) {
  router.get("/_demo/api-key", async (_req, res, next) => {
    try {
      const cached = getCachedDemoApiKey();
      const apiKey = cached ?? (await ensureDemoApiKey());
      res.json({ apiKey, environment: "test" });
    } catch (err) {
      next(err);
    }
  });
}

export default router;
