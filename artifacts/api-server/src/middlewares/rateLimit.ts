import type { Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db, rateLimitBucketsTable } from "@workspace/db";
import { ApiError } from "../lib/errors";

export type BucketKind = "write" | "read";

interface BucketConfig {
  capacity: number;
  refillRate: number; // tokens per second
}

const CONFIG: Record<BucketKind, BucketConfig> = {
  // 60 req/min for register/verify
  write: { capacity: 60, refillRate: 60 / 60 },
  // 600 req/min for stats/nullifier reads
  read: { capacity: 600, refillRate: 600 / 60 },
};

interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  capacity: number;
  resetSeconds: number;
}

async function consumeToken(
  projectId: string,
  kind: BucketKind,
): Promise<ConsumeResult> {
  const cfg = CONFIG[kind];
  // Step 1: lazily refill the bucket. New rows are seeded at full capacity.
  // After this statement the row reflects post-refill tokens (no decrement yet).
  const refilled = await db.execute<{
    tokens: number;
    capacity: number;
    refill_rate: string;
  }>(sql`
    INSERT INTO rate_limit_buckets (project_id, bucket_key, tokens, capacity, refill_rate, last_refill_at)
    VALUES (${projectId}, ${kind}, ${cfg.capacity}, ${cfg.capacity}, ${cfg.refillRate}, now())
    ON CONFLICT (project_id, bucket_key) DO UPDATE
      SET tokens = LEAST(
            rate_limit_buckets.capacity,
            rate_limit_buckets.tokens
              + FLOOR(EXTRACT(EPOCH FROM (now() - rate_limit_buckets.last_refill_at)) * rate_limit_buckets.refill_rate)::int
          ),
          last_refill_at = now()
    RETURNING tokens, capacity, refill_rate
  `);
  const r = (refilled as unknown as { rows: Array<{ tokens: number; capacity: number; refill_rate: string }> }).rows[0];
  const capacity = Number(r.capacity);
  const refillRate = Number(r.refill_rate);
  const refilledTokens = Number(r.tokens);

  // Step 2: try to atomically subtract a token. The WHERE guard ensures we
  // only consume when at least one token is available. A concurrent request
  // can race here — at worst we allow one extra request per bucket per tick,
  // which is the standard tradeoff for fast lock-free rate limiters.
  let allowed = false;
  let remaining = refilledTokens;
  if (refilledTokens >= 1) {
    const after = await db.execute<{ tokens: number }>(sql`
      UPDATE rate_limit_buckets
         SET tokens = tokens - 1
       WHERE project_id = ${projectId}
         AND bucket_key = ${kind}
         AND tokens >= 1
       RETURNING tokens
    `);
    const a = (after as unknown as { rows: Array<{ tokens: number }> }).rows[0];
    if (a) {
      allowed = true;
      remaining = Number(a.tokens);
    }
  }

  const resetSeconds =
    refillRate > 0
      ? Math.max(1, Math.ceil((capacity - remaining) / refillRate))
      : 60;
  return { allowed, remaining, capacity, resetSeconds };
}

export function rateLimit(kind: BucketKind) {
  return async function (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!req.apiContext) {
      next(new Error("rateLimit middleware mounted without apiContext"));
      return;
    }
    try {
      const r = await consumeToken(req.apiContext.project.id, kind);
      res.setHeader("X-RateLimit-Limit", String(r.capacity));
      res.setHeader("X-RateLimit-Remaining", String(r.remaining));
      res.setHeader("X-RateLimit-Reset", String(r.resetSeconds));
      if (!r.allowed) {
        res.setHeader("Retry-After", String(r.resetSeconds));
        next(
          new ApiError({
            code: "rate_limited",
            status: 429,
            message: `Rate limit exceeded for this project. Retry in ${r.resetSeconds}s.`,
          }),
        );
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
