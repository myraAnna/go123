# api/ — Hono BFF

**Rule**: You're the BFF. Own DB, auth, orchestration. Only caller of `ai/`.

## Stack
- Hono, PostgreSQL
- Package manager: `bun`
- Port: 3001

## Responsibilities
1. Auth (`X-Merchant-Id` header)
2. Input validation
3. Orchestration (call `ai/` for LLM work)
4. Database ownership (menu_items, orders, order_items, expenses)
5. Response shaping (snake_case → camelCase)

## Endpoints

**Menu**: `POST /v1/menu/parse`, `GET /v1/menu`, `POST /v1/menu`  
**Orders**: `POST /v1/orders`, `POST /v1/orders/:id/paid`  
**Stats**: `GET /v1/stats/today`, `GET /v1/stats/heatmap`, `GET /v1/stats/growth`  
**AI**: `POST /v1/ask` (call `ai/` for SQL, validate SELECT-only)  
**Credit**: `GET /v1/scorecard`, `POST /v1/einvoice/generate`, `POST /v1/credit/apply`  
**Health**: `GET /health`

See `../.claude/specs/CONTRACTS.md` for shapes.

## DB Schema
```sql
menu_items, orders, order_items, expenses
```
Money: `INT` cents. Timestamps: `TIMESTAMPTZ`. PKs: `BIGSERIAL`.

## AI Client
```ts
// src/clients/ai.ts
const res = await fetch(`${AI_URL}/v1/parse-menu`, { method: 'POST', body: JSON.stringify({ transcript }) });
```

## SQL Guardrail
```ts
if (!sql.startsWith('SELECT') || /\b(INSERT|UPDATE|DELETE|DROP)\b/i.test(sql)) {
  throw new Error('Non-SELECT SQL rejected');
}
```

## Middleware
- Auth: Read `X-Merchant-Id` (default `"1"`)
- CORS: Allow `WEB_ORIGIN` only
- Logger: `{ method, path, status, durationMs, merchantId }`

## FAKE_MODE=1
Bypass DB/AI, return fixtures from `src/fixtures/*.json`

## Quick Start
```bash
make dev-api    # Starts on http://localhost:3001
```

Or manually:
```bash
bun install && bun dev
```

## Don't
- Handle end-user auth
- Implement ML/AI logic
- Expose raw DB errors
- Use floats for money
