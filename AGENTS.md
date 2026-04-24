# Warung AI — Monorepo

**AI-powered POS for Malaysian micro-merchants** — transforms TNG QR into intelligent business partner.

## Golden Rules

1. **NO TESTS** — We don't write tests. Focus on building features fast for the hackathon.
2. **NO testing directories or test files** — Skip `tests/`, `*.test.ts`, `*.spec.ts`, etc.
3. **Markdown files**: kebab-case, place in `.claude/plans/` (e.g., `menu-parser-design.md`)
4. **HACKATHON MODE** — Agility > Everything. Ship fast, iterate faster.
5. **IGNORE PRODUCTION CONCERNS** — No security hardening, no scalability, no NFRs. Just make it work for the demo.

## Architecture

```
web/ (Next.js) → api/ (Hono BFF) → ai/ (FastAPI)
```

**Rule**: `web` never calls `ai` directly. All requests: `web → api → ai`

## Services

| Service | Tech | PM | Port | Role |
|---------|------|----|----|----|
| `web/` | Next.js, Tailwind | bun | 3000 | UI, calls BFF only |
| `api/` | Hono, PostgreSQL | bun | 3001 | BFF, owns DB, auth |
| `ai/` | FastAPI, Bedrock | uv | 8001 | LLM inference only |

## Hackathon Philosophy

**Optimize for:** Speed, working demo, features

**Ignore:** Production readiness, security, scalability, NFRs, edge cases

**If it works for the demo, ship it.**

## MVP Features

1. Voice-to-Menu → LLM parses speech to POS grid
2. Dynamic QR POS → Tap items, generate QR, log orders
3. Conversational Dashboard → BM/English AI chat + stats
4. LHDN Compliance → e-Invoice PDF, Borang B pre-fill
5. Credit Scorecard → Trust Score, GoPinjam approval

## Infrastructure

- **Region**: `ap-southeast-1` (Singapore)
- **RDS PostgreSQL** → `api/` database
- **OSS** → File storage (e-Invoices, receipts)
- **Bedrock** (Claude Haiku) → `ai/` LLM
- **MCP**: ✅ Configured with Python 3.13

## Quick Start

```bash
cd web && bun dev        # localhost:3000
cd api && bun dev        # localhost:3001
cd ai && uv run uvicorn src.main:app --reload --port 8001
```

## Key Conventions

- **Money**: Integer cents (500 = RM 5.00)
- **Timestamps**: UTC ISO-8601 on wire, MYT for aggregations
- **IDs**: Strings (not numbers)
- **Keys**: camelCase at wire, snake_case in DB
- **FAKE_MODE=1**: Stub mode for demos (no DB/AWS needed)

## DB Schema

```sql
menu_items, orders, order_items, expenses
```
All money: `INT` cents. Timestamps: `TIMESTAMPTZ`. PKs: `BIGSERIAL`.

## Context Files

- `.claude/specs/CONTRACTS.md` → API request/response shapes
- `.claude/specs/MONOREPO_MULTI_APP_GUIDE.md` → Full architecture
- `.claude/plans/` → Design docs (kebab-case: `feature-name.md`)
- Service guides: `web/AGENTS.md`, `api/AGENTS.md`, `ai/AGENTS.md`