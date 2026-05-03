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
      checks: { db: dbState },
    });
    return;
  }
  res.json({ status: "ready", checks: { db: dbState } });
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
