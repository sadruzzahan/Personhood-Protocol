import { createHmac, randomBytes } from "node:crypto";
import { logger } from "./logger";

const NULLIFIER_VERSION = "v1";

let cachedSecret: string | null = null;

function loadMasterSecret(): string {
  if (cachedSecret) return cachedSecret;
  const explicit = process.env.NULLIFIER_MASTER_SECRET;
  if (explicit && explicit.length >= 32) {
    cachedSecret = explicit;
    return cachedSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NULLIFIER_MASTER_SECRET is required in production (>=32 chars). " +
        "Generate with `openssl rand -hex 32`.",
    );
  }
  // Dev fallback: stable, clearly-marked, NOT for production.
  cachedSecret =
    "dev-only-nullifier-master-secret-do-not-use-in-production-0000000000";
  logger.warn(
    "NULLIFIER_MASTER_SECRET not set — using insecure development fallback",
  );
  return cachedSecret;
}

function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

/**
 * Per-app, deterministic. Same (subject, appContext) ⇒ same nullifier.
 * Different appContexts for the same subject yield uncorrelated nullifiers,
 * so a single human cannot be tracked across apps.
 */
export function deriveNullifier(subjectId: string, appContext: string): string {
  return hmacHex(
    loadMasterSecret(),
    `${NULLIFIER_VERSION}|nullifier|${subjectId}|${appContext}`,
  );
}

/**
 * Per-registration, randomized. Used as a public commitment id; cannot
 * be reversed to recover the subject.
 */
export function deriveCommitment(subjectId: string): {
  commitmentHash: string;
  salt: string;
} {
  const salt = randomBytes(16).toString("hex");
  const commitmentHash = hmacHex(
    loadMasterSecret(),
    `${NULLIFIER_VERSION}|commitment|${subjectId}|${salt}`,
  );
  return { commitmentHash, salt };
}

/** Throws on startup if the master secret is missing in production. */
export function ensureNullifierSecretLoaded(): void {
  loadMasterSecret();
}
