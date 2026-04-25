# Revenue Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four revenue analytics endpoints (`/v1/stats/summary`, `/v1/stats/top-items`, `/v1/stats/trend`, `/v1/stats/heatmap`) for the merchant dashboard.

**Architecture:** New Hono router at `api/src/routes/stats.ts` mounted at `/v1/stats`. All four handlers are pure SQL on existing tables (`orders`, `order_items`, `menu_items`) via the shared `postgres` client. No schema changes, no `ai/` calls, no new dependencies.

**Tech Stack:** Hono, postgres.js, Bun, PostgreSQL. TypeScript.

**Project rules in effect (override skill defaults):**
- No tests, no test files. Verify with `curl` against `make dev-api`.
- Markdown plans in `.claude/plans/` (this file).
- Hackathon mode — ignore production hardening.
- Commit format: `what(which): message` (e.g., `feat(api): add stats summary endpoint`).

**Spec:** `.claude/plans/revenue-analytics-design.md`

**Pre-flight (run once before starting):**

- [ ] **Confirm dev server runs.** In one terminal: `make dev-api`. Expect `API server running on http://localhost:3001`.
- [ ] **Confirm seeded merchant has data.** `psql $DATABASE_URL -c "SELECT COUNT(*) FROM orders WHERE merchant_id = 1 AND paid_at IS NOT NULL;"` — even `0` is fine (handlers must return zero-valued payloads, not error).
- [ ] **Health check passes.** `curl http://localhost:3001/health` → `{"ok":true,...}`.

---

## Task 1: Scaffold the stats router and shared window parser

Create the router file with shared helpers, mount it in `index.ts`, and add a stub route to verify wiring. No business logic yet.

**Files:**
- Create: `api/src/routes/stats.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: Create `api/src/routes/stats.ts` with the router skeleton and window parser.**

```ts
import { Hono } from 'hono';
import { db } from '../db/index.js';

export const statsRouter = new Hono();

const isIsoDate = (s: string) => !Number.isNaN(Date.parse(s));

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type Window = { since: Date; until: Date };

/**
 * Parses ?since=&until= ISO query params with last-30-days defaults.
 * Returns either a parsed window or a 400-ready error message.
 */
function parseWindow(sinceParam: string | undefined, untilParam: string | undefined):
  | { window: Window }
  | { error: string } {
  if (sinceParam !== undefined && !isIsoDate(sinceParam)) {
    return { error: 'since must be a valid ISO date' };
  }
  if (untilParam !== undefined && !isIsoDate(untilParam)) {
    return { error: 'until must be a valid ISO date' };
  }
  const until = untilParam ? new Date(untilParam) : new Date();
  const since = sinceParam ? new Date(sinceParam) : new Date(until.getTime() - DEFAULT_WINDOW_MS);
  if (since.getTime() >= until.getTime()) {
    return { error: 'since must be earlier than until' };
  }
  return { window: { since, until } };
}

// Suppress unused-import warning until first handler lands.
void db;

// GET /v1/stats/_ping — temporary, removed after Task 2 lands.
statsRouter.get('/_ping', (c) => c.json({ ok: true }));
```

- [ ] **Step 2: Mount the router in `api/src/index.ts`.**

In `api/src/index.ts`, add the import beside the other route imports and register it beside the other `app.route(...)` calls.

```ts
// add to the imports block at the top
import { statsRouter } from './routes/stats.js';
```

```ts
// add inside the section where app.route(...) calls live, near the other /v1/* routes
app.route('/v1/stats', statsRouter);
```

- [ ] **Step 3: Verify the router is wired.**

```bash
curl -s -H "X-Merchant-Id: 1" http://localhost:3001/v1/stats/_ping
```

Expected: `{"ok":true}`. Bun's hot reload should pick up the new file; restart `make dev-api` if not.

- [ ] **Step 4: Commit.**

```bash
git add api/src/routes/stats.ts api/src/index.ts
git commit -m "feat(api): scaffold stats router with window parser"
```

---

## Task 2: Implement `GET /v1/stats/summary`

Headline KPIs (revenue, order count, AOV) with optional period-over-period compare.

**Files:**
- Modify: `api/src/routes/stats.ts`

- [ ] **Step 1: Replace the `_ping` route with the `summary` handler.**

Delete the `_ping` line (and its `void db;` workaround) and add:

```ts
type RevenueRow = { revenue_cents: number; order_count: number };

