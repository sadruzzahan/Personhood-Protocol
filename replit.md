# Proof of Personhood Protocol

## Overview

Full web presence for a cryptographic, privacy-preserving human verification protocol. Consists of a backend API server (Express 5) and a React+Vite marketing/demo/developer site.

## Products

### `artifacts/api-server` — Protocol API
Express 5 backend at port 8080. Persists data in Postgres via Drizzle ORM.

Public endpoints (under `/api`, **all require `Authorization: Bearer pk_test_…` or `pk_live_…`**):
- `POST /api/register` — register a biometric commitment. Honors `Idempotency-Key`. Write rate limit: 60/min/project.
- `POST /api/verify` — verify a proof. Honors `Idempotency-Key`. Write rate limit: 60/min/project.
- `GET /api/stats` — protocol statistics. Read rate limit: 600/min/project.
- `GET /api/nullifier/:hash` — check if a nullifier has been used. Read rate limit: 600/min/project.
- `GET /api/healthz` — health check (DB ping; 503 on failure). No auth.
- `GET /api/readyz` — readiness probe. No auth.
- `GET /api/_demo/api-key` — returns the public, project-bound demo key the marketing site uses for the playground/demo. No auth.

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
- `API_KEY_HMAC_SECRET` — server-side HMAC secret used to hash issued API keys. **Required (≥16 chars) in production**; the server fails to start without it. Generate with `openssl rand -hex 32`. In development, a clearly-marked fallback is used and a warning is logged on startup.
- `DEMO_API_KEY` — optional. Plaintext key (`pk_test_…`) the bootstrap should bind to the public demo project. If unset, a deterministic dev value is used. Anyone may use this key — it's bound only to the demo project (test env, no origin restrictions, normal rate limits).
- `ENABLE_PUBLIC_DEMO_KEY` — set to `1` to expose `GET /api/_demo/api-key` in production deployments (the marketing-site deploy needs this). In non-production runtimes the endpoint is on by default.

### `artifacts/protocol-site` — Marketing & Developer Site
React + Vite + Wouter + TanStack Query. Dark monochrome theme, electric cyan accent, Geist/Geist Mono fonts, no border radius. Preview at `/`.

Pages:
- `/` — Marketing landing page (hero, problem, how-it-works, honest scope, use cases, stats teaser)
- `/demo` — Simulated 4-step walkthrough (liveness → nullifier → attestation → badge); banner clearly labels it as simulation
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
