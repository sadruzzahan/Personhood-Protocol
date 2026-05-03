# Key rotation runbook

This service uses two long-lived secrets that are loaded **only** from
environment variables (never the database):

| Secret | Purpose | Rotation impact |
| --- | --- | --- |
| `NULLIFIER_MASTER_SECRET` | HMAC master key for `deriveNullifier` and `deriveCommitment` | Rotation **invalidates every previously-registered nullifier** — only do this if the master key is known/suspected compromised. |
| `JWT_PRIVATE_KEY_PEM` + `JWT_PUBLIC_KEY_PEM` + `JWT_KID` | RS256 signing keypair for human-badge JWTs | Old badges keep verifying for the duration the previous public key remains in `JWT_DEPRECATED_PUBLIC_KEYS_JSON`. |

Boot-time fail-fast is enforced for both — the server refuses to start if
any of these env vars are missing. There is no insecure development
fallback. Run `setEnvVars` (or set them via the Replit secrets pane) before
the first start in any environment.

## 1. Routine JWT signing-key rotation (no compromise)

Goal: introduce a new active signing key while badges signed by the
previous key continue to verify until they naturally expire (`BADGE_TTL_SECONDS`,
24 h by default).

```bash
# 1. Generate a fresh RSA-2048 keypair.
openssl genrsa 2048 > /tmp/new.pem
openssl pkcs8 -topk8 -nocrypt -in /tmp/new.pem -out /tmp/new.priv.pem
openssl rsa -in /tmp/new.pem -pubout -out /tmp/new.pub.pem
NEW_KID="kid_$(openssl rand -hex 6)"
echo "NEW_KID=$NEW_KID"
```

2. **Move the currently-active public key into the deprecated set** by
   appending it to `JWT_DEPRECATED_PUBLIC_KEYS_JSON`:

   ```json
   [
     { "kid": "<previous-kid>", "publicPem": "-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----", "alg": "RS256" }
   ]
   ```

   The deprecated key continues to be served from JWKS but is no longer
   used for signing.

3. **Set the new active keypair** as `JWT_PRIVATE_KEY_PEM`,
   `JWT_PUBLIC_KEY_PEM`, `JWT_KID`.

4. **Restart the API server.** All new badges are signed with the new
   `kid`; existing badges continue to verify against the deprecated entry.

5. **After 24 h** (`> BADGE_TTL_SECONDS`), remove the deprecated entry
   from `JWT_DEPRECATED_PUBLIC_KEYS_JSON` and restart. Outstanding badges
   that referenced the old `kid` are now beyond their `exp` and will fail
   the signature/expiry check anyway.

## 2. Emergency JWT rotation (key compromise)

Skip the deprecation window: replace `JWT_PRIVATE_KEY_PEM`,
`JWT_PUBLIC_KEY_PEM`, `JWT_KID` and **do not** populate
`JWT_DEPRECATED_PUBLIC_KEYS_JSON`. Restart. All existing badges will fail
verification immediately — relying parties must re-register.

## 3. `NULLIFIER_MASTER_SECRET` rotation

Treat as a destructive event. Nullifiers and commitments are derived from
the master key, so rotating it makes every existing record uncorrelatable
and every previously-issued badge invalid. Only do this on confirmed
compromise. Procedure:

1. Generate a new value: `openssl rand -hex 32`.
2. Export the existing `commitments` table for forensics if needed.
3. Replace `NULLIFIER_MASTER_SECRET` and restart.
4. Communicate to integrators that all human badges and nullifiers must be
   re-issued.

## 4. Verification

After any rotation, sanity-check the JWKS endpoint:

```bash
curl -s https://<host>/.well-known/jwks.json | jq '.keys[] | {kid, alg, kty}'
```

The new `kid` should be present (and during a deprecation window, the
previous one too). Then exercise the demo end-to-end: open `/demo`, run
the mock flow, confirm the badge verifies.