async function fetchRevenue(merchantId: string, since: Date, until: Date): Promise<RevenueRow> {
  const [row] = await db<RevenueRow[]>`
    SELECT COALESCE(SUM(total_cents), 0)::int AS revenue_cents,
           COUNT(*)::int                       AS order_count
    FROM orders
    WHERE merchant_id = ${merchantId}
      AND paid_at IS NOT NULL
      AND paid_at >= ${since}
      AND paid_at <  ${until}
  `;
  return row;
}

const pctChange = (curr: number, prev: number): number | null => {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10; // one decimal place
};

// GET /v1/stats/summary?since=&until=&compare=true
statsRouter.get('/summary', async (c) => {
  const merchantId = c.get('merchantId');

  const parsed = parseWindow(c.req.query('since'), c.req.query('until'));
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);
  const { since, until } = parsed.window;

  const compare = c.req.query('compare') === 'true';

  const current = await fetchRevenue(merchantId, since, until);

  const periodMs = until.getTime() - since.getTime();
  const periodDays = Math.ceil(periodMs / (24 * 60 * 60 * 1000));
  const aov = current.order_count === 0
    ? 0
    : Math.round(current.revenue_cents / current.order_count);

  let comparePrevious: { revenueChangePct: number | null; orderCountChangePct: number | null } | null = null;

  if (compare) {
    const prevUntil = since;
    const prevSince = new Date(prevUntil.getTime() - periodMs);
    const prev = await fetchRevenue(merchantId, prevSince, prevUntil);
    if (prev.order_count === 0 && prev.revenue_cents === 0) {
      comparePrevious = null;
    } else {
      comparePrevious = {
        revenueChangePct: pctChange(current.revenue_cents, prev.revenue_cents),
        orderCountChangePct: pctChange(current.order_count, prev.order_count),
      };
    }
  }

  return c.json({
    revenueCents: current.revenue_cents,
    orderCount: current.order_count,
    averageOrderValueCents: aov,
    periodDays,
    comparePrevious,
  });
});
```

- [ ] **Step 2: Smoke-test the default window.**

```bash
curl -s -H "X-Merchant-Id: 1" http://localhost:3001/v1/stats/summary | jq .
```

Expected: `{"revenueCents":N,"orderCount":N,"averageOrderValueCents":N,"periodDays":30,"comparePrevious":null}`. Numbers vary by DB state; `0` is acceptable.

- [ ] **Step 3: Smoke-test compare flag.**

```bash
curl -s -H "X-Merchant-Id: 1" "http://localhost:3001/v1/stats/summary?compare=true" | jq .
```

Expected: same shape, `comparePrevious` is either `null` (no prior data) or `{"revenueChangePct":<num|null>,"orderCountChangePct":<num|null>}`.

- [ ] **Step 4: Smoke-test invalid input.**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "X-Merchant-Id: 1" \
  "http://localhost:3001/v1/stats/summary?since=not-a-date"
```

Expected: `400`.

- [ ] **Step 5: Commit.**

```bash
git add api/src/routes/stats.ts
git commit -m "feat(api): add /v1/stats/summary endpoint"
```

---

## Task 3: Implement `GET /v1/stats/heatmap`

Day-of-week × hour grid, MYT-bucketed. Sparse — only cells with orders.

**Files:**
- Modify: `api/src/routes/stats.ts`

- [ ] **Step 1: Append the `heatmap` handler at the end of `stats.ts`.**

```ts
type HeatmapRow = {
  day_of_week: number;
  hour: number;
  order_count: number;
  revenue_cents: number;
};

// GET /v1/stats/heatmap?since=&until=
statsRouter.get('/heatmap', async (c) => {
  const merchantId = c.get('merchantId');

  const parsed = parseWindow(c.req.query('since'), c.req.query('until'));
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);
  const { since, until } = parsed.window;

  const rows = await db<HeatmapRow[]>`
    SELECT EXTRACT(DOW  FROM paid_at AT TIME ZONE 'Asia/Kuala_Lumpur')::int AS day_of_week,
           EXTRACT(HOUR FROM paid_at AT TIME ZONE 'Asia/Kuala_Lumpur')::int AS hour,
           COUNT(*)::int                AS order_count,
           COALESCE(SUM(total_cents),0)::int AS revenue_cents
    FROM orders
    WHERE merchant_id = ${merchantId}
      AND paid_at IS NOT NULL
      AND paid_at >= ${since}
      AND paid_at <  ${until}
    GROUP BY 1, 2
    ORDER BY 1, 2
  `;

  return c.json({
    cells: rows.map((r) => ({
      dayOfWeek: r.day_of_week,
      hour: r.hour,
      orderCount: r.order_count,
      revenueCents: r.revenue_cents,
    })),
  });
});
```

