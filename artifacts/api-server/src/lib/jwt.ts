import { generateKeyPairSync, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  exportJWK,
  importPKCS8,
  importSPKI,
  jwtVerify,
  SignJWT,
  type JWK,
} from "jose";
import { db, jwtKeysTable, type JwtKey } from "@workspace/db";
import { logger } from "./logger";

const ALG = "RS256";
const BADGE_TTL_SECONDS = 24 * 60 * 60;

export interface HumanBadgeClaims {
  iss: string;
  sub: string;
  aud: string;
  nullifier: string;
  app_context: string;
  iat: number;
  exp: number;
}

/** Cache the active key in memory to avoid a DB round-trip per signature. */
let activeKeyCache: { key: JwtKey; expiresAt: number } | null = null;
const ACTIVE_KEY_CACHE_MS = 60_000;

function issuer(): string {
  return process.env.JWT_ISSUER ?? "https://proof-of-personhood.local";
}

async function loadActiveKey(): Promise<JwtKey> {
  if (activeKeyCache && activeKeyCache.expiresAt > Date.now()) {
    return activeKeyCache.key;
  }
  const [active] = await db
    .select()
    .from(jwtKeysTable)
    .where(eq(jwtKeysTable.status, "active"))
    .limit(1);
  if (!active) {
    throw new Error(
      "No active JWT signing key found. ensureSigningKey() must run on boot.",
    );
  }
  activeKeyCache = { key: active, expiresAt: Date.now() + ACTIVE_KEY_CACHE_MS };
  return active;
}

/** Generate an RSA-2048 keypair and persist it as the active key. */
async function generateAndPersistActive(): Promise<JwtKey> {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const kid = `kid_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const inserted = await db
    .insert(jwtKeysTable)
    .values({
      kid,
      publicPem: publicKey,
      privatePem: privateKey,
      alg: ALG,
      status: "active",
    })
    .returning();
  logger.info({ kid }, "Generated new JWT signing key (RS256)");
  activeKeyCache = { key: inserted[0], expiresAt: Date.now() + ACTIVE_KEY_CACHE_MS };
  return inserted[0];
}

/** Boot-time hook. Idempotent: only generates a key if no active one exists. */
export async function ensureSigningKey(): Promise<void> {
  const [existing] = await db
    .select({ kid: jwtKeysTable.kid })
    .from(jwtKeysTable)
    .where(eq(jwtKeysTable.status, "active"))
    .limit(1);
  if (existing) return;
  await generateAndPersistActive();
}

export async function signHumanBadge(args: {
  commitmentHash: string;
  audience: string; // project id
  nullifier: string;
  appContext: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const key = await loadActiveKey();
  const privateKey = await importPKCS8(key.privatePem, ALG);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + BADGE_TTL_SECONDS;
  const token = await new SignJWT({
    nullifier: args.nullifier,
    app_context: args.appContext,
  })
    .setProtectedHeader({ alg: ALG, kid: key.kid, typ: "JWT" })
    .setIssuer(issuer())
    .setSubject(args.commitmentHash)
    .setAudience(args.audience)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey);
  return { token, expiresAt: new Date(exp * 1000) };
}

export async function verifyHumanBadge(token: string): Promise<HumanBadgeClaims> {
  // Resolve key by kid from the header so deprecated keys still verify
  // until they are removed from the JWKS.
  const { resolveKey } = await import("./jwksResolver");
  const { payload } = await jwtVerify(token, resolveKey, {
    issuer: issuer(),
    algorithms: [ALG],
  });
  // jose returns the standard claims plus our custom ones; the cast is
  // safe because we set them ourselves at sign time.
  return payload as unknown as HumanBadgeClaims;
}

/**
 * Public keys for /.well-known/jwks.json. Includes deprecated keys too,
 * so already-issued badges signed with the previous active key still
 * verify during the deprecation grace period (manual cleanup via runbook
 * removes the row entirely once retired).
 */
export async function listPublicJwks(): Promise<{ keys: JWK[] }> {
  const rows = await db.select().from(jwtKeysTable);
  const keys: JWK[] = await Promise.all(
    rows.map(async (row) => {
      const pub = await importSPKI(row.publicPem, row.alg);
      const jwk = await exportJWK(pub);
      return { ...jwk, kid: row.kid, alg: row.alg, use: "sig" } as JWK;
    }),
  );
  return { keys };
}
