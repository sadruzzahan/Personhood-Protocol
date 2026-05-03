import { createHash, createHmac, randomBytes } from "node:crypto";

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function newId(prefix: string, byteLength = 12): string {
  const bytes = randomBytes(byteLength);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return `${prefix}_${out}`;
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

function resolveApiKeySecret(): string {
  const fromEnv = process.env.API_KEY_HMAC_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "API_KEY_HMAC_SECRET must be set (>=16 chars) in production. " +
        "Generate one with: openssl rand -hex 32",
    );
  }
  // Development-only fallback. Logged once at startup so it cannot silently
  // be used in a deployed environment without notice.
  // eslint-disable-next-line no-console
  console.warn(
    "[ids] API_KEY_HMAC_SECRET unset — using development fallback. " +
      "DO NOT deploy without setting API_KEY_HMAC_SECRET.",
  );
  return "popprotocol-dev-hmac-secret-do-not-use-in-production";
}

const API_KEY_SECRET = resolveApiKeySecret();

export interface NewApiKey {
  fullKey: string;
  prefix: string;
  last4: string;
  keyHash: string;
}

/**
 * Generate a new API key in the format `pk_test_<base32>` and return its
 * components: the full key (shown to user once), the prefix (`pk_test_`),
 * the last4 chars, and the HMAC-SHA256 hash for storage.
 */
export function generateApiKey(env: "test" | "live" = "test"): NewApiKey {
  // 32 bytes of CSPRNG entropy → ~52 base32 chars of secret material.
  const envPrefix = `pk_${env}_`;
  const random = base32(randomBytes(32));
  const fullKey = `${envPrefix}${random}`;
  // Public, key-identifying prefix: env tag + first 8 chars of the secret.
  // Stored/displayed alongside last4 so support can disambiguate keys
  // without ever seeing the full secret. The remaining ~44 chars (~220
  // bits) of entropy are the unguessable secret portion.
  const prefix = `${envPrefix}${random.slice(0, 8)}`;
  const last4 = fullKey.slice(-4);
  const keyHash = createHmac("sha256", API_KEY_SECRET)
    .update(fullKey)
    .digest("hex");
  return { fullKey, prefix, last4, keyHash };
}

export function hashApiKey(fullKey: string): string {
  return createHmac("sha256", API_KEY_SECRET).update(fullKey).digest("hex");
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "untitled";
}

export function shortHash(input: string, len = 6): string {
  return createHash("sha256").update(input).digest("hex").slice(0, len);
}
