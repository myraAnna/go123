# go123 Monorepo Guide

> Three services in one git repo: **Next.js FE → Hono BFF → FastAPI (AI)**. No workspace tooling, no shared packages — each service manages its own deps. A simple git-folder monorepo that keeps the architecture clean without paying for tooling you don't yet need.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture & BFF Pattern](#2-architecture--bff-pattern)
3. [Folder Structure](#3-folder-structure)
4. [The Three Services](#4-the-three-services)
5. [Warung AI Bookkeeper — Feature Map](#5-warung-ai-bookkeeper--feature-map)
6. [Running Locally](#6-running-locally)
7. [Contracts Between Services](#7-contracts-between-services)
8. [When to Level Up](#8-when-to-level-up)
9. [Guidelines & Rules](#9-guidelines--rules)

---

## 1. Overview

**Stack:**

- `web/` — Next.js (App Router), React, Tailwind
- `api/` — Hono REST API acting as the **BFF** (Backend for Frontend)
- `ai/` — Python FastAPI for AI/ML work (inference, generation, etc.), managed with [uv](https://docs.astral.sh/uv/)

**What this is:** three independent services in one git repo. Each service has its own `package.json` / `pyproject.toml`, its own lockfile, its own `node_modules` / `.venv`. A single `docker-compose.yml` runs all three locally.

**What this isn't:** a tooled monorepo. No Nx, no pnpm workspaces, no shared packages. That's on the table for later, if and when the project outgrows plain folders — see [§8](#8-when-to-level-up).

---

## 2. Architecture & BFF Pattern

### Request flow

```
┌──────────┐     HTTPS     ┌──────────────┐    HTTP (private)    ┌──────────────┐
│   web/   │ ────────────▶ │    api/      │ ────────────────────▶ │     ai/      │
│ Next.js  │ ◀──────────── │  Hono (BFF)  │ ◀──────────────────── │   FastAPI    │
└──────────┘               └──────────────┘                       └──────────────┘
                                  │
                                  ├─ Auth / session
                                  ├─ Input validation
                                  ├─ Orchestration / aggregation
                                  └─ Response shaping for FE
```

### Roles

| Service   | Responsibility                                             | Must NOT do                          |
| --------- | ---------------------------------------------------------- | ------------------------------------ |
| **web/**  | UI, client state, calls the BFF only                       | Call FastAPI directly                |
| **api/**  | Auth, validation, orchestration, FE-shaped responses       | Model code / ML logic                |
| **ai/**   | Inference, embeddings, prompts, GPU work                   | Handle end-user auth or sessions     |

### The golden rule

**FE never calls FastAPI directly.** All AI requests go `web → api → ai`. FastAPI is not publicly exposed — only `api/` can reach it.

Why BFF here:

- Keeps `web/` ignorant of internal services — FastAPI can be swapped/split/moved without FE changes.
- Puts auth, session, and rate-limiting in one place (`api/`).
- Keeps FastAPI focused on Python-native AI work instead of request plumbing.

---

## 3. Folder Structure

```
go123/
├── web/                    # Next.js FE
│   ├── src/
│   │   ├── app/            # App Router pages
│   │   ├── components/     # Flat or loosely grouped
│   │   ├── hooks/
│   │   ├── lib/
│   │   │   ├── api.ts      # fetch wrapper for api/
│   │   │   └── types.ts    # BFF response types (hand-maintained for now)
│   │   └── styles/
│   │       └── globals.css
│   ├── public/
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── api/                    # Hono BFF
│   ├── src/
│   │   ├── routes/         # HTTP route handlers
│   │   ├── middleware/     # auth, logging, rate-limit
│   │   ├── clients/
│   │   │   └── ai.ts       # fetch wrapper for ai/
│   │   └── index.ts
│   ├── tsconfig.json
│   └── package.json
│
├── ai/                     # FastAPI (Python, uv-managed)
│   ├── src/
│   │   ├── app/
│   │   │   ├── routers/
│   │   │   └── deps.py
│   │   ├── models/         # Pydantic models
│   │   ├── pipelines/
│   │   └── main.py
│   ├── tests/
│   ├── pyproject.toml
│   └── uv.lock
│
├── docker-compose.yml      # runs web, api, ai together
├── .env.example
├── .gitignore              # root-level: node_modules, .venv, .next, etc.
└── README.md
```

No root `package.json`, no `pnpm-workspace.yaml`, no `nx.json`. Each service is fully self-contained.

---

## 4. The Three Services

### 4a. `web/` — Next.js FE

Standard Next.js App Router project. Calls only `api/`.

```ts
// web/src/lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
```

```ts
// web/src/lib/types.ts — hand-maintained mirror of BFF responses
export type GenerateResponse = { text: string; tokens: number };
```

### 4b. `api/` — Hono BFF

Hono handles routing; talks to `ai/` over a private URL.

```ts
// api/src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { generateRoute } from './routes/generate';

const app = new Hono();
app.use('/*', cors({ origin: process.env.WEB_ORIGIN! }));
app.route('/v1/generate', generateRoute);

export default app;
```

```ts
// api/src/clients/ai.ts
const AI_URL = process.env.AI_URL!; // http://ai:8001 in docker-compose

export async function aiGenerate(body: unknown): Promise<unknown> {
  const res = await fetch(`${AI_URL}/v1/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI ${res.status}`);
  return res.json();
}
```

### 4c. `ai/` — FastAPI

Python + FastAPI + uv. Only does AI/ML work.

```python
# ai/src/main.py
from fastapi import FastAPI
from app.routers import generate

app = FastAPI(title="go123 AI", version="0.1.0")
app.include_router(generate.router, prefix="/v1/generate", tags=["generate"])

@app.get("/health")
def health():
    return {"ok": True}
```

```toml
# ai/pyproject.toml
[project]
name = "go123-ai"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]>=0.32",
  "pydantic>=2.9",
]

[tool.uv]
dev-dependencies = [
  "pytest>=8",
  "ruff>=0.7",
]
```

---

## 5. Warung AI Bookkeeper — Feature Map

What we're actually building on top of the scaffold: a free POS for TNG micro-merchants (kopitiam, pasar malam, kedai runcit) with AI onboarding, conversational analytics, LHDN/GoPinjam export, and a credit scorecard.

This section maps the MVP features onto the three services. It assumes the generic rules in §2 and §9 still hold — `web → api → ai` only, and `ai/` stays private behind the BFF even when it gets read-only DB access for chat.

> Full request/response shapes, stub-mode fixtures, middleware rules, and time-zone conventions live in [`CONTRACTS.md`](./CONTRACTS.md). This section is the architecture overview; `CONTRACTS.md` is the day-to-day reference during parallel work.
>
> Restricted values and LHDN-only formulas live in [`REFERENCE_DATA_V1.md`](./REFERENCE_DATA_V1.md) and [`LHDN_CALCULATIONS_V1.md`](./LHDN_CALCULATIONS_V1.md).

### 5a. Feature → service mapping

| MVP feature                           | `web/` (Next.js)                                    | `api/` (Hono BFF)                                                                                   | `ai/` (FastAPI)                                                                 |
| ------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **1. Rapid AI onboarding**            | Voice/text input, render generated menu grid        | `POST /v1/menu/parse` — auth, call `ai/`, apply UI defaults, persist `menu_items`                   | `POST /v1/parse-menu` — LLM extracts item facts and suggests draft item metadata |
| **2. Dynamic QR POS engine**          | Item buttons, running total, QR display, success    | `POST /v1/orders`, `POST /v1/orders/:id/paid`, offline sync                                         | —                                                                               |
| **3. Conversational BM dashboard**    | Stat cards, charts, heatmap, BM chat box            | `/v1/stats/*` aggregations; `POST /v1/ask` (auth, attach merchant context, proxy answer to FE)      | `POST /v1/ask`; `POST /v1/anomaly` (optional)                                   |
| **4. LHDN / GoPinjam export**         | Two buttons + result screens                        | `POST /v1/exports/lhdn` (4-document export pack), `POST /v1/credit/apply`                            | —                                                                               |
| **5. Credit scorecard**               | Gauges, profit %, sparkline, star rating            | `GET /v1/scorecard` — computes stability, margin, growth, diligence from DB                         | —                                                                               |

### 5b. Why this split

- **`ai/` only does the genuinely AI parts.** Menu parsing (LLM), conversational reasoning over merchant-scoped read-only data, optional anomaly detection. Writes and deterministic finance math still belong in `api/`.
- **`api/` owns the database and all business math.** Scorecard components, time-bucket aggregations, e-Invoice formatting, credit application bundling — plain SQL + TypeScript.
- **`web/` is dumb.** Three routes: `/onboarding`, `/pos`, `/dashboard`. It renders and POSTs, nothing else. Per §2, it doesn't know `ai/` exists.

### 5c. Endpoints

```
api/
  POST   /v1/menu/parse            # { transcript } → { items }
  GET    /v1/menu                  # list merchant's menu
  POST   /v1/menu                  # add/update items
  POST   /v1/orders                # { items } → { orderId, subtotalCents, taxCents, totalCents, qrPayload }
  POST   /v1/orders/:id/paid       # dummy webhook → mark paid
  GET    /v1/stats/today           # { totalCents, orderCount, topItems }
  GET    /v1/stats/heatmap         # hour × day-of-week grid
  GET    /v1/stats/growth          # MoM %, 3mo sparkline
  POST   /v1/ask                   # { question } → { answer, evidence }
  GET    /v1/scorecard             # { stability, margin, growth, diligence }
  POST   /v1/exports/lhdn          # { from, to } → { exportJobId, documents[] }
  POST   /v1/credit/apply          # → { approved, amountRm, reason }

ai/
  POST   /v1/parse-menu            # { transcript } → draft items: { name, priceCents, category?, unitCode?, classificationCode?, taxCode?, taxRateMode?, taxRatePct?, taxPerUnitCents?, reviewRequired? }
  POST   /v1/ask                   # { question, merchantId, timeZone } → { answer, evidence, queries? }
  POST   /v1/anomaly               # { series } → { isAnomaly, expected }   (optional)
```

### 5d. Database (RDS for PostgreSQL, owned by `api/`)

AWS RDS PostgreSQL on `db.t4g.micro` (free tier eligible), single-AZ, Singapore region — see §5g for the full AWS service map. Single-merchant operationally for the hackathon, but use a real `merchants` table and `merchant_id` foreign keys from day one.

From `api/`, use the `pg` npm package (or `postgres` / Kysely if you want a thin query builder). The actual schema lives in migrations under `api/` when scaffolded — this guide only captures the shape.

**Tables:**

- **`merchants`** — one seeded merchant row in MVP, but a real entity for export labels, supplier identity, MSIC code, registration details, and future tenant safety.
- **`menu_items`** — the merchant's POS catalog. Name, tax-exclusive selling price (in cents), category, optional MyInvois code-table metadata (`unit_code`, `classification_code`, `tax_code`), tax-rate fields, compliance review state, color, display order, and archive flag.
- **`orders`** — one row per customer order. Tax-exclusive subtotal, tax amount, payable total, payment reference, QR payload string, `paid_at` timestamp (null until the dummy payment webhook fires).
- **`order_items`** — line items per order. Carries `merchant_id` plus FKs to `orders` and `menu_items`, quantity, item-name snapshot, unit-price snapshot, and all sale-time compliance/tax snapshots needed for historical export reconstruction.
- **`expenses`** — merchant spend, feeds profitability and diligence. Source is either `'receipt-scan'` or `'manual'`.
- **`export_jobs`** / **`generated_documents`** — tracks the LHDN export pack and its generated files.

**Conventions:**

- All money fields are `INTEGER` cents — avoids float drift in aggregations and scorecard math.
- Persisted timestamps use `TIMESTAMPTZ`; lifecycle fields such as `paid_at`, `completed_at`, `generated_at`, and review timestamps may remain null until that state is reached.
- `BIGSERIAL` primary keys. No UUIDs unless the demo needs offline-generated IDs (e.g. offline POS queue).

### 5e. Key flows

**Onboarding (feature 1)**

```
web  → POST api/v1/menu/parse { transcript }
api  → POST ai/v1/parse-menu  { transcript }  →  { draft items }
api  validates suggested code values, applies defaults (e.g. color, display order, fallback category), and INSERTs menu_items
api  returns saved items to web
web  renders the POS grid
```

**POS order (feature 2)**

```
web  → POST api/v1/orders { items: [{ menuItemId, qty }] }
api  computes subtotal + tax + total, generates dummy DuitNow payload, INSERT orders + order_items snapshots
api  → 200 { orderId, subtotalCents, taxCents, totalCents, qrPayload }
web  renders QR
(judge scans → dummy success page) web → POST api/v1/orders/:id/paid
api  UPDATE orders SET paid_at = NOW()
web  shows "Paid" screen
```

**BM chat (feature 3)**

```
web  → POST api/v1/ask { question: "Bulan ni hari apa paling slow?" }
api  resolves merchantId + timeZone and forwards them to ai/v1/ask
ai   runs merchant-scoped read queries using read-only DB credentials
ai   → { answer, evidence, queries? }
api  → 200 { answer, evidence }
```

**Credit application (features 4 + 5)**

```
api  computes scorecard (stability / margin / growth / diligence) — pure SQL
web  → POST api/v1/credit/apply
api  bundles { scorecard, 3-month P&L } and returns a fake approval
```

**LHDN export pack (feature 4)**

```
web  → POST api/v1/exports/lhdn { from, to }
api  creates export_job, validates included order-item snapshots, generates 4 artifacts
api  uploads files, INSERTs generated_documents, marks job generated
api  → 201 { exportJobId, documents[] }
web  renders the export pack download/result screen
```

### 5f. Why `ai/` gets read-only DB access for chat

For conversational analytics, `ai/` is allowed to read merchant-scoped data directly. This is a deliberate architecture change from pure text-to-SQL.

Guardrails:

- `api/` still authenticates the merchant and remains the only public boundary.
- `ai/` gets separate read-only DB credentials, never write credentials.
- Merchant scoping must be enforced outside the model through query helpers, views, or parameter injection.
- Query timeouts, row limits, and query-count limits must be enforced.

Why this split still works:

- `ai/` can answer multi-step questions without bouncing raw SQL back to `api/`.
- `api/` still owns writes, exports, payments, and deterministic finance calculations.
- Auth and tenant identity still live in the BFF, not in the browser and not in end-user prompts.

### 5g. AWS service map

Region: **`ap-southeast-1`** (Singapore) — lowest latency from KL, all services below are available there.

| Concern       | AWS service                                        | Used by         | Purpose                                                                |
| ------------- | -------------------------------------------------- | --------------- | ---------------------------------------------------------------------- |
| Relational DB | **RDS for PostgreSQL** (`db.t4g.micro`, free tier) | `api/`, `ai/` (read-only for chat) | Source of truth — menu, orders, order_items, expenses, export metadata |
| File storage  | **S3**                                             | `api/`          | Generated LHDN export-pack documents; receipt images before/after OCR  |
| LLM           | **Bedrock** (Claude Haiku — fast + cheap enough)   | `ai/`           | Parse menu (§5e flow 1); conversational reasoning for BM chat (§5e flow 3) |
| Receipt OCR   | **Textract** (optional)                            | `api/` or `ai/` | Optional expense-capture aid; not required by the current diligence formula |
| Secrets       | env vars for the hackathon; Secrets Manager later  | `api/`, `ai/`   | DB password, AWS creds                                                 |

**What we deliberately skip:**

- **Lambda / API Gateway** — would fragment `api/` into per-route functions + add IAM and cold starts. Hono stays as one long-running service.
- **Cognito** — hackathon is single-tenant. Add only if the demo needs real merchant login.
- **DynamoDB** — dashboard and scorecard are aggregation-heavy; Postgres is the right shape.
- **Aurora Serverless v2 / DSQL** — fewer samples, not worth novelty risk during a hack.

**Deploy target** (service hosting, separate from the data layer):

| Option                   | When                                                                        |
| ------------------------ | --------------------------------------------------------------------------- |
| **Local + AWS for data** | Default for the hack — fastest iteration; `ngrok` for a public URL if judges need to scan |
| **App Runner**           | Point at each service's Dockerfile. One public URL per service, no VPC.     |
| **ECS Fargate**          | Only if you need VPC-private networking between `ai/` and RDS               |

**IAM (minimal):**

- `api/` needs: `s3:PutObject` + `s3:GetObject` on the bucket; RDS via username/password in `DATABASE_URL` (no IAM auth required).
- `ai/` needs: `bedrock:InvokeModel` plus a read-only `DATABASE_READ_URL`; add `textract:DetectDocumentText` / `textract:AnalyzeExpense` if OCR lives in `ai/` instead of `api/`.
- Local dev → IAM user access keys in `~/.aws/credentials`. Deployed → task/instance role, never bake keys into images.

---

## 6. Running Locally

### Per-service (dev loop)

```bash
# Terminal 1 — web/
cd web && pnpm install && pnpm dev                # http://localhost:3000

# Terminal 2 — api/
cd api && pnpm install && pnpm dev                # http://localhost:3001

# Terminal 3 — ai/
cd ai && uv sync && uv run uvicorn src.main:app --reload --port 8001
```

### All at once (docker-compose)

```yaml
# docker-compose.yml
services:
  web:
    build: ./web
    ports: ['3000:3000']
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
    depends_on: [api]

  api:
    build: ./api
    ports: ['3001:3001']
    environment:
      AI_URL: http://ai:8001
      WEB_ORIGIN: http://localhost:3000
    depends_on: [ai]

  ai:
    build: ./ai
    expose: ['8001']        # internal only — NOT published to host
```

```bash
docker-compose up --build
```

Note that `ai` uses `expose` (not `ports`) — FastAPI is reachable from `api` on the internal network but not from the host. That's the BFF boundary, enforced at the network layer.

---

## 7. Contracts Between Services

There's no shared package. Keep the FE ↔ BFF contract in sync by duplicating types by hand:

```ts
// web/src/lib/types.ts
export type GenerateResponse = { text: string; tokens: number };

// api/src/routes/generate.ts — same shape, kept in sync manually
type GenerateResponse = { text: string; tokens: number };
```

Fine with fewer than ~20 types changing infrequently. Grep is your friend.

### Why not codegen from FastAPI's OpenAPI?

It's tempting — FastAPI emits `/openapi.json` for free, and `openapi-typescript` turns it into `.ts`. Skip it for this project:

- Generated output is verbose (path-based nested types) and awkward to consume.
- Requires the `ai/` server running to regenerate — adds a step to every model change.
- Committed artifacts create PR churn and silently drift when someone forgets to rerun.
- For a hackathon-scale surface, the duplication is cheaper than the build step.

If the AI endpoint count grows past ~10–15 or `ai/` models start changing weekly, revisit — see [§8](#8-when-to-level-up).

---

## 8. When to Level Up

Add complexity only when you feel actual pain. Each step is a ratchet — easy to add, hard to remove.

| Pain you're feeling                                                    | Add this                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| "I keep copy-pasting the same types in `web/` and `api/`"              | A root-level `shared/` folder with plain `.ts` files (relative imports) |
| "Relative imports (`../../shared`) are getting ugly"                   | pnpm workspaces + `packages/shared-schemas`                    |
| "FastAPI Pydantic changes keep silently breaking the BFF"              | OpenAPI → TS codegen (committed `generated.ts`)                |
| "Test suite is slow; I want incremental / affected builds"             | Nx or Turborepo                                                |
| "I need a second FE app that reuses the first one's components"        | pnpm workspaces + `packages/shared-ui`                         |

**Default posture: resist.** Premature workspaces / codegen / Nx add setup, build-graph complexity, and cognitive load. Add them at the moment of actual pain, not ahead of time.

---

## 9. Guidelines & Rules

### Service boundaries (BFF)

| Rule                                                   | Why                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `web/` only calls `api/`                               | BFF is the single public entry point                             |
| `api/` is the only caller of `ai/`                     | FastAPI stays private; auth lives in the BFF                     |
| `ai/` never handles end-user auth or sessions          | Those belong in the BFF                                          |
| `ai/` is not publicly reachable                        | Reduces attack surface; enforced via `docker-compose`'s `expose` |
| No business rules in `ai/` that depend on the end user | Those belong in the BFF                                          |

### Folder hygiene

| Rule                                                           | Why                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| No cross-folder imports (`web/` cannot `import` from `api/`)   | The HTTP boundary is the contract                            |
| Each service has its own lockfile                              | Independent upgrades; no workspace collisions                |
| Secrets live in root `.env` (gitignored), read via env vars    | One place to configure local dev                             |
| Ports: `web=3000`, `api=3001`, `ai=8001`                       | Consistent across `docker-compose.yml` and per-service `dev` |
