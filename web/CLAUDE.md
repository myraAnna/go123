# web/ CLAUDE.md

**Next.js FE** for Warung AI — calls `api/` BFF only.

## Rules
1. NO TESTS — Don't write tests
2. Markdown: kebab-case in `.claude/plans/`
3. Never call `ai/` directly
4. All API calls via `src/lib/api.ts`
5. Package manager: `bun`
6. HACKATHON MODE — Speed > Everything. Ignore production concerns, security, scalability.

## Routes
- `/onboarding` → Voice-to-Menu
- `/pos` → QR POS
- `/dashboard` → AI chat, stats, LHDN, credit

## Key Endpoints
`POST /v1/menu/parse`, `POST /v1/orders`, `GET /v1/stats/*`, `POST /v1/ask`, `GET /v1/scorecard`

## Conventions
- Money: INT cents → `RM X.XX`
- Timestamps: UTC → MYT
- Mobile-first, BM-friendly

## Quick Start
```bash
bun dev  # :3000
```

## Context
- `../.claude/specs/CONTRACTS.md` → API shapes
- `../AGENTS.md` → Root monorepo context
