import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Persona webhook signing follows the Stripe-like format:
 *   Persona-Signature: t=<unix-ts>,v1=<hex-hmac-sha256>
 * The signed payload is `${t}.${rawBody}`.
 *
 * Reference: https://docs.withpersona.com/docs/webhooks-best-practices
 */
export function verifyPersonaSignature(args: {
  rawBody: string;
  signatureHeader: string | undefined;
  secret: string;
  toleranceSeconds?: number;
}): { ok: true } | { ok: false; reason: string } {
  const tolerance = args.toleranceSeconds ?? 300;
  if (!args.signatureHeader) {
    return { ok: false, reason: "missing_signature_header" };
  }
  const parts = args.signatureHeader.split(",").map((p) => p.trim());
  let t: string | undefined;
  const sigs: string[] = [];
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (k === "t") t = v;
    else if (k === "v1" && v) sigs.push(v);
  }
  if (!t || sigs.length === 0) {
    return { ok: false, reason: "malformed_signature_header" };
  }
  const tsNum = Number(t);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, reason: "invalid_timestamp" };
  }
  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
  if (ageSec > tolerance) {
    return { ok: false, reason: "timestamp_outside_tolerance" };
  }
  const signedPayload = `${t}.${args.rawBody}`;
  const expected = createHmac("sha256", args.secret)
    .update(signedPayload)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  for (const candidate of sigs) {
    if (candidate.length !== expected.length) continue;
    const candBuf = Buffer.from(candidate, "hex");
    if (candBuf.length !== expectedBuf.length) continue;
    if (timingSafeEqual(expectedBuf, candBuf)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "signature_mismatch" };
}
