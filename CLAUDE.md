# CLAUDE.md

Warung AI — AI-powered POS for Malaysian micro-merchants.

## Rules

1. NO TESTS
2. Markdown: kebab-case in `.claude/plans/`
3. HACKATHON MODE — Speed > Everything. Ignore production concerns.

## Architecture

`web/` → `api/` (BFF) → `ai/`

**Golden rule**: Web never calls AI directly.

## Quick Start

```bash
make setup        # First time
make dev-web      # Web developer
make dev-api      # API developer
make dev-ai       # AI developer
```

## Conventions

- Money: INT cents (500 = RM 5.00)
- Timestamps: UTC ISO-8601, MYT for aggregations
- IDs: Strings
- Keys: camelCase (wire), snake_case (DB)
- FAKE_MODE=1 → Stub mode

## Git Commits

Format: `what(which): message`
- what: feat, fix, refactor, docs, chore
- which: web, api, ai, infra, docs
- message: lowercase, <100 chars

## Context

- `AGENTS.md` → Full project context
- `.claude/specs/` → API contracts & architecture
- Service guides: `web/AGENTS.md`, `api/AGENTS.md`, `ai/AGENTS.md`
