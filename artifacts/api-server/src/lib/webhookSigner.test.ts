import { describe, it, expect } from "vitest";
import {
  signWebhookPayload,
  verifyWebhookSignature,
  generateWebhookSigningSecret,
} from "./webhookSigner";

describe("webhookSigner", () => {
  const secret = "whsec_test_abcdef0123456789";
  const payload = JSON.stringify({ id: "evt_1", type: "verification.completed", data: {} });

  it("signs and verifies round-trip", () => {
    const sig = signWebhookPayload({ payload, secret });
    const result = verifyWebhookSignature({
      rawBody: payload,
      signatureHeader: sig.header,
      secret,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects when signature header missing", () => {
    const r = verifyWebhookSignature({ rawBody: payload, signatureHeader: undefined, secret });
    expect(r).toEqual({ ok: false, reason: "missing_signature_header" });
  });

  it("rejects malformed header", () => {
    const r = verifyWebhookSignature({ rawBody: payload, signatureHeader: "not-a-real-header", secret });
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toBe("malformed_signature_header");
  });

  it("rejects when timestamp is outside tolerance", () => {
    const ancient = Math.floor(Date.now() / 1000) - 10_000;
    const sig = signWebhookPayload({ payload, secret, timestampSeconds: ancient });
    const r = verifyWebhookSignature({
      rawBody: payload,
      signatureHeader: sig.header,
      secret,
      toleranceSeconds: 300,
    });
    expect(r).toEqual({ ok: false, reason: "timestamp_outside_tolerance" });
  });

  it("rejects on signature mismatch (different secret)", () => {
    const sig = signWebhookPayload({ payload, secret });
    const r = verifyWebhookSignature({
      rawBody: payload,
      signatureHeader: sig.header,
      secret: "whsec_different",
    });
    expect(r).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects on body tamper", () => {
    const sig = signWebhookPayload({ payload, secret });
    const r = verifyWebhookSignature({
      rawBody: payload + " ",
      signatureHeader: sig.header,
      secret,
    });
    expect(r).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("generates secrets with the whsec_ prefix and >=32 entropy bytes", () => {
    const a = generateWebhookSigningSecret();
    const b = generateWebhookSigningSecret();
    expect(a).not.toBe(b);
    expect(a.startsWith("whsec_")).toBe(true);
    expect(a.length).toBeGreaterThan(40);
  });
});