- [ ] **Step 2: Smoke-test.**

```bash
curl -s -H "X-Merchant-Id: 1" http://localhost:3001/v1/stats/heatmap | jq .
```

Expected: `{"cells":[...]}`. Each cell has `dayOfWeek` (0–6), `hour` (0–23), `orderCount`, `revenueCents`. Empty array is fine if no paid orders.

- [ ] **Step 3: Commit.**

```bash
git add api/src/routes/stats.ts
git commit -m "feat(api): add /v1/stats/heatmap endpoint"
```

---

## Task 4: Implement `GET /v1/stats/top-items`

Best sellers and worst sellers (including zero-sale items via LEFT JOIN from `menu_items`).

**Files:**
- Modify: `api/src/routes/stats.ts`

- [ ] **Step 1: Append the `top-items` handler at the end of `stats.ts`.**

```ts
type TopItemRow = {
  id: bigint | string;
  name: string;
  qty: number;
  revenue_cents: number;
};

const LIMIT_MIN = 1;
const LIMIT_MAX = 50;
const LIMIT_DEFAULT = 10;

const parseLimit = (raw: string | undefined): number => {
  if (raw === undefined) return LIMIT_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return LIMIT_DEFAULT;
  return Math.min(Math.max(Math.trunc(n), LIMIT_MIN), LIMIT_MAX);
};

// GET /v1/stats/top-items?since=&until=&limit=10
statsRouter.get('/top-items', async (c) => {
  const merchantId = c.get('merchantId');

  const parsed = parseWindow(c.req.query('since'), c.req.query('until'));
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);
  const { since, until } = parsed.window;

  const limit = parseLimit(c.req.query('limit'));

  const best = await db<TopItemRow[]>`
    SELECT mi.id,
           mi.name,
           SUM(oi.qty)::int                       AS qty,
           SUM(oi.qty * oi.unit_price_cents)::int AS revenue_cents
    FROM order_items oi
    JOIN orders     o  ON o.id = oi.order_id
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE oi.merchant_id = ${merchantId}
      AND o.paid_at IS NOT NULL
      AND o.paid_at >= ${since}
      AND o.paid_at <  ${until}
    GROUP BY mi.id, mi.name
    ORDER BY qty DESC, revenue_cents DESC
    LIMIT ${limit}
  `;

  const worst = await db<TopItemRow[]>`
    SELECT mi.id,
           mi.name,
           COALESCE(sales.qty, 0)           AS qty,
           COALESCE(sales.revenue_cents, 0) AS revenue_cents
    FROM menu_items mi
    LEFT JOIN (
      SELECT oi.menu_item_id,
             SUM(oi.qty)::int                       AS qty,
             SUM(oi.qty * oi.unit_price_cents)::int AS revenue_cents
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.merchant_id = ${merchantId}
        AND o.paid_at IS NOT NULL
        AND o.paid_at >= ${since}
        AND o.paid_at <  ${until}
      GROUP BY oi.menu_item_id
    ) sales ON sales.menu_item_id = mi.id
    WHERE mi.merchant_id = ${merchantId}
    ORDER BY COALESCE(sales.qty, 0) ASC, mi.name ASC
    LIMIT ${limit}
  `;

  const shape = (r: TopItemRow) => ({
    menuItemId: String(r.id),
    name: r.name,
    qty: r.qty,
    revenueCents: r.revenue_cents,
  });

  return c.json({
    best:  best.map(shape),
    worst: worst.map(shape),
  });
});
```

Note on the `worst` query: the window-filtered sales are computed in a derived table (`sales`) and LEFT JOINed onto `menu_items`. This guarantees that menu items with sales **outside** the window correctly show `qty = 0` for the window, instead of leaking outside-window quantities through a chained LEFT JOIN. Items with no sales at all surface naturally as `NULL → COALESCE → 0`.

- [ ] **Step 2: Smoke-test.**

```bash
curl -s -H "X-Merchant-Id: 1" http://localhost:3001/v1/stats/top-items | jq .
```

Expected: `{"best":[...],"worst":[...]}`. `worst` should include menu items with `qty: 0` if any exist with no recent sales.

