# Revenue Analytics — Design

**Status:** approved
**Scope:** `api/` only. No `ai/` calls. No `web/` work in this spec.
**Mode:** Hackathon — speed > polish, no tests, no production hardening.

## Goal

Give the merchant dashboard four high-signal revenue endpoints, derived purely from existing tables (`orders`, `order_items`, `menu_items`). No new tables, no schema changes, no cost/profit modelling — that's deferred.

## Non-goals (explicitly deferred)

- Cost-of-goods, gross margin, profit per item — out of scope.
- Operating expense breakdown (the `expenses` table stays untouched).
- Category split (`/v1/stats/by-category`) — pie chart deemed low signal vs. top-items.
- Forecasting, anomaly detection, AI-generated insights.

## Definitions

- **Revenue:** `SUM(orders.total_cents)` filtered to `paid_at IS NOT NULL`. Unpaid drafts are excluded from every analytic.
- **MYT bucketing:** all day-of-week / hour / day / week / month buckets are computed in `Asia/Kuala_Lumpur`. Raw timestamps stay UTC on the wire.
- **Default window:** last 30 days (`since = NOW() - INTERVAL '30 days'`, `until = NOW()`) when query params are omitted.
- **Window semantics:** half-open `[since, until)` — orders with `paid_at == until` are excluded so adjacent periods don't double-count.
- **Order timestamp:** `paid_at` (not `created_at`) for all revenue/time bucketing. An order without `paid_at` is invisible to analytics.

## Architecture

New router `api/src/routes/stats.ts`, mounted at `/v1/stats` in `api/src/index.ts`. Three files of work, plus one optional:

1. `api/src/routes/stats.ts` — route handlers, four endpoints.
2. `api/src/index.ts` — mount the router.
3. `.claude/specs/CONTRACTS.md` — replace `/v1/stats/today` and `/v1/stats/growth` sections with `summary`, `trend`, `top-items`. Keep `/v1/stats/heatmap` as-is.
4. *(optional)* `api/src/db/queries/stats.ts` — extracted SQL helpers if `stats.ts` grows past ~250 lines. Skip until needed.

All four handlers are pure SQL → JSON. No external services.

## Endpoints

All endpoints share:

- Auth: `authMiddleware` already runs on `/v1/*`, exposing `c.get('merchantId')`.
- Filter: `WHERE merchant_id = $1 AND paid_at IS NOT NULL AND paid_at BETWEEN $2 AND $3`.
- Query params: `since` (ISO datetime, optional), `until` (ISO datetime, optional). Validate with the existing `isIsoDate` pattern from `routes/orders.ts`. On invalid → `400 { "error": "..." }`.
- Defaults: `since = now - 30d`, `until = now`.
- All money is `*Cents` (INT) on the wire.

### 1. `GET /v1/stats/summary`

Headline KPIs. Optional period-over-period comparison.

**Query:** `?since=&until=&compare=true`

**Response 200:**

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

- `comparePrevious` is `null` when `compare` is omitted/false, or when the previous window has zero orders (no division by zero, no nonsense percentages).
- The previous window is the same length immediately before `since`: `[since - (until - since), since]`.
- `averageOrderValueCents = round(revenueCents / orderCount)`; when `orderCount = 0`, return `0`.
- `periodDays = ceil((until - since) / 1 day)`.

### 2. `GET /v1/stats/top-items`

Best and worst sellers in the window.

**Query:** `?since=&until=&limit=10`

**Response 200:**

```json
{
  "best":  [{ "menuItemId": "1", "name": "Nasi Lemak", "qty": 220, "revenueCents": 110000 }],
  "worst": [{ "menuItemId": "9", "name": "Roti Bakar", "qty": 0,   "revenueCents": 0 }]
}
```

- `limit` defaults to 10, clamped to `[1, 50]`.
- `best`: ranked by `SUM(qty) DESC`, ties broken by `SUM(qty * unit_price_cents) DESC`.
- `worst`: LEFT JOIN `menu_items` → `order_items` (paid orders, in window) so menu items with **zero sales** are included with `qty = 0`. Ranked by `SUM(qty) ASC`, ties by name.
- `name` comes from `menu_items.name` (current name), not the snapshot — the merchant cares about today's menu, not historical naming.
- Only menu items belonging to the calling merchant.

### 3. `GET /v1/stats/trend`

Time series for charts.

**Query:** `?since=&until=&bucket=day|week|month|auto`

**Response 200:**

```json
{
  "bucket": "day",
  "points": [
    { "bucket": "2026-04-01", "revenueCents": 24000, "orderCount": 6 },
    { "bucket": "2026-04-02", "revenueCents": 31000, "orderCount": 8 }
  ]
}
```

- `bucket` defaults to `auto`. Resolution rule:
  - window ≤ 14 days → `day`
  - window ≤ 90 days → `week`
  - otherwise → `month`
- The resolved bucket is echoed back in the response so the frontend doesn't need to recompute.
- `bucket` field in each point is an ISO date (`YYYY-MM-DD` for day; week/month use the first day of the bucket in MYT).
- **Empty buckets are filled with zeros** so the chart line stays continuous. Generated via `generate_series` in SQL.
- Bucketing uses `date_trunc('<unit>', paid_at AT TIME ZONE 'Asia/Kuala_Lumpur')`.

### 4. `GET /v1/stats/heatmap`

Day-of-week × hour grid. Already specced in CONTRACTS — kept as-is.

