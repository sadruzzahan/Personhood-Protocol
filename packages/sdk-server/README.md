# @proofofperson/server

Server-side SDK for verifying Proof of Personhood human-badge JWTs.
Zero dependencies beyond [`jose`](https://github.com/panva/jose).

## Install

```bash
npm install @proofofperson/server
```

## Verify a human badge

```ts
import { createVerifier } from "@proofofperson/server";

const verifier = createVerifier({
  jwksUri: "https://your-pop-host/.well-known/jwks.json",
  audience: "prj_yourProjectId",
  issuer: "https://your-pop-host",
});

try {
  const claims = await verifier.verifyBadge(humanBadge, {
    appContext: "your-app-id",
  });
  // claims.nullifier is stable per (subject, appContext) — store it as
  // your "this user is human" sentinel.
  markUserAsHuman(claims.nullifier);
} catch (err) {
  // err.code is one of: invalid_signature | expired_badge |
  // invalid_issuer | invalid_audience | invalid_app_context |
  // malformed_badge | jwks_unavailable
  return res.status(401).json({ error: err.code });
}
```

The verifier caches the JWKS in-process for 1 hour by default. Construct
it once at module scope.

## Verify a webhook

Outbound webhooks ship with `Pop-Signature: t=<unix>,v1=<hex_hmac>`.
Verify with the per-project signing secret from your dashboard:

```ts
import express from "express";
import { verifyWebhookSignature } from "@proofofperson/server";

const app = express();

// IMPORTANT: capture the raw body — re-serialized JSON will not verify.
app.post(
  "/webhooks/proofofperson",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const result = verifyWebhookSignature({
      rawBody: req.body.toString("utf8"),
      signatureHeader: req.header("pop-signature"),
      secret: process.env.POP_WEBHOOK_SECRET!,
    });
    if (!result.ok) return res.status(401).send(result.reason);

    const event = JSON.parse(req.body.toString("utf8"));
    if (event.type === "verification.completed") {
      // event.data.nullifier, event.data.appContext, etc.
    }
    res.json({ ok: true });
  },
);
```

## Errors

`ProofOfPersonError` carries a stable `code` field. Switch on it:

| code                    | meaning                                                |
| ----------------------- | ------------------------------------------------------ |
| `invalid_signature`     | Signature did not verify against the JWKS              |
| `expired_badge`         | `exp` claim is in the past                             |
| `invalid_issuer`        | `iss` claim doesn't match the configured issuer        |
| `invalid_audience`      | `aud` claim doesn't match your project id              |
| `invalid_app_context`   | `app_context` claim doesn't match `opts.appContext`    |
| `malformed_badge`       | Token is not a valid JWT                               |
| `jwks_unavailable`      | Could not fetch the public keys                        |

## Publishing

This package isn't auto-published. Run:

```bash
cd packages/sdk-server
pnpm run build
npm publish --access=public
```

You'll need an npm account with publish rights to the `@proofofperson`
organization.