- [ ] **Step 3: Smoke-test limit clamp.**

```bash
curl -s -H "X-Merchant-Id: 1" "http://localhost:3001/v1/stats/top-items?limit=999" | jq '.best | length'
```

Expected: ≤ 50 (clamp upper bound).

- [ ] **Step 4: Commit.**

```bash
git add api/src/routes/stats.ts
git commit -m "feat(api): add /v1/stats/top-items endpoint"
```

---

## Task 5: Implement `GET /v1/stats/trend`

Time series with auto-resolved bucket (day/week/month) and zero-fill for empty buckets.

**Files:**
- Modify: `api/src/routes/stats.ts`

- [ ] **Step 1: Append the `trend` handler at the end of `stats.ts`.**

```ts
type Bucket = 'day' | 'week' | 'month';

const BUCKET_VALUES: Bucket[] = ['day', 'week', 'month'];

const parseBucket = (raw: string | undefined, periodDays: number): Bucket => {
  if (raw === 'auto' || raw === undefined) {
    if (periodDays <= 14) return 'day';
    if (periodDays <= 90) return 'week';
    return 'month';
  }
  if ((BUCKET_VALUES as string[]).includes(raw)) return raw as Bucket;
  // Unknown value — fall back to auto.
  if (periodDays <= 14) return 'day';
  if (periodDays <= 90) return 'week';
  return 'month';
};

const BUCKET_INTERVAL: Record<Bucket, string> = {
  day:   '1 day',
  week:  '1 week',
  month: '1 month',
};

type TrendRow = { bucket: string; revenue_cents: number; order_count: number };

// GET /v1/stats/trend?since=&until=&bucket=day|week|month|auto
statsRouter.get('/trend', async (c) => {
  const merchantId = c.get('merchantId');

  const parsed = parseWindow(c.req.query('since'), c.req.query('until'));
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);
  const { since, until } = parsed.window;

  const periodDays = Math.ceil((until.getTime() - since.getTime()) / (24 * 60 * 60 * 1000));
  const bucket = parseBucket(c.req.query('bucket'), periodDays);
  const interval = BUCKET_INTERVAL[bucket];

  const rows = await db<TrendRow[]>`
    WITH series AS (
      SELECT to_char(s, 'YYYY-MM-DD') AS bucket
      FROM generate_series(
        date_trunc(${bucket}, ${since}::timestamptz AT TIME ZONE 'Asia/Kuala_Lumpur'),
        date_trunc(${bucket}, ${until}::timestamptz AT TIME ZONE 'Asia/Kuala_Lumpur'),
        ${interval}::interval
      ) AS s
    ),
    agg AS (
      SELECT to_char(
               date_trunc(${bucket}, paid_at AT TIME ZONE 'Asia/Kuala_Lumpur'),
               'YYYY-MM-DD'
             )                              AS bucket,
             SUM(total_cents)::int          AS revenue_cents,
             COUNT(*)::int                  AS order_count
      FROM orders
      WHERE merchant_id = ${merchantId}
        AND paid_at IS NOT NULL
        AND paid_at >= ${since}
        AND paid_at <  ${until}
      GROUP BY 1
    )
    SELECT s.bucket,
           COALESCE(a.revenue_cents, 0) AS revenue_cents,
           COALESCE(a.order_count, 0)   AS order_count
    FROM series s
    LEFT JOIN agg a USING (bucket)
    ORDER BY s.bucket
  `;

  return c.json({
    bucket,
    points: rows.map((r) => ({
      bucket: r.bucket,
      revenueCents: r.revenue_cents,
      orderCount: r.order_count,
    })),
  });
});
```

- [ ] **Step 2: Smoke-test default (auto bucket on 30-day window → `week`).**

```bash
curl -s -H "X-Merchant-Id: 1" http://localhost:3001/v1/stats/trend | jq '{bucket, count: (.points | length)}'
```

Expected: `bucket` is `"week"`; `count` ≥ 4. Even an empty DB returns zero-filled points.

- [ ] **Step 3: Smoke-test forced day bucket on a 7-day window.**

```bash
SINCE=$(date -u -v-7d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)
curl -s -H "X-Merchant-Id: 1" "http://localhost:3001/v1/stats/trend?since=$SINCE&bucket=day" | jq '{bucket, count: (.points | length), first: .points[0]}'
```

