import { createHmac, randomBytes } from "node:crypto";

const NULLIFIER_VERSION = "v1";

let cachedSecret: string | null = null;

/**
 * The master HMAC secret is REQUIRED in every runtime (dev, staging, prod).
 * No code-level fallback is provided: an insecure default would let a
 * misconfigured server silently issue badges whose nullifiers anyone with
 * the well-known fallback could forge. See docs/key-rotation.md.
 */
function loadMasterSecret(): string {
  if (cachedSecret) return cachedSecret;
  const explicit = process.env.NULLIFIER_MASTER_SECRET;
  if (!explicit || explicit.length < 32) {
    throw new Error(
      "NULLIFIER_MASTER_SECRET is required (>=32 chars). " +
        "Generate with `openssl rand -hex 32` and set it as a Replit Secret. " +
        "There is no development fallback; see docs/key-rotation.md.",
    );
  }
  cachedSecret = explicit;
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
