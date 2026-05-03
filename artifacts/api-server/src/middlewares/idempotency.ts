import type { Request, Response, NextFunction } from "express";
import { createHash } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db, idempotencyRecordsTable } from "@workspace/db";
import { ApiError } from "../lib/errors";
import { logger } from "../lib/logger";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function bodyHash(body: unknown): string {
  const json = JSON.stringify(body ?? null);
  return createHash("sha256").update(json).digest("hex");
}

export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const key = req.header("idempotency-key");
  if (!key) {
    next();
    return;
  }
  if (!req.apiContext) {
    next(new Error("idempotencyMiddleware mounted without apiContext"));
    return;
  }
  if (key.length > 200) {
    next(
      new ApiError({
        code: "validation_error",
        status: 400,
        message: "Idempotency-Key must be 200 chars or fewer.",
      }),
    );
    return;
  }
  try {
    const requestHash = bodyHash(req.body);
    const projectId = req.apiContext.project.id;
    const cutoff = new Date(Date.now() - IDEMPOTENCY_TTL_MS);

    // Atomically reserve the key. We insert a "pending" placeholder
    // (response_status = 0, body = ""). If another request already
    // reserved or completed this key, the insert no-ops and we fall
    // through to the lookup-and-replay path. This closes the
    // concurrent-same-key race window.
    const reserved = await db
      .insert(idempotencyRecordsTable)
      .values({
        projectId,
        key,
        requestHash,
        responseStatus: 0,
        responseBody: "",
        requestId: req.requestId,
      })
      .onConflictDoNothing()
      .returning({ key: idempotencyRecordsTable.key });

    if (reserved.length === 0) {
      // Existing row. Check it.
      const [existing] = await db
        .select()
        .from(idempotencyRecordsTable)
        .where(
          and(
            eq(idempotencyRecordsTable.projectId, projectId),
            eq(idempotencyRecordsTable.key, key),
          ),
        )
        .limit(1);

      if (existing && existing.createdAt > cutoff) {
        if (existing.requestHash !== requestHash) {
          next(
            new ApiError({
              code: "idempotency_conflict",
              status: 409,
              message:
                "Idempotency-Key was reused with a different request body within the 24h window.",
            }),
          );
          return;
        }
        if (existing.responseStatus === 0) {
          // A concurrent request is still in-flight. Surface this
          // explicitly so clients know to retry shortly.
          res.setHeader("Retry-After", "1");
          next(
            new ApiError({
              code: "idempotency_in_progress",
              status: 409,
              message:
                "An earlier request with this Idempotency-Key is still in progress. Retry shortly.",
            }),
          );
          return;
        }
        res.setHeader("Idempotent-Replayed", "true");
        res.status(existing.responseStatus);
        res.type("application/json").send(existing.responseBody);
        return;
      }

      // Existing row but past TTL — replace it so the new request can
      // proceed. Without this the unique constraint would silently
      // block reuse of an expired key until the hourly sweeper runs.
      await db
        .delete(idempotencyRecordsTable)
        .where(
          and(
            eq(idempotencyRecordsTable.projectId, projectId),
            eq(idempotencyRecordsTable.key, key),
          ),
        );
      await db
        .insert(idempotencyRecordsTable)
        .values({
          projectId,
          key,
          requestHash,
          responseStatus: 0,
          responseBody: "",
          requestId: req.requestId,
        })
        .onConflictDoNothing();
    }

    req.idempotency = { key, requestHash };

    // Patch res.json so we update the reservation row on the way out
    // with the real status + body.
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      const status = res.statusCode || 200;
      const serialized = JSON.stringify(body);
      // Store async; failure here must not break the response.
      process.nextTick(async () => {
        try {
          await db
            .update(idempotencyRecordsTable)
            .set({
              responseStatus: status,
              responseBody: serialized,
              requestHash,
            })
            .where(
              and(
                eq(idempotencyRecordsTable.projectId, projectId),
                eq(idempotencyRecordsTable.key, key),
              ),
            );
        } catch (err) {
          logger.warn(
            { err, key, projectId },
            "Failed to persist idempotency record",
          );
        }
      });
      return originalJson(body);
    };

    // If the handler errors out and never calls res.json, leave the
    // pending reservation to expire — but bound it so a single failed
    // call doesn't block retries for 24 h. Clean up on response close
    // when status is still 0.
    res.on("close", () => {
      if (res.statusCode >= 500 || !res.writableEnded) {
        process.nextTick(async () => {
          try {
            await db
              .delete(idempotencyRecordsTable)
              .where(
                and(
                  eq(idempotencyRecordsTable.projectId, projectId),
                  eq(idempotencyRecordsTable.key, key),
                  eq(idempotencyRecordsTable.responseStatus, 0),
                ),
              );
          } catch (err) {
            logger.warn(
              { err, key, projectId },
              "Failed to clear pending idempotency reservation",
            );
          }
        });
      }
    });

    next();
  } catch (err) {
    next(err);
  }
}

export function startIdempotencyCleanup(): NodeJS.Timeout {
  // Runs hourly. Removes records older than the TTL.
  const timer = setInterval(
    async () => {
      try {
        const cutoff = new Date(Date.now() - IDEMPOTENCY_TTL_MS);
        await db
          .delete(idempotencyRecordsTable)
          .where(lt(idempotencyRecordsTable.createdAt, cutoff));
      } catch (err) {
        logger.warn({ err }, "Idempotency cleanup failed");
      }
    },
    60 * 60 * 1000,
  );
  // Don't keep the event loop alive solely for this timer.
  timer.unref();
  return timer;
}