Expected: `bucket: "day"`, `count` is ~8 (7-day window inclusive of both endpoints' truncated buckets), each point has `bucket: "YYYY-MM-DD"`.

- [ ] **Step 4: Smoke-test invalid bucket falls back to auto.**

```bash
curl -s -H "X-Merchant-Id: 1" "http://localhost:3001/v1/stats/trend?bucket=lol" | jq .bucket
```

Expected: `"week"` (auto on default 30-day window). No 400.

- [ ] **Step 5: Commit.**

```bash
git add api/src/routes/stats.ts
git commit -m "feat(api): add /v1/stats/trend endpoint"
```

---

## Task 6: Update `CONTRACTS.md`

Sync the API spec with what we built. Drop unimplemented endpoints, add the new ones.

**Files:**
- Modify: `.claude/specs/CONTRACTS.md`

- [ ] **Step 1: Remove the `GET /v1/stats/today` subsection.**

In `.claude/specs/CONTRACTS.md`, locate and delete the entire `#### \`GET /v1/stats/today\`` block, including its JSON example. (Currently around line 244.)

- [ ] **Step 2: Remove the `GET /v1/stats/growth` subsection.**

Delete the entire `#### \`GET /v1/stats/growth\`` block including its JSON example. (Currently around line 274.)

- [ ] **Step 3: Add the three new subsections inside section 3.3 (Stats), keeping `/v1/stats/heatmap` where it is.**

Insert the following blocks in section 3.3, in this order: `summary`, `top-items`, `trend`, then the existing `heatmap` block.

````markdown
#### `GET /v1/stats/summary`

Headline KPIs for the window. Pass `compare=true` for period-over-period change vs. the equally-sized window immediately before `since`.

Response `200`:

```json
{
  "revenueCents": 1850000,
  "orderCount": 412,
  "averageOrderValueCents": 4490,
  "periodDays": 30,
  "comparePrevious": {
    "revenueChangePct": 12.4,
    "orderCountChangePct": 8.1
  }
}
```

- `comparePrevious` is `null` when `compare` is omitted/false, or when the previous window has no orders.
- `averageOrderValueCents` is `0` when `orderCount` is `0`.

#### `GET /v1/stats/top-items`

Best- and worst-selling items in the window. `worst` includes menu items with zero sales (LEFT JOIN), so the merchant can spot dead stock. Optional `?limit=N`, default `10`, clamped to `[1, 50]`.

Response `200`:

```json
{
  "best": [
    { "menuItemId": "1", "name": "Nasi Lemak", "qty": 220, "revenueCents": 110000 }
  ],
  "worst": [
    { "menuItemId": "9", "name": "Roti Bakar", "qty": 0, "revenueCents": 0 }
  ]
}
```

- `name` is the current `menu_items.name` (not the historical snapshot).

#### `GET /v1/stats/trend`

Revenue + order count time series for charts. `?bucket=day|week|month|auto` selects bucket size; `auto` (default) picks `day` for windows ≤14 days, `week` for ≤90 days, `month` otherwise. Empty buckets are zero-filled.

Response `200`:

```json
{
  "bucket": "day",
  "points": [
    { "bucket": "2026-04-01", "revenueCents": 24000, "orderCount": 6 },
    { "bucket": "2026-04-02", "revenueCents": 31000, "orderCount": 8 }
  ]
}
```

- `bucket` field at top level echoes the resolved bucket so the frontend doesn't need to recompute.
- Each point's `bucket` is the first day of that bucket in MYT, formatted `YYYY-MM-DD`.
````

- [ ] **Step 4: Verify the file still parses sensibly.**

```bash
grep -E '^#### ' .claude/specs/CONTRACTS.md | grep stats
```

Expected output (in order):

```
#### `GET /v1/stats/summary`
#### `GET /v1/stats/top-items`
#### `GET /v1/stats/trend`
#### `GET /v1/stats/heatmap`
```

No `today`, no `growth`.

- [ ] **Step 5: Commit.**

```bash
git add .claude/specs/CONTRACTS.md
git commit -m "docs(api): sync CONTRACTS with revenue analytics endpoints"
```

---

## Done

All four endpoints live, spec synced. Final smoke pass:

```bash
for path in summary heatmap top-items trend; do
  echo "== /v1/stats/$path =="
  curl -s -H "X-Merchant-Id: 1" "http://localhost:3001/v1/stats/$path" | jq .
  echo
done
```

Each call should return a 200 with the documented shape. Hand off to the web team to wire dashboards.
