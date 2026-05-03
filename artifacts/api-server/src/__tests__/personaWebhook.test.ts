import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyPersonaSignature } from "../lib/personaWebhook";

const SECRET = "whsec_test_persona_shared_secret";

function sign(rawBody: string, ts: number, secret = SECRET): string {
  const sig = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  return `t=${ts},v1=${sig}`;
}

describe("Persona webhook signature", () => {
  const body = JSON.stringify({ data: { id: "evt_1" } });
  const now = Math.floor(Date.now() / 1000);

  it("accepts a valid signature within the tolerance window", () => {
    const r = verifyPersonaSignature({
      rawBody: body,
      signatureHeader: sign(body, now),
      secret: SECRET,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects a missing header", () => {
    const r = verifyPersonaSignature({
      rawBody: body,
      signatureHeader: undefined,
      secret: SECRET,
    });
    expect(r).toEqual({ ok: false, reason: "missing_signature_header" });
  });

  it("rejects a malformed header", () => {
    const r = verifyPersonaSignature({
      rawBody: body,
      signatureHeader: "garbage",
      secret: SECRET,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects a signature from a different secret", () => {
    const r = verifyPersonaSignature({
      rawBody: body,
      signatureHeader: sign(body, now, "wrong_secret"),
      secret: SECRET,
    });
    expect(r).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a signature whose body has been tampered", () => {
    const header = sign(body, now);
    const r = verifyPersonaSignature({
      rawBody: body + "X",
      signatureHeader: header,
      secret: SECRET,
    });
    expect(r).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a stale timestamp (replay outside tolerance)", () => {
    const stale = now - 3600;
    const r = verifyPersonaSignature({
      rawBody: body,
      signatureHeader: sign(body, stale),
      secret: SECRET,
      toleranceSeconds: 300,
    });
    expect(r).toEqual({ ok: false, reason: "timestamp_outside_tolerance" });
  });

  it("rejects a non-numeric timestamp", () => {
    const r = verifyPersonaSignature({
      rawBody: body,
      signatureHeader: `t=notanumber,v1=${"a".repeat(64)}`,
      secret: SECRET,
    });
    expect(r).toEqual({ ok: false, reason: "invalid_timestamp" });
  });
});
