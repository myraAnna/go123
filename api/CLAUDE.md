# api/ CLAUDE.md

**Hono BFF** for Warung AI — owns DB, auth, orchestration.

## Rules
1. NO TESTS — Don't write tests
2. Markdown: kebab-case in `.claude/plans/`
3. You're the only caller of `ai/`
4. Own all business logic and DB
5. Package manager: `bun`
6. Money: INT cents only
7. HACKATHON MODE — Speed > Everything. Ignore security, scalability, NFRs. Hardcoded secrets OK.

## Endpoints
`/v1/menu/*`, `/v1/orders/*`, `/v1/stats/*`, `/v1/ask`, `/v1/scorecard`, `/v1/einvoice/generate`, `/v1/credit/apply`

## DB
```sql
menu_items, orders, order_items, expenses
```
Money: `INT` cents. Timestamps: `TIMESTAMPTZ`.

## SQL Guardrail
SELECT-only from `ai/`. Reject DDL/DML.

## Middleware
Auth (`X-Merchant-Id`), CORS, logging

## FAKE_MODE=1
Return fixtures, bypass DB/AI

## Quick Start
```bash
bun dev  # :3001
```

## Context
- `../.claude/specs/CONTRACTS.md` → API shapes
- `../AGENTS.md` → Root monorepo context
