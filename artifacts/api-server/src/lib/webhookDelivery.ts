import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import { db, webhookDeliveriesTable, projectsTable } from "@workspace/db";
import { newId } from "./ids";
import { logger } from "./logger";
import { signWebhookPayload, generateWebhookSigningSecret } from "./webhookSigner";

/**
 * Retry schedule (delays before each retry, measured from the *previous*
 * attempt). 1 initial attempt + 6 retries = 7 total attempts spread over
 * ~32h. Matches the README in docs/RUNBOOK.md.
 */
export const RETRY_SCHEDULE_MS: readonly number[] = [
  1 * 60_000, // 1 minute
  5 * 60_000, // 5 minutes
  30 * 60_000, // 30 minutes
  2 * 60 * 60_000, // 2 hours
  6 * 60 * 60_000, // 6 hours
  24 * 60 * 60_000, // 24 hours
] as const;

const MAX_ATTEMPTS = 1 + RETRY_SCHEDULE_MS.length;
const RESPONSE_PREVIEW_BYTES = 512;
const HTTP_TIMEOUT_MS = 10_000;
const POLLER_INTERVAL_MS = 5_000;
const POLLER_BATCH = 25;

let pollerHandle: NodeJS.Timeout | null = null;
let pollerRunning = false;

export type WebhookEventType = "verification.completed" | "webhook.test";

export interface WebhookEventEnvelope {
  id: string;
  type: WebhookEventType;
  created: number; // unix seconds
  data: Record<string, unknown>;
}

/**
 * Ensures the project has a `webhook_signing_secret`. If absent, atomically
 * generates one and persists it. Returns the secret. Concurrent calls are
 * resolved by the WHERE-clause guard: only the first writer's value is kept.
 */
export async function ensureWebhookSigningSecret(projectId: string): Promise<string> {
  const [existing] = await db
    .select({ secret: projectsTable.webhookSigningSecret })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);
  if (existing?.secret) return existing.secret;

  const fresh = generateWebhookSigningSecret();
  // Only set if still NULL — losers of the race read back the winner's value.
  await db
    .update(projectsTable)
    .set({ webhookSigningSecret: fresh })
    .where(
      and(eq(projectsTable.id, projectId), sql`${projectsTable.webhookSigningSecret} is null`),
    );
  const [after] = await db
    .select({ secret: projectsTable.webhookSigningSecret })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);
  if (!after?.secret) {
    throw new Error("Failed to materialize webhook signing secret");
  }
  return after.secret;
}

/**
 * Rotate the project's signing secret. Returns the new secret. In-flight
 * deliveries that have already snapshotted the old secret will continue to
 * sign with it (matches Stripe — rotation does not break in-flight retries).
 */
export async function rotateWebhookSigningSecret(projectId: string): Promise<string> {
  const fresh = generateWebhookSigningSecret();
  await db
    .update(projectsTable)
    .set({ webhookSigningSecret: fresh })
    .where(eq(projectsTable.id, projectId));
  return fresh;
}

interface EnqueueArgs {
  projectId: string;
  eventType: WebhookEventType;
  data: Record<string, unknown>;
  // Optional explicit eventId so callers (test events, redeliveries) can
  // control dedup. Defaults to a random `evt_…`.
  eventId?: string;
}

/**
 * Enqueue a delivery row. Idempotent on (projectId, eventId): a duplicate
 * insert returns the existing row. No-op (returns null) when the project
 * has no webhookUrl configured — we don't queue deliveries to nowhere.
 */
export async function enqueueWebhook(args: EnqueueArgs): Promise<{ id: string } | null> {
  const [project] = await db
    .select({
      id: projectsTable.id,
      url: projectsTable.webhookUrl,
      secret: projectsTable.webhookSigningSecret,
    })
    .from(projectsTable)
    .where(eq(projectsTable.id, args.projectId))
    .limit(1);
  if (!project) return null;
  if (!project.url) return null;

  // Lazy-materialize the signing secret on first use so projects that never
  // enabled webhooks don't carry a secret in the DB.
  const secret = project.secret ?? (await ensureWebhookSigningSecret(args.projectId));

  const eventId = args.eventId ?? newId("evt");
  const envelope: WebhookEventEnvelope = {
    id: eventId,
    type: args.eventType,
    created: Math.floor(Date.now() / 1000),
    data: args.data,
  };
  const id = newId("whd");
  const now = new Date();
  try {
    await db.insert(webhookDeliveriesTable).values({
      id,
      projectId: args.projectId,
      eventId,
      eventType: args.eventType,
      payload: envelope as unknown as Record<string, unknown>,
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: now,
      targetUrl: project.url,
      signingSecretSnapshot: secret,
    });
    return { id };
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      // Duplicate (projectId, eventId) — return existing row.
      const [existing] = await db
        .select({ id: webhookDeliveriesTable.id })
        .from(webhookDeliveriesTable)
        .where(
          and(
            eq(webhookDeliveriesTable.projectId, args.projectId),
            eq(webhookDeliveriesTable.eventId, eventId),
          ),
        )
        .limit(1);
      return existing ?? null;
    }
    throw err;
  }
}

/**
 * Returns the delay (ms) before the Nth retry, where attempt 0 was the
 * initial delivery, attempt 1 is the first retry, etc. Returns null when
 * the schedule is exhausted (caller should mark the row abandoned).
 */
