# CLAUDE.md

**Warung AI** — AI-powered POS for Malaysian micro-merchants (TNG QR → intelligent business partner).

## Golden Rules

1. **NO TESTS** — Don't write tests. Build features fast.
2. **NO test files** — Skip `tests/`, `*.test.*`, `*.spec.*`
3. **Markdown files**: kebab-case, place in `.claude/plans/` (e.g., `pos-flow.md`)
4. **HACKATHON MODE** — Agility > Everything. Ship fast, iterate faster.
5. **IGNORE PRODUCTION CONCERNS** — No security, no scalability, no NFRs. Just make it work for the demo.

## Architecture

`web/` (Next.js) → `api/` (Hono BFF) → `ai/` (FastAPI)

**Rules**:
1. `web` never calls `ai` directly
2. No cross-folder imports
3. Each service independent (own deps, lockfile)
4. Package managers: `bun` (web/api), `uv + py3.13` (ai)

## Services

| Service | Port | Role |
|---------|----|----|
| `web/` | 3000 | Next.js UI |
| `api/` | 3001 | Hono BFF, owns DB |
| `ai/` | 8001 | FastAI, LLM only |

## Hackathon Philosophy

**Optimize for:** Speed, working demo, features

**Ignore:** Production readiness, security, scalability, NFRs

**If it works for the demo, ship it.**

## MVP

1. Voice-to-Menu → LLM → POS grid
2. Dynamic QR POS → Tap, QR, log
3. Conversational Dashboard → BM/English AI chat
4. LHDN Compliance → e-Invoice, Borang B
5. Credit Scorecard → GoPinjam approval

## Infrastructure

- **Region**: `ap-southeast-1`
- **RDS PostgreSQL** → `api/` DB
- **OSS** → File storage
- **Bedrock** (Claude Haiku) → `ai/`
- **MCP**: ✅ Python 3.13, ECS/VPC/RDS/OSS

## Conventions

- Money: `INT` cents (500 = RM 5.00)
- Timestamps: UTC on wire, MYT for aggregations
- IDs: Strings
- Keys: camelCase (wire), snake_case (DB)
- `FAKE_MODE=1` → Stub mode (fixtures, no DB/AWS)

## DB

```sql
menu_items, orders, order_items, expenses
```
Money: `INT` cents. Timestamps: `TIMESTAMPTZ`. PKs: `BIGSERIAL`.

## Quick Start

```bash
cd web && bun dev        # :3000
cd api && bun dev        # :3001
cd ai && uv run uvicorn src.main:app --reload --port 8001
```

## API Endpoints

**api/**: `/v1/menu/parse`, `/v1/orders`, `/v1/stats/*`, `/v1/ask`, `/v1/scorecard`, `/v1/einvoice/generate`, `/v1/credit/apply`

**ai/**: `/v1/parse-menu`, `/v1/text-to-sql`, `/v1/anomaly`

Full shapes: `CONTRACTS.md`

## Context

- `.claude/specs/CONTRACTS.md` → API shapes
- `.claude/specs/MONOREPO_MULTI_APP_GUIDE.md` → Architecture details
- `.claude/plans/` → Design docs (kebab-case)
- Service guides: `web/AGENTS.md`, `api/AGENTS.md`, `ai/AGENTS.md`
