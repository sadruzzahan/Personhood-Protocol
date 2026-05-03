/**
 * @proofofperson/server — verify human-badge JWTs in your backend.
 *
 * The badge is an RS256 JWT signed against the public JWKS at
 * `<base>/.well-known/jwks.json`. Verification is fully offline once the
 * JWKS is cached. Verifies signature, issuer, audience, expiration, and
 * the per-app `app_context` claim in one call.
 *
 * It also implements the `Pop-Signature: t=<unix>,v1=<hex>` HMAC scheme
 * used for outbound webhooks so you can reuse one dependency for both
 * concerns.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createHmac, timingSafeEqual } from "node:crypto";

export type ServerSdkErrorCode =
  | "invalid_signature"
  | "expired_badge"
  | "invalid_issuer"
  | "invalid_audience"
  | "invalid_app_context"
  | "malformed_badge"
  | "jwks_unavailable";

export class ProofOfPersonError extends Error {
  readonly code: ServerSdkErrorCode;
  constructor(code: ServerSdkErrorCode, message: string) {
    super(message);
    this.name = "ProofOfPersonError";
    this.code = code;
  }
}

export interface HumanBadgeClaims {
  /** Issuer claim (must match the `issuer` you configured). */
  iss: string;
  /** Subject — the server-side commitment hash. */
  sub: string;
  /** Audience — your project id. */
  aud: string;
  /** Per-(subject, app_context) nullifier (stable across renewals). */
  nullifier: string;
  /** App context the badge was minted for. */
  app_context: string;
  /** Issued-at, unix seconds. */
  iat: number;
  /** Expiration, unix seconds. */
  exp: number;
}

export interface CreateVerifierOptions {
  /** Full URL of the JWKS — typically `https://your-pop-host/.well-known/jwks.json`. */
  jwksUri: string;
  /** Expected `aud` claim. Usually your project id. */
  audience: string;
  /** Expected `iss` claim. Set to the `JWT_ISSUER` of the server you're verifying against. */
  issuer: string;
  /** Optional: how long jose should cache the JWKS. Defaults to 1h. */
  jwksCacheMaxAgeMs?: number;
  /** Optional: clock skew tolerance in seconds when checking `exp`. Defaults to 0. */
  clockToleranceSeconds?: number;
}

export interface VerifyBadgeOptions {
  /** Required: the `app_context` you minted the badge for. Must match the claim. */
  appContext: string;
}

export interface Verifier {
  /**
   * Verifies a human badge. Throws {@link ProofOfPersonError} on any
   * validation failure. On success returns the decoded claims.
   */
  verifyBadge(token: string, opts: VerifyBadgeOptions): Promise<HumanBadgeClaims>;
}

/**
 * Construct a reusable verifier. Cache this at module scope — the JWKS
 * fetch happens lazily on the first verification, then is cached
 * in-process for `jwksCacheMaxAgeMs` (1 hour by default).
 */
export function createVerifier(opts: CreateVerifierOptions): Verifier {
  const jwks = createRemoteJWKSet(new URL(opts.jwksUri), {
    cacheMaxAge: opts.jwksCacheMaxAgeMs ?? 60 * 60 * 1000,
    cooldownDuration: 30_000,
  });

  return {
    async verifyBadge(token, { appContext }) {
      let result;
      try {
        result = await jwtVerify(token, jwks, {
          algorithms: ["RS256"],
          issuer: opts.issuer,
          audience: opts.audience,
          clockTolerance: opts.clockToleranceSeconds ?? 0,
        });
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code ?? "";
        const message = (err as { message?: string })?.message ?? String(err);
        if (code === "ERR_JWT_EXPIRED" || /expired/i.test(message)) {
          throw new ProofOfPersonError("expired_badge", "Human badge has expired");
        }
        if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED") {
          if (/iss/i.test(message)) {
            throw new ProofOfPersonError("invalid_issuer", "Badge issuer does not match");
          }
          if (/aud/i.test(message)) {
            throw new ProofOfPersonError("invalid_audience", "Badge audience does not match");
          }
        }
        if (code === "ERR_JWS_INVALID" || code === "ERR_JWT_INVALID") {
          throw new ProofOfPersonError("malformed_badge", "Badge could not be decoded");
        }
        if (code === "ERR_JWKS_NO_MATCHING_KEY" || code === "ERR_JOSE_GENERIC") {
          throw new ProofOfPersonError("jwks_unavailable", "Could not fetch JWKS");
        }
        throw new ProofOfPersonError("invalid_signature", message);
      }
      const claims = result.payload as unknown as HumanBadgeClaims;
      if (claims.app_context !== appContext) {
        throw new ProofOfPersonError(
          "invalid_app_context",
          `Badge app_context "${claims.app_context}" does not match expected "${appContext}"`,
        );
      }
      return claims;
    },
  };
}

// ---------------------------------------------------------------------------
// Webhook signature verification (Pop-Signature: t=<unix>,v1=<hex_hmac>)
// ---------------------------------------------------------------------------

export type WebhookVerifyError =
  | "missing_signature_header"
  | "malformed_signature_header"
  | "invalid_timestamp"
  | "timestamp_outside_tolerance"
  | "signature_mismatch";

export interface WebhookVerifyResult {
  ok: boolean;
  reason?: WebhookVerifyError;
}

/**
 * Verify a Proof of Personhood webhook signature.
 *
 * Pass the EXACT raw request body bytes (as a UTF-8 string). If you let
 * your framework re-serialize the JSON the signature WILL NOT MATCH —
 * use a raw-body middleware (Express: `express.raw({ type: 'application/json' })`).
 */
export function verifyWebhookSignature(args: {
  rawBody: string;
  signatureHeader: string | undefined;
  secret: string;
  /** Maximum age in seconds. Defaults to 5 minutes. */
  toleranceSeconds?: number;
}): WebhookVerifyResult {
  const tolerance = args.toleranceSeconds ?? 300;
  if (!args.signatureHeader) return { ok: false, reason: "missing_signature_header" };
  let t: string | undefined;
  const sigs: string[] = [];
  for (const p of args.signatureHeader.split(",")) {
    const [k, v] = p.trim().split("=");
    if (k === "t") t = v;
    else if (k === "v1" && v) sigs.push(v);
  }
  if (!t || sigs.length === 0) return { ok: false, reason: "malformed_signature_header" };
  const ts = Number(t);
  if (!Number.isFinite(ts)) return { ok: false, reason: "invalid_timestamp" };
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > tolerance) {
    return { ok: false, reason: "timestamp_outside_tolerance" };
  }
  const expected = createHmac("sha256", args.secret)
    .update(`${t}.${args.rawBody}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  for (const candidate of sigs) {
    if (candidate.length !== expected.length) continue;
    const candBuf = Buffer.from(candidate, "hex");
    if (candBuf.length === expectedBuf.length && timingSafeEqual(expectedBuf, candBuf)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "signature_mismatch" };
}