**Query:** `?since=&until=`

**Response 200:**

```json
{
  "cells": [
    { "dayOfWeek": 1, "hour": 7, "orderCount": 12, "revenueCents": 6000 }
  ]
}
```

- `dayOfWeek`: 0=Sunday … 6=Saturday (MYT).
- `hour`: 0–23 (MYT).
- Only cells with at least one order are returned (sparse). Frontend fills empty cells with zero.
- SQL: `EXTRACT(DOW FROM paid_at AT TIME ZONE 'Asia/Kuala_Lumpur')` and `EXTRACT(HOUR FROM ...)`.

## SQL sketches

Per-handler SQL is small enough to inline in the route file. Examples:

**summary (current window):**

```sql
SELECT COALESCE(SUM(total_cents), 0) AS revenue_cents,
       COUNT(*)                       AS order_count
FROM orders
WHERE merchant_id = $1
  AND paid_at IS NOT NULL
  AND paid_at >= $2 AND paid_at < $3
```

Run twice (once for current window, once for previous) when `compare=true`.

**top-items best:**

```sql
SELECT mi.id, mi.name,
       SUM(oi.qty)                          AS qty,
       SUM(oi.qty * oi.unit_price_cents)    AS revenue_cents
FROM order_items oi
JOIN orders     o  ON o.id = oi.order_id
JOIN menu_items mi ON mi.id = oi.menu_item_id
WHERE oi.merchant_id = $1
  AND o.paid_at IS NOT NULL
  AND o.paid_at >= $2 AND o.paid_at < $3
GROUP BY mi.id, mi.name
ORDER BY qty DESC, revenue_cents DESC
LIMIT $4
```

**top-items worst (LEFT JOIN to include zero-sale items):**

```sql
SELECT mi.id, mi.name,
       COALESCE(SUM(oi.qty), 0)                       AS qty,
       COALESCE(SUM(oi.qty * oi.unit_price_cents), 0) AS revenue_cents
FROM menu_items mi
LEFT JOIN order_items oi
       ON oi.menu_item_id = mi.id
LEFT JOIN orders o
       ON o.id = oi.order_id
      AND o.paid_at IS NOT NULL
      AND o.paid_at >= $2 AND o.paid_at < $3
WHERE mi.merchant_id = $1
GROUP BY mi.id, mi.name
ORDER BY qty ASC, mi.name ASC
LIMIT $4
```

**trend (day bucket, zero-filled):**

```sql
WITH series AS (
  SELECT generate_series($2::date, $3::date, INTERVAL '1 day') AS bucket
),
agg AS (
  SELECT date_trunc('day', paid_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS bucket,
         SUM(total_cents) AS revenue_cents,
         COUNT(*)         AS order_count
  FROM orders
  WHERE merchant_id = $1
    AND paid_at IS NOT NULL
    AND paid_at >= $2 AND paid_at < $3
  GROUP BY 1
)
SELECT s.bucket,
       COALESCE(a.revenue_cents, 0) AS revenue_cents,
       COALESCE(a.order_count, 0)   AS order_count
FROM series s
LEFT JOIN agg a USING (bucket)
ORDER BY s.bucket
```

Week/month buckets swap `'day'` → `'week'` / `'month'` and adjust the `generate_series` step.

**heatmap:**

```sql
SELECT EXTRACT(DOW  FROM paid_at AT TIME ZONE 'Asia/Kuala_Lumpur')::int AS day_of_week,
       EXTRACT(HOUR FROM paid_at AT TIME ZONE 'Asia/Kuala_Lumpur')::int AS hour,
       COUNT(*)         AS order_count,
       SUM(total_cents) AS revenue_cents
FROM orders
WHERE merchant_id = $1
  AND paid_at IS NOT NULL
  AND paid_at >= $2 AND paid_at < $3
GROUP BY 1, 2
ORDER BY 1, 2
```

## Validation rules

Reused across all four endpoints (extract into a small helper in `routes/stats.ts`):

- `since` and `until` must each parse via `Date.parse` if provided.
- If both provided, `since < until` else `400`.
- `until` defaults to `new Date()`.
- `since` defaults to `until - 30 days`.
- `limit` (top-items only): integer, clamped to `[1, 50]`.
- `bucket` (trend only): one of `day | week | month | auto`. Default `auto`.
- `compare` (summary only): `'true'` enables; anything else (including absent) → false.

## Errors

- `400 { "error": "<reason>" }` — invalid query params.
- `500 { "error": "Internal server error" }` — DB failure. Don't leak SQL.

No `404` — empty windows return zero-valued payloads, not errors.

## CONTRACTS.md changes

In `.claude/specs/CONTRACTS.md`, section 3.3 ("Stats"):

1. **Remove** the `/v1/stats/today` and `/v1/stats/growth` subsections.
2. **Keep** the `/v1/stats/heatmap` subsection unchanged.
3. **Add** subsections for `/v1/stats/summary`, `/v1/stats/top-items`, `/v1/stats/trend` matching the response shapes above.

## Out of scope (future passes)

- Cost / margin / profit (will need `cost_cents` on `menu_items` + `unit_cost_cents` snapshot on `order_items` + categorised `expenses`).
- Per-customer analytics (`buyer_email` is sparse — most QR orders won't have it).
- Forecast / "next week likely revenue."
- AI-generated narrative summaries (handled separately by `/v1/chat`).
