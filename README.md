# Proof of Personhood Protocol

Monorepo for a **cryptographic, privacy-conscious human-verification** protocol: an **Express 5** API backed by **PostgreSQL (Drizzle)**, a **React + Vite** marketing/developer console (`protocol-site`), optional **mockup** sandbox, published **OpenAPI → Orval** clients, and lightweight **`@personhood/sdk-server`** / **`@personhood/sdk-browser`** packages for integrators.

> **Legal:** Pages under `/trust`, `/privacy`, and `/terms` are **engineering drafts** with visible “review with counsel” messaging in the app. Do not treat them as production legal documents until a lawyer signs off. Company placeholders live in `artifacts/protocol-site/src/lib/constants.ts`.

---

## Repository layout

| Path | Purpose |
|------|--------|
| `artifacts/api-server` | Public protocol API, Persona webhook, JWKS, rate limits, idempotency, Clerk-gated **internal dashboard** routes. |
| `artifacts/protocol-site` | Public site: landing, interactive demo, developers docs/playground, stats, trust/privacy/terms drafts, status, Clerk auth, dashboard UI. |
| `artifacts/mockup-sandbox` | Isolated UI sandbox. |
| `lib/db` | Drizzle schemas (projects, keys, inquiries, rate-limit buckets, idempotency, hardening, webhooks, etc.). |
| `lib/api-spec` + `lib/api-zod` + `lib/api-client-react` | OpenAPI source, Zod types, generated React Query client. |
| `packages/sdk-server` | Server-side integration helpers (see package `README.md`). |
| `packages/sdk-browser` | Browser-oriented helpers (see package `README.md`). |
| `docs/key-rotation.md` | JWT / nullifier / API-key rotation operations. |

---

## Tech stack

- **Node.js** 24 · **pnpm** workspaces · **TypeScript** ~5.9  
- **API**: Express 5, Zod, Helmet, Pino, `jose` for JWT/JWKS  
- **Auth**: Clerk for the developer dashboard; **Bearer API keys** (`pk_test_…` / `pk_live_…`) for public protocol routes  
- **Verification vendor**: **Persona** when `PERSONA_API_KEY` + `PERSONA_TEMPLATE_ID` are set; otherwise an auto-approving **mock** path (selectable per inquiry)  
- **Frontend**: Vite, React 19, Wouter, TanStack Query, Tailwind 4, shadcn-style components, Framer Motion  

---

## Public API (summary)

All routes under `/api` unless noted. **Authenticated routes** expect `Authorization: Bearer <api_key>`. **Health routes** and **JWKS** are unauthenticated.

| Area | Highlights |
|------|------------|
| **Inquiries** | `POST /api/inquiries` — start liveness flow; `GET /api/inquiries/:id` — poll status. |
| **Registration** | `POST /api/register` — approved inquiry → nullifier + **RS256 human-badge JWT** (`Idempotency-Key` supported). |
| **Verification** | `POST /api/verify` — validate badge against JWKS, project id, `appContext`, registry (`Idempotency-Key` supported). |
| **Webhooks** | `POST /api/webhooks/persona` — HMAC-verified Persona callbacks (no bearer; signature auth). |
| **Telemetry** | `GET /api/stats`, `GET /api/nullifier/:hash`. |
| **Probes** | `GET /api/healthz`, `GET /api/readyz`. |
| **Demo key** | `GET /api/_demo/api-key` — public demo key when enabled (see env `ENABLE_PUBLIC_DEMO_KEY` / non-prod default). |
| **JWKS** | `/.well-known/jwks.json` at server root **and** under `/api/.well-known/jwks.json` / `/api/jwks.json` for platforms that only reverse-proxy `/api/*`. |

**Hardening** (see `replit.md` for full detail): API-key HMAC storage with origin allowlists for live keys, Postgres-backed token-bucket rate limits (standard rate-limit headers + `Retry-After` on 429), 24h idempotency records with replay semantics, uniform error envelope, request logging with IP prefixes, body size limits, server-side timeouts.

**Internal dashboard** (`/api/internal/dashboard/...`): Clerk session only — projects, API keys (issue / rotate / revoke), usage snapshots, recent events.

---

## Environment variables

Required secrets and behavioral flags are documented in **`replit.md`** (authoritative checklist). Notable categories:

- **Database**: `DATABASE_URL`  
- **Clerk**: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, frontend `VITE_CLERK_PUBLISHABLE_KEY`  
- **Cryptography**: `API_KEY_HMAC_SECRET`, `NULLIFIER_MASTER_SECRET`, `JWT_PRIVATE_KEY_PEM`, `JWT_PUBLIC_KEY_PEM`, `JWT_KID`, optional `JWT_DEPRECATED_PUBLIC_KEYS_JSON`  
- **Persona**: `PERSONA_API_KEY`, `PERSONA_TEMPLATE_ID`, `PERSONA_WEBHOOK_SECRET` (when using live vendor + webhook)  
- **Issuance**: `JWT_ISSUER`, optional `DEMO_API_KEY`, `ENABLE_PUBLIC_DEMO_KEY`, `VERIFICATION_VENDOR`  

Rotation playbook: **`docs/key-rotation.md`**.

---

## Local development

From the repository root:

```bash
pnpm run typecheck
pnpm run build

pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/api-server run dev      # API (see package for port; replit.md cites 8080)
pnpm --filter @workspace/protocol-site run dev   # marketing + dashboard SPA
```

---

## License

MIT (see root `package.json`).
