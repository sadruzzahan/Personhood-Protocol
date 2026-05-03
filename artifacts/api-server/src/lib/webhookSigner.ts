import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Outbound webhook signing — Stripe-compatible scheme.
 *
 *   Header:        Pop-Signature: t=<unix-seconds>,v1=<hex-sha256-hmac>
 *   Signed bytes:  `${t}.${rawBodyUtf8}`
 *
 * Customers verify by recomputing the HMAC over `t` + "." + raw request
 * body and comparing in constant time. Including `t` in the signed payload
 * + a tolerance window on receipt prevents replay outside that window.
 *
 * Documented at /developers#webhooks; the verifier in @proofofperson/server
 * (and the Python/Go snippets) all implement the same scheme.
 */
export function signWebhookPayload(args: {
  payload: string;
  secret: string;
  // Optional injected timestamp for deterministic tests; defaults to now.
  timestampSeconds?: number;
}): { header: string; timestamp: number; signature: string } {
  const t = args.timestampSeconds ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${t}.${args.payload}`;
  const sig = createHmac("sha256", args.secret).update(signedPayload).digest("hex");
  return {
    header: `t=${t},v1=${sig}`,
    timestamp: t,
    signature: sig,
  };
}

export function verifyWebhookSignature(args: {
  rawBody: string;
  signatureHeader: string | undefined;
  secret: string;
  // Reject signatures whose timestamp is more than this many seconds away
  // from now. Default 5 minutes — same as Stripe's recommendation.
  toleranceSeconds?: number;
}): { ok: true } | { ok: false; reason: string } {
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
  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (ageSec > tolerance) return { ok: false, reason: "timestamp_outside_tolerance" };

  const expected = createHmac("sha256", args.secret)
    .update(`${t}.${args.rawBody}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  for (const candidate of sigs) {
    if (candidate.length !== expected.length) continue;
    const candBuf = Buffer.from(candidate, "hex");
    if (candBuf.length !== expectedBuf.length) continue;
    if (timingSafeEqual(expectedBuf, candBuf)) return { ok: true };
  }
  return { ok: false, reason: "signature_mismatch" };
}

/**
 * Generates a fresh project webhook signing secret. Format is `whsec_` plus
 * 32 random base64url bytes (192 bits of entropy) — enough that an offline
 * attacker brute-forcing the HMAC is infeasible without a side channel.
 */
export function generateWebhookSigningSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}
