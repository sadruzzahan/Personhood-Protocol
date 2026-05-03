import type { Request, Response, NextFunction } from "express";
import { db, requestLogsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { newId } from "../lib/ids";

interface QueuedLog {
  projectId: string | null;
  apiKeyId: string | null;
  method: string;
  endpoint: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  ipPrefix: string | null;
  requestId: string;
  errorCode: string | null;
}

const MAX_QUEUE = 500;
const queue: QueuedLog[] = [];
let dropped = 0;
let flushing = false;

function schedule(): void {
  if (flushing) return;
  flushing = true;
  process.nextTick(async () => {
    while (queue.length > 0) {
      const batch = queue.splice(0, 50);
      try {
        await db
          .insert(requestLogsTable)
          .values(
            batch.map((b) => ({
              id: newId("rlg"),
              projectId: b.projectId,
              apiKeyId: b.apiKeyId,
              method: b.method,
              endpoint: b.endpoint,
              path: b.path,
              statusCode: b.statusCode,
              latencyMs: b.latencyMs,
              ipPrefix: b.ipPrefix,
              requestId: b.requestId,
              errorCode: b.errorCode,
            })),
          );
      } catch (err) {
        logger.warn({ err, count: batch.length }, "request_logs batch insert failed");
      }
    }
    if (dropped > 0) {
      logger.warn({ dropped }, "request_logs queue overflow — dropped entries");
      dropped = 0;
    }
    flushing = false;
  });
}

function ipPrefixOf(req: Request): string | null {
  const raw = (req.ip ?? req.socket.remoteAddress ?? "").trim();
  if (!raw) return null;
  // IPv6 -> /64, IPv4 -> /24
  if (raw.includes(":")) {
    const parts = raw.split(":").slice(0, 4);
    while (parts.length < 4) parts.push("0");
    return `${parts.join(":")}::/64`;
  }
  const parts = raw.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  return null;
}

function endpointFor(method: string, routePath: string): string {
  // Normalize parameterized paths so they aggregate well in dashboards.
  // Strip `/api` prefix because logs are scoped per-project + endpoint.
  const trimmed = routePath.replace(/^\/api/, "").replace(/^\//, "");
  return `${method} /${trimmed}`;
}

/**
 * Mounted on the public router *before* requireApiKey so that auth-rejected
 * requests are also persisted (with project_id = null). Project attribution
 * is filled in if/when apiKeyAuth populates req.apiContext.
 *
 * Skips internal observability paths (/_demo/api-key, /healthz, /readyz)
 * because they don't carry any per-project signal worth aggregating.
 */
const SKIP_PATHS = new Set(["/_demo/api-key", "/healthz", "/readyz"]);

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SKIP_PATHS.has(req.path)) {
    next();
    return;
  }
  const start = Date.now();
  res.on("finish", () => {
    const log: QueuedLog = {
      projectId: req.apiContext?.project.id ?? null,
      apiKeyId: req.apiContext?.keyId ?? null,
      method: req.method,
      endpoint: endpointFor(req.method, req.baseUrl + (req.route?.path ?? req.path)),
      path: req.originalUrl.split("?")[0],
      statusCode: res.statusCode,
      latencyMs: Date.now() - start,
      ipPrefix: ipPrefixOf(req),
      requestId: req.requestId,
      errorCode: res.locals.errorCode ?? null,
    };
    if (queue.length >= MAX_QUEUE) {
      dropped++;
      return;
    }
    queue.push(log);
    schedule();
  });
  next();
}
