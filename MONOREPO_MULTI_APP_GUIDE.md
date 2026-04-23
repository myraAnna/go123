# go123 Monorepo Guide

> Three services in one git repo: **Next.js FE → Hono BFF → FastAPI (AI)**. No workspace tooling, no shared packages — each service manages its own deps. A simple git-folder monorepo that keeps the architecture clean without paying for tooling you don't yet need.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture & BFF Pattern](#2-architecture--bff-pattern)
3. [Folder Structure](#3-folder-structure)
4. [The Three Services](#4-the-three-services)
5. [Running Locally](#5-running-locally)
6. [Contracts Between Services](#6-contracts-between-services)
7. [When to Level Up](#7-when-to-level-up)
8. [Guidelines & Rules](#8-guidelines--rules)

---

## 1. Overview

**Stack:**

- `web/` — Next.js (App Router), React, Tailwind
- `api/` — Hono REST API acting as the **BFF** (Backend for Frontend)
- `ai/` — Python FastAPI for AI/ML work (inference, generation, etc.), managed with [uv](https://docs.astral.sh/uv/)

**What this is:** three independent services in one git repo. Each service has its own `package.json` / `pyproject.toml`, its own lockfile, its own `node_modules` / `.venv`. A single `docker-compose.yml` runs all three locally.

**What this isn't:** a tooled monorepo. No Nx, no pnpm workspaces, no shared packages. That's on the table for later, if and when the project outgrows plain folders — see [§7](#7-when-to-level-up).

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

## 5. Running Locally

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

## 6. Contracts Between Services

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

If the AI endpoint count grows past ~10–15 or `ai/` models start changing weekly, revisit — see [§7](#7-when-to-level-up).

---

## 7. When to Level Up

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

## 8. Guidelines & Rules

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
