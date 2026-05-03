import { describe, it, expect } from "vitest";
import {
  RETRY_SCHEDULE_MS,
  delayBeforeAttempt,
  deliverOnce,
} from "./webhookDelivery";

describe("delayBeforeAttempt", () => {
  it("returns the schedule entries in order", () => {
    for (let i = 0; i < RETRY_SCHEDULE_MS.length; i++) {
      expect(delayBeforeAttempt(i + 1)).toBe(RETRY_SCHEDULE_MS[i]);
    }
  });

  it("returns null after the schedule is exhausted", () => {
    expect(delayBeforeAttempt(RETRY_SCHEDULE_MS.length + 1)).toBeNull();
    expect(delayBeforeAttempt(0)).toBeNull();
  });

  it("schedule increases monotonically — backoff never shortens", () => {
    for (let i = 1; i < RETRY_SCHEDULE_MS.length; i++) {
      expect(RETRY_SCHEDULE_MS[i]).toBeGreaterThan(RETRY_SCHEDULE_MS[i - 1]);
    }
  });

  it("total max delay is at least 24h (covers a full ops cycle)", () => {
    const total = RETRY_SCHEDULE_MS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(24 * 60 * 60_000);
  });
});

describe("deliverOnce", () => {
  it("returns ok=true on 2xx", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response("OK", { status: 200 });
    const r = await deliverOnce({
      url: "https://example.com",
      body: "{}",
      signatureHeader: "t=1,v1=ab",
      eventId: "evt_1",
      eventType: "test",
      fetchImpl: fakeFetch,
    });
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.preview).toBe("OK");
  });

  it("returns ok=false with non_2xx error on 5xx", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response("oops", { status: 503 });
    const r = await deliverOnce({
      url: "https://example.com",
      body: "{}",
      signatureHeader: "x",
      eventId: "evt_2",
      eventType: "test",
      fetchImpl: fakeFetch,
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
    expect(r.error).toBe("non_2xx");
  });

  it("captures network errors without throwing", async () => {
    const fakeFetch: typeof fetch = async () => {
      const err = new Error("connect failure") as Error & { code?: string };
      err.code = "ECONNREFUSED";
      throw err;
    };
    const r = await deliverOnce({
      url: "https://example.com",
      body: "{}",
      signatureHeader: "x",
      eventId: "evt_3",
      eventType: "test",
      fetchImpl: fakeFetch,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("ECONNREFUSED");
  });

  it("truncates response previews to <=512 bytes", async () => {
    const big = "x".repeat(5000);
    const fakeFetch: typeof fetch = async () => new Response(big, { status: 200 });
    const r = await deliverOnce({
      url: "https://example.com",
      body: "{}",
      signatureHeader: "x",
      eventId: "evt_4",
      eventType: "test",
      fetchImpl: fakeFetch,
    });
    expect(r.ok).toBe(true);
    expect((r.preview ?? "").length).toBeLessThanOrEqual(512);
  });
});
