# @proofofperson/browser

Drop-in browser SDK for the Proof of Personhood flow. Opens the hosted
liveness check, polls until the inquiry is approved, exchanges it for a
human-badge JWT, and hands the badge to your callback.

## Install

```bash
npm install @proofofperson/browser
```

## Verify

```ts
import { createClient } from "@proofofperson/browser";

const pop = createClient({ projectKey: "pk_test_…" });

await pop.verify({
  appContext: "your-app-id",
  onSuccess: (badge) => {
    // badge.humanBadge is the RS256 JWT — send it to your backend.
    fetch("/api/me/promote-to-human", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ badge: badge.humanBadge }),
    });
  },
  onError: (err) => {
    console.warn(err.code, err.message);
  },
});
```

`pop.verify()` resolves with the badge or rejects with a typed
`ProofOfPersonBrowserError` whose `code` is one of:

- `inquiry_failed` — `/api/inquiries` did not return 2xx.
- `hosted_flow_timeout` — the user did not complete the Persona flow in time.
- `register_failed` — `/api/register` did not return 2xx.
- `user_cancelled` — the inquiry ended in `declined`, `expired`, or `failed`.
- `network_error` — fetch threw before reaching the server.

The SDK never persists the badge — `getBadge()` reads it from
in-memory module state, and `signOut()` clears it.

## Verifying the badge on your server

Use the companion package [`@proofofperson/server`](https://www.npmjs.com/package/@proofofperson/server)
which wraps `jose` for JWKS-aware verification.

## Publishing

```bash
cd packages/sdk-browser
pnpm run build
npm publish --access=public
```
