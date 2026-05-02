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
- `/` — Full marketing landing page (hero, problem, how-it-works, hardware tiers, comparison table, use cases, business model)
- `/demo` — Interactive 4-step verification wizard (liveness → commitment → ZK proof → badge), calls live API
- `/developers` — SDK code snippets (JS/Python/Go), API reference cards, live nullifier playground
- `/stats` — Live protocol stats with animated counters, auto-refresh every 10s

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
