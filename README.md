# Warung AI

AI-powered POS for Malaysian micro-merchants

## Quick Start (For New Developers)

**First time? Run this:**
```bash
make setup
```

This will:
- Create `.env` from example
- Install all dependencies (web, api, ai)
- Ready to develop!

## Development (Pick Your Service)

**Web Developer:**
```bash
make dev-web    # http://localhost:3000
```

**API Developer:**
```bash
make dev-api    # http://localhost:3001
```

**AI Developer:**
```bash
make dev-ai     # http://localhost:8001
```

## Docker (All Services)

```bash
make docker-up     # Start everything
make docker-down   # Stop all
```

## Architecture

```
web/ (:3000) → api/ (:3001) → ai/ (:8001)
                                → db/ (:5432)
```

**Rule**: `web` never calls `ai` directly. All requests: `web → api → ai`

## ⚡ Hackathon Philosophy

**This is a hackathon project.** Optimize for:
- Speed over quality
- Working demo over production-ready
- Features over security/scalability
- Developer velocity over best practices

**Explicitly ignore**: Production readiness like NFRs

**If it works for the demo, ship it.**

## For Claude Code Users

This project is optimized for Claude Code development:

1. **Read first**: `.claude/specs/CONTRACTS.md` (API contracts)
2. **Read**: `.claude/specs/MONOREPO_MULTI_APP_GUIDE.md` (architecture)
3. **Check**: `AGENTS.md` and service-specific `AGENTS.md` files
4. **No tests** — Build features fast for hackathon
5. **Markdown**: kebab-case, place in `.claude/plans/`

## Documentation

- `AGENTS.md` → Monorepo context
- `CLAUDE.md` → AI assistant guide
- `.claude/specs/` → API contracts & architecture
- Service guides: `web/AGENTS.md`, `api/AGENTS.md`, `ai/AGENTS.md`
