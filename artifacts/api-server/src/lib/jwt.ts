import {
  exportJWK,
  importPKCS8,
  importSPKI,
  jwtVerify,
  SignJWT,
  type JWK,
  type JWSHeaderParameters,
} from "jose";
import { logger } from "./logger";

const ALG = "RS256";
const BADGE_TTL_SECONDS = 24 * 60 * 60;

export interface HumanBadgeClaims {
  iss: string;
  // The badge subject is the per-registration commitment hash. We deliberately
  // do NOT embed the underlying vendor subject identifier in the badge —
  // that would create a stable cross-app linker and weaken unlinkability.
  // /verify recomputes correctness by looking up the commitment in the
  // server-side registry, not by trusting any client-supplied subject.
  sub: string;
  aud: string;
  nullifier: string;
  app_context: string;
  iat: number;
  exp: number;
}

interface SigningKeypair {
  kid: string;
  privatePem: string;
  publicPem: string;
}

interface ResolvedKeyMaterial {
  active: SigningKeypair;
  // Public-key map keyed by kid so previously-issued badges still verify
  // during a deprecation window (deprecated keys are loaded from
  // JWT_DEPRECATED_PUBLIC_KEYS_JSON, see loadKeys()).
  publicByKid: Map<string, { publicPem: string; alg: string }>;
}

let resolved: ResolvedKeyMaterial | null = null;
// Caches of the parsed crypto key objects keyed by kid so we don't pay
// the import cost on every sign/verify.
const privateKeyCache = new Map<string, Awaited<ReturnType<typeof importPKCS8>>>();
const publicKeyCache = new Map<string, Awaited<ReturnType<typeof importSPKI>>>();

function issuer(): string {
  return process.env.JWT_ISSUER ?? "https://proof-of-personhood.local";
}

/**
 * Load JWT signing material from environment variables. In production all
 * three of JWT_PRIVATE_KEY_PEM, JWT_PUBLIC_KEY_PEM, JWT_KID are required —
 * we throw on startup if any is missing so the server fails fast instead
 * of silently issuing badges from an ephemeral key.
 *
 * In development we tolerate missing keys by generating a per-process
 * ephemeral keypair and logging a loud warning. Restarting the dev server
 * invalidates previously-issued badges, which is the desired loud signal.
 *
 * Optional JWT_DEPRECATED_PUBLIC_KEYS_JSON can hold an array of
 * { kid, publicPem } entries so badges signed by a previously-active key
 * still verify after rotation.
 */
function loadKeys(): ResolvedKeyMaterial {
  if (resolved) return resolved;

  const privatePem = process.env.JWT_PRIVATE_KEY_PEM;
  const publicPem = process.env.JWT_PUBLIC_KEY_PEM;
  const kid = process.env.JWT_KID;

  if (!privatePem || !publicPem || !kid) {
    throw new Error(
      "JWT signing keys are required in every runtime — set JWT_PRIVATE_KEY_PEM, JWT_PUBLIC_KEY_PEM and JWT_KID as Replit Secrets. Generate with `openssl genrsa 2048 | tee /tmp/p.pem | openssl pkcs8 -topk8 -nocrypt && openssl rsa -in /tmp/p.pem -pubout`. There is no development fallback; see docs/key-rotation.md.",
    );
  }
  const active: SigningKeypair = { kid, privatePem, publicPem };

  const publicByKid = new Map<string, { publicPem: string; alg: string }>();
  publicByKid.set(active.kid, { publicPem: active.publicPem, alg: ALG });

  const deprecatedRaw = process.env.JWT_DEPRECATED_PUBLIC_KEYS_JSON;
  if (deprecatedRaw) {
    try {
      const parsed = JSON.parse(deprecatedRaw) as Array<{
        kid: string;
        publicPem: string;
        alg?: string;
      }>;
      for (const entry of parsed) {
        if (entry?.kid && entry?.publicPem && !publicByKid.has(entry.kid)) {
          publicByKid.set(entry.kid, {
            publicPem: entry.publicPem,
            alg: entry.alg ?? ALG,
          });
        }
      }
    } catch (err) {
      logger.error({ err }, "Failed to parse JWT_DEPRECATED_PUBLIC_KEYS_JSON");
    }
  }

  resolved = { active, publicByKid };
  return resolved;
}

/**
 * Boot-time hook. Throws if signing keys are required but absent. Safe to
 * call multiple times — subsequent calls hit the cached resolution.
 */
export function ensureSigningKey(): void {
  loadKeys();
}

export async function signHumanBadge(args: {
  commitmentHash: string;
  audience: string; // project id
  nullifier: string;
  appContext: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const { active } = loadKeys();
  let privateKey = privateKeyCache.get(active.kid);
  if (!privateKey) {
    privateKey = await importPKCS8(active.privatePem, ALG);
    privateKeyCache.set(active.kid, privateKey);
  }
  const now = Math.floor(Date.now() / 1000);
  const exp = now + BADGE_TTL_SECONDS;
  const token = await new SignJWT({
    nullifier: args.nullifier,
    app_context: args.appContext,
  })
    .setProtectedHeader({ alg: ALG, kid: active.kid, typ: "JWT" })
    .setIssuer(issuer())
    .setSubject(args.commitmentHash)
    .setAudience(args.audience)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey);
  return { token, expiresAt: new Date(exp * 1000) };
}

async function resolveKey(header: JWSHeaderParameters) {
  const kid = header.kid;
  if (!kid) throw new Error("JWT missing kid header");
  const cached = publicKeyCache.get(kid);
  if (cached) return cached;
  const { publicByKid } = loadKeys();
  const entry = publicByKid.get(kid);
  if (!entry) throw new Error(`Unknown signing key: ${kid}`);
  const key = await importSPKI(entry.publicPem, entry.alg);
  publicKeyCache.set(kid, key);
  return key;
}

export async function verifyHumanBadge(token: string): Promise<HumanBadgeClaims> {
  const { payload } = await jwtVerify(token, resolveKey, {
    issuer: issuer(),
    algorithms: [ALG],
  });
  return payload as unknown as HumanBadgeClaims;
}

/**
 * Public keys for /.well-known/jwks.json. Includes the active key plus
 * any deprecated keys still in the publication window.
 */
export async function listPublicJwks(): Promise<{ keys: JWK[] }> {
  const { publicByKid } = loadKeys();
  const keys: JWK[] = await Promise.all(
    Array.from(publicByKid.entries()).map(async ([kid, entry]) => {
      const pub = await importSPKI(entry.publicPem, entry.alg);
      const jwk = await exportJWK(pub);
      return { ...jwk, kid, alg: entry.alg, use: "sig" } as JWK;
    }),
  );
  return { keys };
}
