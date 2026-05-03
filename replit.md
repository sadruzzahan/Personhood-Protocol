# Proof of Personhood Protocol

## Overview

Full web presence for a cryptographic, privacy-preserving human verification protocol. Consists of a backend API server (Express 5) and a React+Vite marketing/demo/developer site.

## Products

### `artifacts/api-server` — Protocol API
Express 5 backend at port 8080. Persists data in Postgres via Drizzle ORM.

Public endpoints (under `/api`, **all require `Authorization: Bearer pk_test_…` or `pk_live_…`** unless noted):
- `POST /api/inquiries` — open a Persona liveness inquiry (or mock equivalent). Returns `{ inquiryId, hostedUrl, vendor, status }`. Write rate limit.
- `GET /api/inquiries/:inquiryId` — poll inquiry status. Read rate limit.
- `POST /api/register` — exchange an approved inquiry for a registered nullifier and an RS256-signed human-badge JWT. Body: `{ inquiryId, appContext }`. Honors `Idempotency-Key`. Write rate limit.
- `POST /api/verify` — verify a human-badge JWT against the JWKS, registry, audience and `appContext`. Body: `{ humanBadge, appContext }`. Honors `Idempotency-Key`. Write rate limit.
- `POST /api/webhooks/persona` — Persona webhook receiver. Verifies `t=…,v1=…` HMAC-SHA256 signature against `PERSONA_WEBHOOK_SECRET` and idempotently updates inquiry state. No bearer auth (signature is the auth).
- `GET /api/stats` — protocol statistics. Read rate limit.
- `GET /api/nullifier/:hash` — check if a nullifier has been used. Read rate limit.
- `GET /api/healthz`, `GET /api/readyz` — health/readiness probes. No auth.
- `GET /api/_demo/api-key` — returns the public, project-bound demo key. No auth.
- `GET /.well-known/jwks.json` — public JWKS for offline RS256 badge verification. No auth, mounted at the server root (RFC 8615). Also exposed under `/api/.well-known/jwks.json` and `/api/jwks.json` because the platform's path-based proxy only forwards `/api/*` to this artifact — production clients should use one of the `/api/...` paths until a domain-level reverse proxy is in place.

