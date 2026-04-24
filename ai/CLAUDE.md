# ai/ CLAUDE.md

**FastAPI AI** for Warung AI — stateless LLM inference only.

## Rules
1. NO TESTS — Don't write tests
2. Markdown: kebab-case in `.claude/plans/`
3. No DB access
4. No auth/sessions
5. No business logic
6. Package manager: `uv` + Python 3.13
7. HACKATHON MODE — Speed > Everything. Ignore production concerns. Hardcoded AWS creds fine.

## Endpoints
- `POST /v1/parse-menu` → LLM menu parsing
- `POST /v1/text-to-sql` → Text-to-SQL (SELECT-only)
- `POST /v1/anomaly` → Z-score detection

## Bedrock
Claude Haiku via `boto3`, region `ap-southeast-1`

## Key Rules
- Categories: main/side/drink/dessert/other
- SELECT-only SQL
- MYT timezone for time queries
- Preserve names verbatim

## FAKE_MODE=1
Return fixtures, bypass Bedrock

## Quick Start
```bash
uv run uvicorn src.main:app --reload --port 8001
```

## Context
- `../.claude/specs/CONTRACTS.md` → API shapes
- `../AGENTS.md` → Root monorepo context
