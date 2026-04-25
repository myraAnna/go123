# CONTRACTS

Wire contracts between `web/`, `api/`, and `ai/` for the Warung AI Bookkeeper. Lock these before parallel work starts; anything internal to a service is that service's business.

> See [`MONOREPO_MULTI_APP_GUIDE.md`](./MONOREPO_MULTI_APP_GUIDE.md) §5 for the feature → service map that these contracts implement. This file is the day-to-day reference; the guide is architecture.

---

## Table of Contents

1. [Wire conventions](#1-wire-conventions)
2. [DB field reference](#2-db-field-reference)
3. [`api/` endpoints](#3-api-endpoints) — includes §3.7 Onboarding
4. [`ai/` endpoints](#4-ai-endpoints)
5. [Stub mode (`FAKE_MODE=1`)](#5-stub-mode-fake_mode1)
6. [Shared middleware](#6-shared-middleware)
7. [Time zone & locale rules](#7-time-zone--locale-rules)
8. [Versioning policy](#8-versioning-policy)

---

## 1. Wire conventions

- **JSON only.** Request and response bodies are JSON. No form-encoded, no multipart — file uploads bypass the BFF via S3 presigned URLs.
- **camelCase keys at the wire.** DB stays `snake_case`; `api/` translates at the boundary.
- **Money: integer cents.** `priceCents: 500` = RM 5.00. Never floats.
- **Timestamps: ISO-8601 UTC strings.** Example: `"2026-04-24T03:12:45.000Z"`. `web/` converts to MYT for display.
- **IDs: strings** (`"42"`) even though the DB uses `BIGSERIAL` — avoids JS number precision.
- **Errors: `{ "error": "message", "code"?: "MACHINE_CODE" }`.** HTTP status carries the semantic (400 validation, 404 not found, 500 server). `code` only when `web/` needs to branch on it.
- **No envelopes.** Response body is the data directly — `{ "items": [...] }`, never `{ "data": {...}, "meta": {...} }`.
- **All routes under `/v1/...`** — except public payment callbacks under `/callback/...`, which intentionally bypass auth so QR scans work header-less. See §3.2.

---

## 2. DB field reference

Source of truth is migrations under `api/` once scaffolded — this section is a reference shape, kept brief on purpose so it doesn't drift.

| Table         | Fields                                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `menu_items`  | `id` BIGSERIAL · `merchant_id` FK · `name` TEXT · `price_cents` INT · `category` TEXT · `created_at` TIMESTAMPTZ                                              |
| `orders`      | `id` BIGSERIAL · `merchant_id` FK · `total_cents` INT · `qr_payload` TEXT · `paid_at` TIMESTAMPTZ NULL · `buyer_email` TEXT NULL · `created_at` TIMESTAMPTZ    |
| `order_items` | `id` BIGSERIAL · `merchant_id` FK · `order_id` FK → orders · `menu_item_id` FK → menu_items · `name_snapshot` TEXT · `qty` INT · `unit_price_cents` INT (snapshot of price at order time) |
| `expenses`    | `id` BIGSERIAL · `amount_cents` INT · `description` TEXT · `source` TEXT (`'receipt-scan'` \| `'manual'`) · `s3_key` TEXT NULL · `created_at` |

Conventions: money is always `*_cents` INT; all timestamps are `TIMESTAMPTZ NOT NULL DEFAULT NOW()`; primary keys are `BIGSERIAL`.

---

## 3. `api/` endpoints

### 3.1 Menu

#### `POST /v1/menu/parse`

Parse a natural-language menu description into structured items and persist them.

Request:

```json
{ "transcript": "Saya jual nasi lemak biasa RM5, ayam goreng RM4, telur mata RM1.50" }
```

Response `201`:

```json
{
  "items": [
    { "id": "1", "name": "Nasi Lemak Biasa", "priceCents": 500, "category": "main", "color": "#F59E0B" },
    { "id": "2", "name": "Ayam Goreng",      "priceCents": 400, "category": "main", "color": "#DC2626" },
    { "id": "3", "name": "Telur Mata",       "priceCents": 150, "category": "side", "color": "#FBBF24" }
  ]
}
```

Errors: `400` (empty transcript); `502` (`ai/` unreachable).

#### `GET /v1/menu`

Response `200`:

```json
{
  "items": [
    { "id": "1", "name": "Nasi Lemak Biasa", "priceCents": 500, "category": "main", "color": "#F59E0B" }
  ]
}
```

#### `POST /v1/menu`

Upsert. Items with `id` are updated; items without `id` are created. Omitted fields on an update are left unchanged.

Request:

```json
{
  "items": [
    { "id": "1", "priceCents": 550 },
    { "name": "Kopi O", "priceCents": 180, "category": "drink", "color": "#78350F" }
  ]
}
```

Response `200`: same shape as `GET /v1/menu` (server-assigned ids for new items).

### 3.2 Orders

#### `POST /v1/orders`

Compute total, insert `orders` + `order_items`, return the full breakdown. Menu items must belong to the requesting merchant.

Request:

```json
{ "items": [{ "menuItemId": "1", "qty": 2 }, { "menuItemId": "3", "qty": 1 }] }
```

Response `201`:

```json
{
  "orderId": "42",
  "items": [
    { "menuItemId": "1", "name": "Nasi Lemak Biasa", "qty": 2, "unitPriceCents": 500, "lineTotalCents": 1000 },
    { "menuItemId": "3", "name": "Telur Mata",       "qty": 1, "unitPriceCents": 150, "lineTotalCents": 150 }
  ],
  "totalCents": 1150
}
```

- Duplicate `menuItemId` entries in the request are aggregated (qty summed).
- `unitPriceCents` is the price at order time (snapshotted into `order_items.unit_price_cents`).

Errors: `400` (empty `items`, non-numeric `menuItemId`, `qty < 1`); `404` (any `menuItemId` not found for this merchant — body lists the missing IDs).

#### `GET /v1/orders`

List orders for the current merchant, newest first, each with its line items. Single round-trip — orders + items are fetched in two queries and grouped server-side.

Query params (all optional):

- `from` — ISO 8601 timestamp; only orders with `created_at >= from` are returned.
- `to`   — ISO 8601 timestamp; only orders with `created_at <= to` are returned.

Response `200`:

```json
{
  "orders": [
    {
      "orderId": "42",
      "totalCents": 1150,
      "paidAt": "2026-04-24T03:13:02.000Z",
      "buyerEmail": "buyer@example.com",
      "createdAt": "2026-04-24T03:12:45.000Z",
      "items": [
        { "menuItemId": "1", "name": "Nasi Lemak Biasa", "qty": 2, "unitPriceCents": 500, "lineTotalCents": 1000 },
        { "menuItemId": "3", "name": "Telur Mata",       "qty": 1, "unitPriceCents": 150, "lineTotalCents": 150 }
      ]
    }
  ]
}
```

- `paidAt` and `buyerEmail` are `null` for unpaid orders.
- Returns `{ "orders": [] }` if the merchant has none in range.

Errors: `400` (invalid `from`/`to`).

#### `GET /callback/orders/:id/paid?email=...`

**Public payment callback — exception to the `/v1/*` rule.** Lives under `/callback/`, bypasses the `X-Merchant-Id` auth middleware, and is designed to be encoded directly into the order's QR code so a phone scan triggers it with no headers and no body.

On first scan: marks the order paid (`paid_at = NOW()`, stores `buyer_email`) and emails an e-invoice to `email` via Resend (`src/clients/resend.ts`).

On repeat scans: idempotent — does **not** re-send the invoice or overwrite the original `paid_at` / `buyer_email`.

Query params:

- `email` (required) — buyer's email; receives the e-invoice on first scan.

Response `200` (first scan):

```json
{
  "orderId": "42",
  "paidAt": "2026-04-24T03:13:02.000Z",
  "buyerEmail": "buyer@example.com",
  "invoiceSent": true
}
```

Response `200` (subsequent scan):

```json
{
  "orderId": "42",
  "paidAt": "2026-04-24T03:13:02.000Z",
  "buyerEmail": "buyer@example.com",
  "invoiceSent": false,
  "alreadyPaid": true
}
```

Errors: `400` (invalid `id`, missing/malformed `email`); `404` (order not found); `502` (e-invoice send failed via Resend).

The invoice email includes: invoice number (`INV-` + zero-padded order id), issued/paid timestamps, a "PAID" badge, merchant block (business name, owner, address, phone, TIN, registration, SST), buyer email, line items, subtotal, and total.

### 3.3 Stats

Default window: last 30 days. All endpoints accept optional `?since=ISO&until=ISO` query params. Bucketed fields (`dayOfWeek`, `hour`, `month`) are **MYT (UTC+8)**; raw timestamps stay UTC.

#### `GET /v1/stats/today`

Response `200`:

```json
{
  "totalCents": 12350,
  "orderCount": 28,
  "topItems": [
    { "menuItemId": "1", "name": "Nasi Lemak Biasa", "qty": 22, "revenueCents": 11000 },
    { "menuItemId": "2", "name": "Ayam Goreng",      "qty": 14, "revenueCents": 5600 }
  ]
}
```

#### `GET /v1/stats/heatmap`

`dayOfWeek`: 0=Sunday … 6=Saturday (MYT). `hour`: 0–23 (MYT).

Response `200`:

```json
{
  "cells": [
    { "dayOfWeek": 1, "hour": 7, "orderCount": 12, "revenueCents": 6000 },
    { "dayOfWeek": 1, "hour": 8, "orderCount": 18, "revenueCents": 9000 }
  ]
}
```

#### `GET /v1/stats/growth`

Response `200`:

```json
{
  "monthOverMonthPct": 15.2,
  "sparkline": [
    { "month": "2026-02", "revenueCents": 450000 },
    { "month": "2026-03", "revenueCents": 520000 },
    { "month": "2026-04", "revenueCents": 610000 }
  ]
}
```

### 3.4 Conversational query

#### `POST /v1/ask`

BM-or-English natural-language question. `api/` calls `ai/` for SQL, validates SELECT-only, runs it.

Request:

```json
{ "question": "Bulan ni hari apa paling slow?" }
```

Response `200`:

```json
{
  "sql": "SELECT to_char(created_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'Day') AS day_name, SUM(total_cents) AS revenue_cents FROM orders WHERE created_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Kuala_Lumpur') GROUP BY 1 ORDER BY 2 ASC LIMIT 1",
  "rows": [{ "day_name": "Selasa", "revenue_cents": 12000 }],
  "answer": "Hari Selasa paling slow, bos. Revenue Selasa RM120, purata hari lain RM250."
}
```

Errors: `400` (empty question, or `ai/` returned non-SELECT SQL — guardrail); `502` (`ai/` unreachable).

### 3.5 Scorecard & credit

#### `GET /v1/scorecard`

Computes all 4 components from the DB. Pure SQL/math, no `ai/` call. All component scores are 0–1. `overall` is a weighted average (stability 0.25, margin 0.35, growth 0.25, diligence 0.15).

Response `200`:

```json
{
  "stability": { "activeDays": 28, "totalDays": 30, "stdDevCents": 4250, "score": 0.87 },
  "margin":    { "revenueCents": 1850000, "expensesCents": 1200000, "grossMarginPct": 35.1, "score": 0.75 },
  "growth":    { "monthOverMonthPct": 15.2, "score": 0.82 },
  "diligence": { "receiptsScanned": 24, "activeDays": 28, "ratio": 0.86, "scoreStars": 4 },
  "overall":   0.80
}
```

#### `POST /v1/einvoice/generate`

Generate consolidated LHDN e-Invoice PDF for a date range. Uploads to S3, returns a presigned URL.

Request:

```json
{ "from": "2026-04-01", "to": "2026-04-30" }
```

Response `201`:

```json
{
  "pdfUrl": "https://go123-warung-files.s3.ap-southeast-1.amazonaws.com/einvoice-2026-04.pdf?X-Amz-...",
  "invoiceNumber": "INV-2026-04-001",
  "lineCount": 428,
  "totalCents": 1850000
}
```

#### `POST /v1/credit/apply`

Bundle scorecard + 3-month P&L, return a simulated approval. No real bank call.

Request: `{}`

Response `200`:

```json
{
  "approved": true,
  "amountRm": 5000,
  "interestRatePct": 8.5,
  "tenorMonths": 12,
  "reason": "Stable 90-day revenue and strong bookkeeping diligence.",
  "scorecard": { "stability": {}, "margin": {}, "growth": {}, "diligence": {}, "overall": 0.80 }
}
```

### 3.7 Onboarding

Merchant setup flow:

1. **Image path**: upload menu image → AI extracts a draft list (not persisted) → merchant reviews, edits, adds, removes in `web/` → submit via `POST /v1/onboarding/menu/verify` to commit.
2. **Manual path**: submit items directly via `POST /v1/onboarding/form` (persists immediately with `category = "other"`).

Subsequent edits use `PATCH /v1/onboarding/menu/:id` (single) or `PATCH /v1/onboarding/menu` (batch).

#### `POST /v1/onboarding/image`

Upload a menu image (multipart/form-data). API uploads it to S3, records the upload in `merchant_menu_uploads` for audit, then calls `ai/` to parse items and **returns the draft list to `web/` without persisting any menu rows**. The merchant verifies the list client-side and commits it via `POST /v1/onboarding/menu/verify`.

Request: `multipart/form-data` with field `image` (jpeg, png, webp, or gif).

Response `200`:

```json
{
  "items": [
    { "name": "Nasi Lemak Biasa", "priceCents": 500, "category": "main" },
    { "name": "Teh Tarik",        "priceCents": 200, "category": "drink" }
  ]
}
```

- No `id` field — these aren't persisted yet.
- `category` is whatever the AI returned, falling back to `"other"` if it isn't one of the allowed values.
- Returns `{ "items": [] }` if the AI finds no items.

Errors: `400` (missing `image` field); `415` (unsupported MIME type); `500` (DB error recording the upload); `502` (S3 upload failed or `ai/` unreachable).

#### `POST /v1/onboarding/form`

Manually submit an initial menu. All items are inserted with `category = "other"`.

Request:

```json
{
  "items": [
    { "name": "Nasi Lemak", "priceCents": 500 },
    { "name": "Teh Tarik",  "priceCents": 200 }
  ]
}
```

Response `201`:

```json
{
  "items": [
    { "id": "1", "name": "Nasi Lemak", "priceCents": 500, "category": "other" },
    { "id": "2", "name": "Teh Tarik",  "priceCents": 200, "category": "other" }
  ]
}
```

Errors: `400` (empty `items`, non-string/empty `name`, `priceCents` not a positive integer).

#### `GET /v1/onboarding/menu`

List all menu items for the merchant (used to review after initial upload).

Response `200`:

```json
{
  "items": [
    { "id": "1", "name": "Nasi Lemak", "priceCents": 500, "category": "other" }
  ]
}
```

#### `PATCH /v1/onboarding/menu/:id`

Update a single menu item. Send only the fields to change; omitted fields are left unchanged.

Request:

```json
{ "name": "Nasi Lemak Biasa", "priceCents": 550, "category": "main" }
```

Response `200`:

```json
{ "item": { "id": "1", "name": "Nasi Lemak Biasa", "priceCents": 550, "category": "main" } }
```

Errors: `400` (invalid `id`, empty body, invalid field values, invalid `category`); `404` (item not found for this merchant).

`category` must be one of `"main" | "side" | "drink" | "dessert" | "other"`.

#### `PATCH /v1/onboarding/menu`

Bulk-update multiple menu items in a single transaction. All items must exist; any missing `id` rolls back the whole batch.

Request:

```json
{
  "items": [
    { "id": "1", "category": "main" },
    { "id": "2", "priceCents": 220, "category": "drink" }
  ]
}
```

Response `200`:

```json
{
  "items": [
    { "id": "1", "name": "Nasi Lemak Biasa", "priceCents": 550, "category": "main" },
    { "id": "2", "name": "Teh Tarik",        "priceCents": 220, "category": "drink" }
  ]
}
```

Errors: `400` (non-numeric `id`, no fields to update, invalid field values); `404` (any `id` not found — entire batch rolled back).

#### `POST /v1/onboarding/menu/verify`

Commit a merchant-verified list of items (e.g. after editing the AI draft from `POST /v1/onboarding/image`). Inserts new items; **skips any whose `name` already exists for this merchant (case-insensitive)**. Also de-duplicates within the request itself, keeping the first occurrence of each name.

Request:

```json
{
  "items": [
    { "name": "Nasi Lemak Biasa", "priceCents": 500, "category": "main" },
    { "name": "Teh Tarik",        "priceCents": 200, "category": "drink" },
    { "name": "Ayam Goreng",      "priceCents": 400, "category": "main" }
  ]
}
```

- Every item must include `name`, `priceCents` (positive integer), and `category` (one of `"main" | "side" | "drink" | "dessert" | "other"`).
- No `id` field — this endpoint is insert-only. Use `PATCH /v1/onboarding/menu/:id` to edit existing rows.

Response `200`:

```json
{
  "items": [
    { "id": "3", "name": "Ayam Goreng", "priceCents": 400, "category": "main" }
  ],
  "skippedCount": 2
}
```

- `items` are the rows actually inserted.
- `skippedCount` covers both intra-request duplicates and existing-DB matches.
- If everything was a duplicate, returns `{ "items": [], "skippedCount": N }` with `200`.

Errors: `400` (empty `items`, missing/empty `name`, `priceCents` not a positive integer, invalid `category`).

---

### 3.6 Health

#### `GET /health`

Response `200`:

```json
{ "ok": true, "service": "api", "version": "0.1.0", "mode": "real" }
```

`mode` is `"fake"` when `FAKE_MODE=1`. See §5.

---

## 4. `ai/` endpoints

No auth, callable only from `api/` (enforced at the network layer via `docker-compose` expose). No DB access — `api/` sends schema in requests.

#### `POST /v1/parse-menu`

Request:

```json
{ "transcript": "Saya jual nasi lemak biasa RM5, ayam goreng RM4, telur mata RM1.50" }
```

Response `200`:

```json
{
  "items": [
    { "name": "Nasi Lemak Biasa", "priceCents": 500, "category": "main", "color": "#F59E0B" },
    { "name": "Ayam Goreng",      "priceCents": 400, "category": "main", "color": "#DC2626" },
    { "name": "Telur Mata",       "priceCents": 150, "category": "side", "color": "#FBBF24" }
  ]
}
```

- No `id` field — `api/` assigns after insert.
- `category` is one of `"main" | "side" | "drink" | "dessert" | "other"`.
- `color` is a hex string chosen from a fixed palette (keep palette in `ai/` prompt).

#### `POST /v1/text-to-sql`

Request:

```json
{
  "question": "Bulan ni hari apa paling slow?",
  "schema": "CREATE TABLE orders (id BIGSERIAL, total_cents INT, paid_at TIMESTAMPTZ, created_at TIMESTAMPTZ); CREATE TABLE order_items (...); CREATE TABLE menu_items (...);"
}
```

Response `200`:

```json
{
  "sql": "SELECT to_char(created_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'Day') AS day_name, SUM(total_cents) AS revenue_cents FROM orders WHERE created_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Kuala_Lumpur') GROUP BY 1 ORDER BY 2 ASC LIMIT 1",
  "explanation": "Groups orders by MYT day-of-week for the current month and picks the lowest-revenue day."
}
```

Must return **SELECT-only** SQL — `api/` enforces this guardrail before executing. If the LLM tries to produce DDL/DML, `api/` rejects with 400.

#### `POST /v1/anomaly` (optional)

Request:

```json
{
  "series": [
    { "date": "2026-04-20", "revenueCents": 25000 },
    { "date": "2026-04-21", "revenueCents": 28000 },
    { "date": "2026-04-22", "revenueCents": 18000 }
  ]
}
```

Response `200`:

```json
{ "isAnomaly": true, "expectedCents": 27000, "actualCents": 18000, "zScore": -2.1 }
```

Can be a plain z-score calculation — doesn't require an LLM.

#### `GET /health`

Response `200`: `{ "ok": true, "service": "ai", "version": "0.1.0", "mode": "real" }`

---

## 5. Stub mode (`FAKE_MODE=1`)

Each service reads `FAKE_MODE` from env. When `FAKE_MODE=1`, external dependencies are bypassed and every endpoint returns a deterministic canned response.

| Service | External calls when real          | Replaced by (`FAKE_MODE=1`)                  |
| ------- | --------------------------------- | -------------------------------------------- |
| `api/`  | Postgres, S3, Bedrock-via-`ai/`   | Fixtures under `api/src/fixtures/*.json`     |
| `ai/`   | Bedrock                           | Fixtures under `ai/src/fixtures/*.json`      |
| `web/`  | (none — only calls `api/`)        | Point `NEXT_PUBLIC_API_URL` at fake `api/`   |

- Fixtures are deterministic — same request, same response. Predictable demos and no AWS keys required to run end-to-end.
- `GET /health` returns `"mode": "fake"` so the state is visible.
- Each endpoint has exactly one fixture file (e.g. `api/src/fixtures/orders-create.json`).

Example fixture — `api/src/fixtures/orders-create.json`:

```json
{
  "orderId": "42",
  "totalCents": 1150,
  "qrPayload": "duitnow://pay?ref=ORDER-42&amount=11.50",
  "createdAt": "2026-04-24T03:12:45.000Z"
}
```

Example fixture — `ai/src/fixtures/parse-menu.json`:

```json
{
  "items": [
    { "name": "Nasi Lemak", "priceCents": 500, "category": "main",  "color": "#F59E0B" },
    { "name": "Teh Tarik",  "priceCents": 200, "category": "drink", "color": "#78350F" }
  ]
}
```

---

## 6. Shared middleware

Applies to `api/`. `ai/` does not have auth — it's protected by network-layer isolation.

**Merchant identity.** Every request to `api/` carries `X-Merchant-Id`. Hardcoded `1` for the hackathon. Middleware reads it and injects into handler context. Swap header for JWT + Cognito later — route code doesn't change.

```ts
// api/src/middleware/auth.ts (shape, not final code)
app.use('*', async (c, next) => {
  const merchantId = c.req.header('X-Merchant-Id') ?? '1';
  c.set('merchantId', merchantId);
  await next();
});
```

**CORS.** `api/` allows only `process.env.WEB_ORIGIN`.

**Request logs.** One line per request: `{ method, path, status, durationMs, merchantId }`.

**Health check.** `GET /health` on both `api/` and `ai/` — shape in §3.6 / §4.

---

## 7. Time zone & locale rules

- **Raw timestamps on the wire**: UTC ISO-8601 strings (`"2026-04-24T03:12:45.000Z"`).
- **Bucketed aggregations** (heatmap day/hour, "today", monthly sparkline): computed in **MYT (UTC+8)** inside `api/` SQL. Use `AT TIME ZONE 'Asia/Kuala_Lumpur'` in Postgres.
- **Display formatting** (`RM 12.50`, `24 Apr 2026`): only in `web/`. Never mixed into wire fields.
- **BM language.** The `answer` field of `POST /v1/ask` is free-form Malay / English mix — it's natural language from the LLM, not structured data. Menu parser preserves names verbatim (`"Nasi Lemak Biasa"`, not lowercased).

---

## 8. Versioning policy

All routes under `/v1/...`. Breaking changes go to `/v2/`. Not expected during the hackathon — reserved for future.
