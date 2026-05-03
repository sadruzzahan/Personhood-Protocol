import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  apiKeysTable,
  projectsTable,
  organizationsTable,
} from "@workspace/db";
import { ApiError } from "../lib/errors";
import { hashApiKey } from "../lib/ids";
import { logger } from "../lib/logger";

const lastUsedDebounce = new Map<string, number>();
const LAST_USED_DEBOUNCE_MS = 60_000;

function scheduleLastUsedUpdate(keyId: string): void {
  const last = lastUsedDebounce.get(keyId) ?? 0;
  const now = Date.now();
  if (now - last < LAST_USED_DEBOUNCE_MS) return;
  lastUsedDebounce.set(keyId, now);
  // Fire-and-forget; we do not block the request on this update.
  process.nextTick(() => {
    db.update(apiKeysTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeysTable.id, keyId))
      .catch((err) => {
        logger.warn({ err, keyId }, "Failed to update api key last_used_at");
      });
  });
}

export async function requireApiKey(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = req.header("authorization");
    if (!auth) {
      throw new ApiError({
        code: "missing_authorization",
        status: 401,
        message:
          "Missing Authorization header. Send `Authorization: Bearer pk_test_…` (find your key at /dashboard).",
      });
    }
    const m = /^Bearer\s+(\S+)$/i.exec(auth);
    if (!m) {
      throw new ApiError({
        code: "missing_authorization",
        status: 401,
        message:
          "Authorization header must be in the form `Bearer pk_test_…` or `Bearer pk_live_…`.",
      });
    }
    const fullKey = m[1];
    if (!/^pk_(test|live)_[A-Z2-7]+$/.test(fullKey)) {
      throw new ApiError({
        code: "invalid_api_key",
        status: 401,
        message: "API key format is not recognized.",
      });
    }

    const keyHash = hashApiKey(fullKey);
    const [row] = await db
      .select({
        key: apiKeysTable,
        project: projectsTable,
        org: organizationsTable,
      })
      .from(apiKeysTable)
      .innerJoin(
        projectsTable,
        eq(projectsTable.id, apiKeysTable.projectId),
      )
      .innerJoin(
        organizationsTable,
        eq(organizationsTable.id, projectsTable.organizationId),
      )
      .where(eq(apiKeysTable.keyHash, keyHash))
      .limit(1);

    if (!row) {
      throw new ApiError({
        code: "invalid_api_key",
        status: 401,
        message: "API key is not recognized.",
      });
    }
    if (row.key.revokedAt) {
      throw new ApiError({
        code: "revoked_api_key",
        status: 401,
        message: "API key has been revoked.",
      });
    }

    const env = fullKey.startsWith("pk_live_") ? "live" : "test";
    req.apiContext = {
      project: row.project,
      org: row.org,
      keyId: row.key.id,
      keyPrefix: row.key.prefix,
      environment: env,
    };

    // Strict CORS for live keys: enforce project allowed_origins on the
    // request's Origin header. Test keys are permissive to make local
    // development painless, as the spec calls out.
    //
    // Empty allowed_origins on a live key = "server-to-server only". Any
    // browser-originated request (i.e. one carrying an Origin header) is
    // rejected. Operators must explicitly opt in to browser traffic by
    // listing origins in /dashboard.
    if (env === "live") {
      const origin = req.header("origin");
      if (origin) {
        const allowed = (row.project.allowedOrigins ?? "")
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean);
        if (allowed.length === 0 || !allowed.includes(origin)) {
          throw new ApiError({
            code: "forbidden_origin",
            status: 403,
            message:
              allowed.length === 0
                ? `Live keys reject browser-originated requests by default. Add ${origin} to this project's allowed origins at /dashboard, or use a server-side environment.`
                : `Origin ${origin} is not in this project's allowed origins. Update them at /dashboard.`,
          });
        }
      }
    }

    scheduleLastUsedUpdate(row.key.id);
    next();
  } catch (err) {
    next(err);
  }
}
