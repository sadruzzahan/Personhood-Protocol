# Proof of Personhood Protocol

## Overview

Full web presence for a cryptographic, privacy-preserving human verification protocol. Consists of a backend API server (Express 5) and a React+Vite marketing/demo/developer site.

## Products

### `artifacts/api-server` — Protocol API
Express 5 backend at port 8080. Simulates ZK-proof verification in memory (no database).

Endpoints:
- `POST /api/register` — register a biometric commitment, returns commitmentHash + nullifier
- `POST /api/verify` — verify a ZK proof, returns humanBadge token on success
- `GET /api/stats` — protocol statistics (commitments, verifications, uptime)
- `GET /api/nullifier/:hash` — check if a nullifier has been used
- `GET /api/healthz` — health check

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
