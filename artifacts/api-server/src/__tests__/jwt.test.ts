import "./setup-env";
import { describe, it, expect } from "vitest";
import { signHumanBadge, verifyHumanBadge, listPublicJwks } from "../lib/jwt";
import { SignJWT, importPKCS8, generateKeyPair } from "jose";

const baseArgs = {
  commitmentHash: "c".repeat(64),
  audience: "prj_test",
  nullifier: "n".repeat(64),
  appContext: "app-test",
};

describe("human badge JWT", () => {
  it("round-trips with expected claims and excludes subject_id", async () => {
    const { token } = await signHumanBadge(baseArgs);
    const claims = await verifyHumanBadge(token);
    expect(claims.sub).toBe(baseArgs.commitmentHash);
    expect(claims.aud).toBe(baseArgs.audience);
    expect(claims.nullifier).toBe(baseArgs.nullifier);
    expect(claims.app_context).toBe(baseArgs.appContext);
    expect(claims.iss).toBe("https://test.proof-of-personhood.local");
    expect((claims as unknown as Record<string, unknown>).subject_id).toBeUndefined();
  });

  it("rejects a tampered payload (signature mismatch)", async () => {
    const { token } = await signHumanBadge(baseArgs);
    const [h, p, s] = token.split(".");
    const decoded = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    decoded.app_context = "app-OTHER";
    const tampered = `${h}.${Buffer.from(JSON.stringify(decoded)).toString(
      "base64url",
    )}.${s}`;
    await expect(verifyHumanBadge(tampered)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const privateKey = await importPKCS8(process.env.JWT_PRIVATE_KEY_PEM!, "RS256");
    const expired = await new SignJWT({
      nullifier: baseArgs.nullifier,
      app_context: baseArgs.appContext,
    })
      .setProtectedHeader({ alg: "RS256", kid: process.env.JWT_KID!, typ: "JWT" })
      .setIssuer("https://test.proof-of-personhood.local")
      .setSubject(baseArgs.commitmentHash)
      .setAudience(baseArgs.audience)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);
    await expect(verifyHumanBadge(expired)).rejects.toThrow();
  });

  it("rejects a token signed by an unknown kid", async () => {
    const { privateKey } = await generateKeyPair("RS256", { modulusLength: 2048 });
    const foreign = await new SignJWT({
      nullifier: baseArgs.nullifier,
      app_context: baseArgs.appContext,
    })
      .setProtectedHeader({ alg: "RS256", kid: "kid_unknown", typ: "JWT" })
      .setIssuer("https://test.proof-of-personhood.local")
      .setSubject(baseArgs.commitmentHash)
      .setAudience(baseArgs.audience)
      .setIssuedAt(Math.floor(Date.now() / 1000))
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(privateKey);
    await expect(verifyHumanBadge(foreign)).rejects.toThrow();
  });

  it("rejects a token with the wrong issuer", async () => {
    const privateKey = await importPKCS8(process.env.JWT_PRIVATE_KEY_PEM!, "RS256");
    const wrongIssuer = await new SignJWT({
      nullifier: baseArgs.nullifier,
      app_context: baseArgs.appContext,
    })
      .setProtectedHeader({ alg: "RS256", kid: process.env.JWT_KID!, typ: "JWT" })
      .setIssuer("https://attacker.example.com")
      .setSubject(baseArgs.commitmentHash)
      .setAudience(baseArgs.audience)
      .setIssuedAt(Math.floor(Date.now() / 1000))
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(privateKey);
    await expect(verifyHumanBadge(wrongIssuer)).rejects.toThrow();
  });

  it("publishes JWKS with active RS256 RSA key", async () => {
    const jwks = await listPublicJwks();
    expect(jwks.keys.length).toBeGreaterThanOrEqual(1);
    const active = jwks.keys.find((k) => k.kid === process.env.JWT_KID);
    expect(active).toBeDefined();
    expect(active?.kty).toBe("RSA");
    expect(active?.alg).toBe("RS256");
    expect(active?.use).toBe("sig");
    expect((active as Record<string, unknown>).d).toBeUndefined();
  });
});
