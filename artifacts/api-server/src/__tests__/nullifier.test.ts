import "./setup-env";
import { describe, it, expect } from "vitest";
import { deriveNullifier, deriveCommitment } from "../lib/nullifier";

describe("nullifier", () => {
  it("is deterministic for same (subject, appContext)", () => {
    const a = deriveNullifier("subj_1", "app-x");
    const b = deriveNullifier("subj_1", "app-x");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("yields uncorrelated values for different appContexts", () => {
    const a = deriveNullifier("subj_1", "app-x");
    const b = deriveNullifier("subj_1", "app-y");
    expect(a).not.toBe(b);
  });

  it("yields different nullifiers for different subjects", () => {
    const a = deriveNullifier("subj_1", "app-x");
    const b = deriveNullifier("subj_2", "app-x");
    expect(a).not.toBe(b);
  });

  it("commitment is salted (different across calls for same subject)", () => {
    const a = deriveCommitment("subj_1");
    const b = deriveCommitment("subj_1");
    expect(a.commitmentHash).not.toBe(b.commitmentHash);
    expect(a.salt).not.toBe(b.salt);
  });
});
