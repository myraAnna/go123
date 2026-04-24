# Warung AI

AI-powered POS for Malaysian micro-merchants

## Prerequisites

**Install Make first** (required for all commands below):

```bash
xcode-select --install  # Includes make
```

**Verify installation:**
```bash
make --version  # Should show GNU Make 4.x or later
```

**Don't know how to set up?** Just ask Claude Code:
- "Help me install make on macOS"
- "Set up my development environment for this project"
- "Run make setup and tell me if there are any errors"

Claude Code can help you install dependencies, troubleshoot issues, and get everything running.

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

## Hackathon Philosophy

**This is a hackathon project.** Optimize for:
- Speed over quality
- Working demo over production-ready
- Features over security/scalability
- Developer velocity over best practices

**Explicitly ignore**: Production readiness like NFRs

**If it works for the demo, ship it.**

## For Claude Code Users

This project is optimized for AI-assisted development:

1. **Just describe what you want** — Claude Code reads context automatically
2. **Context files**: `AGENTS.md`, service-level `CLAUDE.md`, `.claude/specs/`
3. **No tests** — Build features fast
4. **Markdown**: kebab-case in `.claude/plans/`
5. **Commits**: Claude Code follows the convention in `AGENTS.md`

## Documentation

- `AGENTS.md` → Monorepo context
- `CLAUDE.md` → AI assistant guide
- `.claude/specs/` → Original API contracts & architecture files
- Service guides: `web/AGENTS.md`, `api/AGENTS.md`, `ai/AGENTS.md`
