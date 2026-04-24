# web/ — Next.js FE

**Rule**: Call `api/` only. Never call `ai/` directly.

## Stack
- Next.js App Router, React, Tailwind
- Package manager: `bun`
- Port: 3000

## Routes
- `/onboarding` → Voice-to-Menu
- `/pos` → Dynamic QR POS
- `/dashboard` → AI chat, stats, LHDN, credit

## API Calls

All via `src/lib/api.ts`:
```ts
import { apiFetch } from '@/lib/api';
const result = await apiFetch('/v1/menu/parse', { method: 'POST', body: JSON.stringify({ transcript }) });
```

Base URL: `NEXT_PUBLIC_API_URL` (default: `http://localhost:3001`)

## Key Endpoints

`POST /v1/menu/parse`, `POST /v1/orders`, `GET /v1/stats/*`, `POST /v1/ask`, `GET /v1/scorecard`, `POST /v1/einvoice/generate`, `POST /v1/credit/apply`

See `../.claude/specs/CONTRACTS.md` for shapes.

## Conventions
- Money: Display as `RM ${(cents / 100).toFixed(2)}`
- Timestamps: Convert UTC → MYT for display
- IDs: Strings
- Mobile-first, BM-friendly UI

## Types

Hand-maintained in `src/lib/types.ts`. Mirror BFF responses.

## Quick Start
```bash
make dev-web    # Starts on http://localhost:3000
```

Or manually:
```bash
bun install && bun dev
```

## Components
- `components/pos/` → MenuGrid, Cart, QRDisplay
- `components/dashboard/` → StatCards, Heatmap, ChatBox, Scorecard

## Don't
- ❌ Call `ai/` directly
- ❌ Implement business logic
- ❌ Store secrets