Hardening surface (all wired into the public router):
- API key auth via HMAC lookup with debounced `last_used_at` updates; live keys enforce `projects.allowed_origins`.
- Per-project token-bucket rate limiting in Postgres (`rate_limit_buckets`); responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, plus `Retry-After` on 429.
- Idempotency cache (`idempotency_records`, 24h TTL, hourly cleanup). Replays return the original body with `Idempotent-Replayed: true`; mismatched body returns 409 `idempotency_conflict`.
- Per-request `X-Request-ID` (UUID; only trusted from upstream if it's a UUID), included in every error envelope and pino log line.
- Stable error envelope on every non-2xx: `{ "error": { code, message, request_id, details? } }`. Codes: `missing_authorization`, `invalid_api_key`, `revoked_api_key`, `forbidden_origin`, `rate_limited`, `idempotency_conflict`, `idempotency_in_progress`, `payload_too_large`, `request_timeout`, `validation_error`, `not_found`, `conflict`, `internal_error`, `service_unavailable`.
- Helmet security headers (HSTS, X-Content-Type-Options, frame-options, etc.), `x-powered-by` disabled, JSON body cap 32 KB → 413, server-side timeout 10s → 408.
- Request logging middleware persists every authenticated public request to `request_logs` (batched, queue-bounded; IPs stored at /24 (v4) or /64 (v6) prefix granularity).

Internal dashboard endpoints (under `/api/internal/dashboard`, gated by Clerk session — never by API keys):
- `GET /me` — current user + active organization
- `GET|POST /projects` — list/create projects
- `GET|PATCH|DELETE /projects/:id` — project detail (with 24h stats), update, delete. PATCH accepts `name`, `environment`, `allowedOrigins`, `webhookUrl`.
- `GET|POST /projects/:id/keys` — list/create API keys (full key shown once on create)
- `POST /projects/:id/keys/:keyId/rotate` — atomically issue a new key and revoke the old one
- `POST /projects/:id/keys/:keyId/revoke` — revoke a key
- `GET /projects/:id/events` — last 50 register/verify request log entries (timestamp, endpoint, status, latency, IP prefix, error code)
- `GET /projects/:id/usage` — usage panel data: today + month-to-date totals (success/failure split) and a 7-day densified series

### Required environment variables
- `DATABASE_URL` — Postgres connection string (auto-provisioned by Replit DB).
- `CLERK_PUBLISHABLE_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key (non-secret, identical value). Auto-set by `setupClerkWhitelabelAuth`.
- `CLERK_SECRET_KEY` — Clerk backend secret. Auto-set by `setupClerkWhitelabelAuth`.
- `API_KEY_HMAC_SECRET` — server-side HMAC secret used to hash issued API keys. **Required (≥16 chars) in production**; the server fails to start without it. Generate with `openssl rand -hex 32`.
- `NULLIFIER_MASTER_SECRET` — server-side HMAC master key used to derive per-app nullifiers and commitment hashes. **Required in every runtime (≥32 chars), no code-level fallback.** The server refuses to start without it. Generate with `openssl rand -hex 32`. Rotating invalidates every previously-issued badge — see `docs/key-rotation.md`.
- `JWT_PRIVATE_KEY_PEM` / `JWT_PUBLIC_KEY_PEM` / `JWT_KID` — RSA-2048 signing keypair (PKCS8 PEM private + SPKI PEM public) and a stable `kid`. **Required in every runtime, no code-level fallback.** The server refuses to start without all three. Generate with `openssl genrsa 2048 | tee /tmp/p.pem | openssl pkcs8 -topk8 -nocrypt && openssl rsa -in /tmp/p.pem -pubout`. The private key is loaded only from this env var — it is never written to the database. See `docs/key-rotation.md`.
- `JWT_DEPRECATED_PUBLIC_KEYS_JSON` — optional. JSON array of `{ kid, publicPem, alg? }` for previously-active keys still in their grace window so already-issued badges keep verifying after rotation.
- `PERSONA_API_KEY` + `PERSONA_TEMPLATE_ID` — Persona credentials. When both are set the real Persona vendor is available; otherwise only the auto-approving mock vendor is available. Callers can pick per-inquiry via `mode: "mock"|"persona"`; if omitted the server falls back to the default. Override the default with `VERIFICATION_VENDOR=persona|mock`.
- `PERSONA_WEBHOOK_SECRET` — used to verify `t=…,v1=…` HMAC-SHA256 signatures on `POST /api/webhooks/persona`. Required only when running with the Persona vendor.
- `JWT_ISSUER` — issuer claim used in human-badge JWTs (default `https://proof-of-personhood.local` in dev). Set to your public origin for production.
- `DEMO_API_KEY` — optional. Plaintext key (`pk_test_…`) the bootstrap should bind to the public demo project. If unset, a deterministic dev value is used. Anyone may use this key — it's bound only to the demo project (test env, no origin restrictions, normal rate limits).
- `ENABLE_PUBLIC_DEMO_KEY` — set to `1` to expose `GET /api/_demo/api-key` in production deployments (the marketing-site deploy needs this). In non-production runtimes the endpoint is on by default.

### Verification flow & key boundary
RSA-2048 (RS256) signing keys live exclusively in environment secrets. **The private key never crosses the database trust boundary** — there is no `jwt_keys` table and no DB-backed key resolver. JWKS published at `/.well-known/jwks.json` is composed from `JWT_PUBLIC_KEY_PEM` plus optional `JWT_DEPRECATED_PUBLIC_KEYS_JSON` so badges issued by a previously-active `kid` still verify across rotation. Operational rotation is documented in `docs/key-rotation.md`.

The badge JWT carries `{ iss, sub=commitmentHash, aud=projectId, nullifier, app_context, iat, exp }`. It deliberately does **not** embed any vendor subject identifier — that would create a stable cross-app linker and weaken unlinkability. `/verify` validates: signature against the JWKS, `aud === projectId`, `app_context` matches the caller, badge not expired, then looks up the commitment by `sub` in the server-side registry and confirms the badge's `nullifier` and `app_context` match what was recorded at `/register` time. So a forged badge with tampered claims fails the cross-check even if the signature could be re-signed.

### `artifacts/protocol-site` — Marketing & Developer Site
React + Vite + Wouter + TanStack Query. Dark monochrome theme, electric cyan accent, Geist/Geist Mono fonts, no border radius. Preview at `/`.

Pages:
- `/` — Marketing landing page (hero, problem, how-it-works, honest scope, use cases, stats teaser)
- `/demo` — End-to-end 4-step walkthrough (inquiry → liveness poll → nullifier register → JWT badge verify); banner shows the active vendor (`persona` or `mock`)
- `/developers` — SDK snippets (JS/Python/Go), API reference, threat-model summary, live playground
- `/stats` — Live service stats with animated counters, auto-refresh
- `/trust` — Threat model (what we protect against / what we don't), data handling, subprocessors, retention, incident response
- `/privacy` — Privacy Policy draft (developers + end-users, GDPR/CCPA rights, subprocessors)
- `/terms` — Terms of Service draft (acceptable use, rate limits, warranty disclaimer, liability cap)
- `/status` — Health indicator polled from `/api/healthz`, placeholder for future Statuspage/Better Stack integration
- `/sign-in`, `/sign-up` — Clerk-hosted auth pages (themed to match the dark monochrome site)
- `/dashboard` — Developer console: project list + create/delete (Clerk-authenticated)
- `/dashboard/projects/:id` — Project detail with tabs: Overview (24h stats), Keys (issue/revoke), Events (recent requests), Settings (rename/env/delete)

### TODO — Legal review
The pages at `/trust`, `/privacy`, and `/terms` are structured drafts written by engineering, **not** legally reviewed. Each page renders a visible "DRAFT — REVIEW WITH COUNSEL BEFORE LAUNCH" banner. **Have a licensed attorney review and approve all three pages before public launch.** Company info (legal name, contact emails, jurisdiction, effective date) lives in `artifacts/protocol-site/src/lib/constants.ts` for easy update post-review.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Validation**: Zod (`zod/v4`)
- **Frontend**: React 19, Vite, Wouter (routing), TanStack Query, shadcn/ui, Tailwind CSS 4, Framer Motion
- **API codegen**: Orval (from OpenAPI spec → `lib/api-client-react`)
- **Build**: esbuild (API server CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from OpenAPI spec
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/protocol-site run dev` — run frontend locally

See the `pnpm-workspace` skill for workspace structure details.