export function delayBeforeAttempt(attempt: number): number | null {
  // attempt is the *upcoming* attempt count after a failure: initial=0
  // failed → attempt=1 next, schedule index 0.
  if (attempt < 1 || attempt - 1 >= RETRY_SCHEDULE_MS.length) return null;
  return RETRY_SCHEDULE_MS[attempt - 1];
}

interface DeliverOnceResult {
  ok: boolean;
  status?: number;
  preview?: string;
  durationMs: number;
  error?: string;
}

/**
 * Performs a single HTTP POST attempt. Never throws — all transport
 * failures are returned as `{ ok: false, error }`. Caller is responsible
 * for updating the DB row with the result.
 */
export async function deliverOnce(args: {
  url: string;
  body: string;
  signatureHeader: string;
  eventId: string;
  eventType: string;
  // Injection point for tests.
  fetchImpl?: typeof fetch;
}): Promise<DeliverOnceResult> {
  const started = Date.now();
  const fetchFn = args.fetchImpl ?? fetch;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetchFn(args.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "ProofOfPerson-Webhooks/1.0",
        "pop-signature": args.signatureHeader,
        "pop-event-id": args.eventId,
        "pop-event-type": args.eventType,
      },
      body: args.body,
      signal: controller.signal,
    });
    let preview = "";
    try {
      const text = await res.text();
      preview = text.slice(0, RESPONSE_PREVIEW_BYTES);
    } catch {
      // ignore body read errors — status alone is enough to decide
    }
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      preview,
      durationMs: Date.now() - started,
      error: res.status >= 200 && res.status < 300 ? undefined : "non_2xx",
    };
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name;
    const code = (err as { code?: string })?.code;
    const msg = (err as { message?: string })?.message ?? String(err);
    return {
      ok: false,
      durationMs: Date.now() - started,
      error: name === "AbortError" ? "timeout" : code ?? msg.slice(0, 120),
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Process up to `POLLER_BATCH` due deliveries. Visible for tests.
 *
 * Single-instance invariant — there is no `claimed_by` lease column. When
 * the API server is scaled to >1 replica, two pollers can pick the same
 * row and double-deliver. This is documented in docs/RUNBOOK.md as a
 * known limitation; before scaling we'll add a `FOR UPDATE SKIP LOCKED`
 * lease. For now the deployment is autoscale=1 (config in `.replit`).
 */
export async function processDueDeliveries(opts?: {
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<{ processed: number }> {
  const now = opts?.now ?? new Date();
  const due = await db
    .select()
    .from(webhookDeliveriesTable)
    .where(
      and(
        or(
          eq(webhookDeliveriesTable.status, "pending"),
          eq(webhookDeliveriesTable.status, "failed"),
        )!,
        lte(webhookDeliveriesTable.nextAttemptAt, now),
      ),
    )
    .orderBy(asc(webhookDeliveriesTable.nextAttemptAt))
    .limit(POLLER_BATCH);

  let processed = 0;
  for (const row of due) {
    processed += 1;
    const body = JSON.stringify(row.payload);
    const sig = signWebhookPayload({ payload: body, secret: row.signingSecretSnapshot });
    const result = await deliverOnce({
      url: row.targetUrl,
      body,
      signatureHeader: sig.header,
      eventId: row.eventId,
      eventType: row.eventType,
      fetchImpl: opts?.fetchImpl,
    });
    const newAttemptCount = row.attemptCount + 1;
    const baseUpdate = {
      attemptCount: newAttemptCount,
      lastAttemptedAt: now,
      lastResponseStatus: result.status ?? null,
      lastResponseBodyPreview: result.preview ?? null,
      lastResponseTimeMs: result.durationMs,
      lastError: result.error ?? null,
      updatedAt: now,
    } as const;
    if (result.ok) {
      await db
        .update(webhookDeliveriesTable)
        .set({
          ...baseUpdate,
          status: "delivered",
          nextAttemptAt: null,
          lastError: null,
        })
        .where(eq(webhookDeliveriesTable.id, row.id));
      continue;
    }
    const delayMs = delayBeforeAttempt(newAttemptCount);
    if (delayMs === null || newAttemptCount >= MAX_ATTEMPTS) {
      await db
        .update(webhookDeliveriesTable)
        .set({ ...baseUpdate, status: "abandoned", nextAttemptAt: null })
        .where(eq(webhookDeliveriesTable.id, row.id));
      logger.warn(
        {
          deliveryId: row.id,
          projectId: row.projectId,
          eventId: row.eventId,
          attempts: newAttemptCount,
          lastError: result.error,
        },
        "Webhook delivery abandoned after max attempts",
      );
      continue;
    }
    const next = new Date(now.getTime() + delayMs);
    await db
      .update(webhookDeliveriesTable)
      .set({ ...baseUpdate, status: "pending", nextAttemptAt: next })
      .where(eq(webhookDeliveriesTable.id, row.id));
  }
  return { processed };
}

export function startWebhookPoller(): void {
  if (pollerHandle) return;
  pollerHandle = setInterval(() => {
    if (pollerRunning) return;
    pollerRunning = true;
    processDueDeliveries()
      .catch((err) => {
        logger.error({ err }, "Webhook poller iteration failed");
      })
      .finally(() => {
        pollerRunning = false;
      });
  }, POLLER_INTERVAL_MS);
  // Don't keep the process alive solely for the poller.
  pollerHandle.unref?.();
  logger.info({ intervalMs: POLLER_INTERVAL_MS }, "Webhook poller started");
}

export function stopWebhookPoller(): void {
  if (pollerHandle) {
    clearInterval(pollerHandle);
    pollerHandle = null;
  }
}
