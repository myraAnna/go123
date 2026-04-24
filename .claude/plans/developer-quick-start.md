# Developer Quick Start

## Prerequisites

**Install Make first** (required):

**macOS:**
```bash
xcode-select --install
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install build-essential
```

**Windows:**
- Use WSL2, then: `sudo apt install build-essential`

**Verify:**
```bash
make --version
```

## First Time Setup (Run Once)

```bash
git clone <repo-url>
cd go123
make setup
```

This will:
- Create `.env` from template
- Install all dependencies (web, api, ai)
- Ready to develop!

## Pick Your Service

### Web Developer (Next.js)

```bash
make dev-web
```

Opens at: http://localhost:3000

**Your workspace:** `web/`
- Routes: `web/src/app/`
- Components: `web/src/components/`
- API client: `web/src/lib/api.ts`

---

### API Developer (Hono BFF)

```bash
make dev-api
```

Opens at: http://localhost:3001

**Your workspace:** `api/`
- Routes: `api/src/routes/`
- Middleware: `api/src/middleware/`
- Database: Owned by you
- AI client: `api/src/clients/ai.ts`

---

### AI Developer (FastAPI)

```bash
make dev-ai
```

Opens at: http://localhost:8001

**Your workspace:** `ai/`
- Routes: `ai/src/app/routers/`
- Models: `ai/src/models/`
- **Never** call DB directly
- **Never** handle auth

---

## Working with Claude Code

1. Read `.claude/specs/CONTRACTS.md` for API shapes
2. Read `.claude/specs/MONOREPO_MULTI_APP_GUIDE.md` for architecture
3. Create design docs in `.claude/plans/your-feature.md` (kebab-case)
4. **NO TESTS** — Build features fast

## Golden Rules

- No tests
- Web never calls AI directly
- AI never touches DB
- All money in cents (integers)
- Timestamps in UTC ISO-8601
- Markdown: kebab-case in `.claude/plans/`
- **HACKATHON MODE** — Speed > Everything. Ignore production concerns, security, scalability, NFRs.

## Hackathon Mindset

**Optimize for:** Speed, working demo, features

**Ignore:** Production readiness, security, scalability, NFRs

**If it works for the demo, ship it.**

## Docker (All Services)

```bash
make docker-up     # Start everything
make docker-down   # Stop all
```

## Troubleshooting

**Port already in use?**
```bash
lsof -ti:3000 | xargs kill  # web
lsof -ti:3001 | xargs kill  # api
lsof -ti:8001 | xargs kill  # ai
```

**Dependencies broken?**
```bash
make clean
make setup
```

**Need fresh database?**
```bash
docker-compose down -v
docker-compose up -d db
```
