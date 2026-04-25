# Onboarding APIs Design

**Date:** 2026-04-25  
**Scope:** `api/` service — merchant product onboarding via image upload and manual form

---

## Overview

Two endpoints let merchants seed their menu before the POS is live:

1. `POST /v1/onboarding/image` — merchant uploads a photo of their handwritten/printed menu; the API stores it on S3, calls the `ai/` service (mocked locally) to extract products, and persists them as `menu_items`.
2. `POST /v1/onboarding/form` — merchant submits a structured list of products directly; the API validates and persists them.

Both endpoints return the same response shape: the created `menu_items`.

---

## Endpoint Contracts

### `POST /v1/onboarding/image`

**Request:** `multipart/form-data`, field name `image` (any common image MIME type).

**Response `201`:**
```json
{
  "items": [
    { "id": "1", "name": "Nasi Lemak", "priceCents": 500, "category": "other" }
  ]
}
```

**Errors:**
- `400` — missing `image` field
- `502` — AI service unreachable or returned an error

### `POST /v1/onboarding/form`

**Request:**
```json
{
  "items": [
    { "name": "Nasi Lemak", "priceCents": 500 },
    { "name": "Teh Tarik",  "priceCents": 200 }
  ]
}
```

**Response `201`:** same shape as image endpoint.

**Errors:**
- `400` — empty `items` array, missing `name`, or `priceCents < 1`

---

## New Migration: `008_merchant_menu_uploads.sql`

Stores the S3 key for each menu image a merchant uploads.

```sql
CREATE TABLE merchant_menu_uploads (
  id          BIGSERIAL PRIMARY KEY,
  merchant_id BIGINT NOT NULL REFERENCES merchants(id),
  s3_key      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Image Flow

Sequential steps within a single request handler:

1. Parse multipart body; read `image` field as `ArrayBuffer`.
2. Generate S3 key: `merchants/{merchantId}/menus/{uuid}.{ext}` (ext from MIME type).
3. Upload buffer to S3 via `src/clients/s3.ts`.
4. Insert a row into `merchant_menu_uploads` with the S3 key.
5. Call `parseMenuImage(s3Key)` in `src/clients/ai.ts`.
6. Bulk-insert returned items into `menu_items` with `category = "other"`.
7. Return created items.

---

## Form Flow

1. Parse JSON body; validate each item has a non-empty `name` and `priceCents >= 1`.
2. Bulk-insert into `menu_items` with `category = "other"`.
3. Return created items.

---

## AI Client + Mock

**`src/clients/ai.ts`** — the single place all `ai/` service calls live.

```ts
// AI_URL defaults to the local mock base; swap to real ai/ service when ready
const AI_URL = process.env.AI_URL ?? 'http://localhost:3001/_ai';
// parseMenuImage always calls: AI_URL + '/v1/parse-menu'
// Dev (AI_URL unset):  → http://localhost:3001/_ai/v1/parse-menu  (local mock)
// Prod (AI_URL set):   → http://ai:3002/v1/parse-menu             (real service)
```

**Mock route** at `POST /_ai/v1/parse-menu` registered inside the `api/` Hono app. Returns a hardcoded fixture of a few products. When the real `ai/` is implemented, set `AI_URL=http://ai:3002` — no code changes required.

Mock fixture response:
```json
{
  "items": [
    { "name": "Nasi Lemak", "priceCents": 500 },
    { "name": "Ayam Goreng", "priceCents": 400 },
    { "name": "Teh Tarik",   "priceCents": 200 }
  ]
}
```

---

## S3 Client

**`src/clients/s3.ts`** — thin wrapper around Bun's `fetch` or AWS SDK v3.

```ts
uploadBuffer(key: string, buffer: ArrayBuffer, contentType: string): Promise<void>
```

Reads `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` from env.

---

## File Structure

```
api/
  migrations/
    008_merchant_menu_uploads.sql
  src/
    routes/
      onboarding.ts        — registers both endpoints + mock AI route
    clients/
      ai.ts                — parseMenuImage(s3Key)
      s3.ts                — uploadBuffer(key, buffer, contentType)
    middleware/
      auth.ts              — injects merchantId from X-Merchant-Id header
    index.ts               — mounts middleware + onboarding router
```

---

## Assumptions & Constraints

- `category` always defaults to `"other"` for both flows (not in onboarding inputs).
- `merchant_id` comes from the `X-Merchant-Id` header (hardcoded `"1"` for hackathon).
- S3 bucket name and AWS creds are env vars; no credential logic in route code.
- AI mock route is always registered regardless of `FAKE_MODE` — it's just a fallback, not a test fixture.
- No file size validation for the hackathon (deferred).
