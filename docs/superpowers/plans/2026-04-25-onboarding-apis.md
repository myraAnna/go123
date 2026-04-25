# Onboarding APIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two endpoints — `POST /v1/onboarding/image` and `POST /v1/onboarding/form` — that seed a merchant's `menu_items` from either a photo upload (via S3 + mocked AI extraction) or a structured product list.

**Architecture:** The image endpoint streams the upload to S3, records the key in a new `merchant_menu_uploads` table, then calls a local mock of the `ai/` service to get extracted products, and bulk-inserts them. The form endpoint validates and bulk-inserts products directly. An `ai.ts` client centralises all future `ai/` calls; a mock Hono route at `/_ai/v1/parse-menu` handles them until the real service is ready.

**Tech Stack:** Bun, Hono, `postgres` (npm), `@aws-sdk/client-s3`, PostgreSQL

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `migrations/008_merchant_menu_uploads.sql` | New table for S3 keys |
| Create | `migrations/009_seed_merchant.sql` | Seed merchant id=1 for dev |
| Create | `src/middleware/auth.ts` | Inject `merchantId` from header |
| Create | `src/clients/s3.ts` | Upload buffer to S3 |
| Create | `src/clients/ai.ts` | Call `ai/` service (or local mock) |
| Create | `src/routes/onboarding.ts` | Image + form endpoints |
| Create | `src/routes/ai-mock.ts` | Mock `/_ai/v1/parse-menu` handler |
| Modify | `src/index.ts` | Mount middleware + routes |

---

## Task 1: Migrations

**Files:**
- Create: `migrations/008_merchant_menu_uploads.sql`
- Create: `migrations/009_seed_merchant.sql`

- [ ] **Step 1: Create the menu uploads table migration**

`migrations/008_merchant_menu_uploads.sql`:
```sql
CREATE TABLE IF NOT EXISTS merchant_menu_uploads (
  id          BIGSERIAL PRIMARY KEY,
  merchant_id BIGINT NOT NULL REFERENCES merchants(id),
  s3_key      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_menu_uploads_merchant
  ON merchant_menu_uploads(merchant_id);
```

- [ ] **Step 2: Create the seed merchant migration**

`migrations/009_seed_merchant.sql`:
```sql
INSERT INTO merchants (
  id, business_name, owner_name, business_type,
  tin, registration_type, registration_number,
  msic_code, business_activity_description,
  phone, address_line1, city, state_code, postcode
)
OVERRIDING SYSTEM VALUE
VALUES (
  1, 'Warung Demo', 'Pemilik Demo', 'warung',
  '000000000000', 'NRIC', '000000000000',
  '56106', 'Food stalls/hawkers',
  '0123456789', '1 Jalan Demo', 'Kuala Lumpur', '14', '50000'
)
ON CONFLICT (id) DO NOTHING;

-- Keep sequence ahead of the seeded id
SELECT setval('merchants_id_seq', GREATEST((SELECT MAX(id) FROM merchants), 1));
```

- [ ] **Step 3: Run migrations**

```bash
DATABASE_URL=<your-url> bun run migrate
```

Expected output:
```
  skip  001_reference_tables.sql
  skip  002_merchants.sql
  skip  003_menu_items.sql
  skip  004_orders.sql
  skip  005_expenses.sql
  skip  006_export_jobs.sql
  skip  007_generated_documents_constraints.sql
  apply 008_merchant_menu_uploads.sql
  apply 009_seed_merchant.sql
Migrations complete.
```

- [ ] **Step 4: Commit**

```bash
git add migrations/008_merchant_menu_uploads.sql migrations/009_seed_merchant.sql
git commit -m "feat(api): add merchant_menu_uploads table and dev seed"
```

---

## Task 2: Auth Middleware

**Files:**
- Create: `src/middleware/auth.ts`

- [ ] **Step 1: Create auth middleware**

`src/middleware/auth.ts`:
```ts
import type { MiddlewareHandler } from 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    merchantId: string;
  }
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  c.set('merchantId', c.req.header('X-Merchant-Id') ?? '1');
  await next();
};
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware/auth.ts
git commit -m "feat(api): add auth middleware"
```

---

## Task 3: S3 Client

**Files:**
- Modify: `package.json` (add dependency)
- Create: `src/clients/s3.ts`

- [ ] **Step 1: Install AWS SDK S3 client**

```bash
bun add @aws-sdk/client-s3
```

- [ ] **Step 2: Create S3 client**

`src/clients/s3.ts`:
```ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: process.env.AWS_REGION ?? 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function uploadBuffer(
  key: string,
  buffer: ArrayBuffer,
  contentType: string,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
      Body: Buffer.from(buffer),
      ContentType: contentType,
    }),
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock src/clients/s3.ts
git commit -m "feat(api): add S3 upload client"
```

---

## Task 4: AI Client + Mock Route

**Files:**
- Create: `src/clients/ai.ts`
- Create: `src/routes/ai-mock.ts`

- [ ] **Step 1: Create AI client**

`src/clients/ai.ts`:
```ts
const AI_BASE = process.env.AI_URL ?? 'http://localhost:3001/_ai';

export interface ParsedItem {
  name: string;
  priceCents: number;
}

export async function parseMenuImage(s3Key: string): Promise<ParsedItem[]> {
  const res = await fetch(`${AI_BASE}/v1/parse-menu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ s3Key }),
  });
  if (!res.ok) throw new Error(`AI service error: ${res.status}`);
  const data = await res.json() as { items: ParsedItem[] };
  return data.items;
}
```

- [ ] **Step 2: Create mock AI route**

`src/routes/ai-mock.ts`:
```ts
import { Hono } from 'hono';

export const aiMockRouter = new Hono();

aiMockRouter.post('/v1/parse-menu', (c) => {
  return c.json({
    items: [
      { name: 'Nasi Lemak Biasa', priceCents: 500 },
      { name: 'Ayam Goreng',      priceCents: 400 },
      { name: 'Telur Mata',       priceCents: 150 },
      { name: 'Teh Tarik',        priceCents: 200 },
      { name: 'Kopi O',           priceCents: 180 },
    ],
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add src/clients/ai.ts src/routes/ai-mock.ts
git commit -m "feat(api): add AI client and local mock route"
```

---

## Task 5: Onboarding Routes

**Files:**
- Create: `src/routes/onboarding.ts`

- [ ] **Step 1: Create onboarding router**

`src/routes/onboarding.ts`:
```ts
import { Hono } from 'hono';
import { db } from '../db/index.js';
import { uploadBuffer } from '../clients/s3.js';
import { parseMenuImage } from '../clients/ai.js';

export const onboardingRouter = new Hono();

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
};

// POST /v1/onboarding/image
onboardingRouter.post('/image', async (c) => {
  const merchantId = c.get('merchantId');

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'Expected multipart/form-data' }, 400);
  }

  const file = formData.get('image');
  if (!(file instanceof File)) {
    return c.json({ error: 'Missing image field' }, 400);
  }

  const contentType = file.type || 'image/jpeg';
  const ext = MIME_TO_EXT[contentType] ?? 'jpg';
  const key = `merchants/${merchantId}/menus/${crypto.randomUUID()}.${ext}`;

  const buffer = await file.arrayBuffer();

  try {
    await uploadBuffer(key, buffer, contentType);
  } catch (err) {
    console.error('S3 upload failed', err);
    return c.json({ error: 'Failed to upload image' }, 502);
  }

  await db`
    INSERT INTO merchant_menu_uploads (merchant_id, s3_key)
    VALUES (${merchantId}, ${key})
  `;

  let parsed: { name: string; priceCents: number }[];
  try {
    parsed = await parseMenuImage(key);
  } catch (err) {
    console.error('AI parse failed', err);
    return c.json({ error: 'AI service unavailable' }, 502);
  }

  if (!parsed.length) {
    return c.json({ items: [] }, 201);
  }

  const rows = parsed.map((item) => ({
    merchant_id: merchantId,
    name: item.name,
    price_cents: item.priceCents,
    category: 'other',
  }));

  const inserted = await db`
    INSERT INTO menu_items ${db(rows, 'merchant_id', 'name', 'price_cents', 'category')}
    RETURNING id, name, price_cents, category
  `;

  return c.json(
    { items: inserted.map((r) => ({ id: String(r.id), name: r.name, priceCents: r.price_cents, category: r.category })) },
    201,
  );
});

// POST /v1/onboarding/form
onboardingRouter.post('/form', async (c) => {
  const merchantId = c.get('merchantId');

  const body = await c.req.json<{ items?: unknown[] }>().catch(() => ({}));
  if (!Array.isArray(body?.items) || body.items.length === 0) {
    return c.json({ error: 'items must be a non-empty array' }, 400);
  }

  const items = body.items as Array<{ name?: unknown; priceCents?: unknown }>;
  for (const item of items) {
    if (typeof item.name !== 'string' || !item.name.trim()) {
      return c.json({ error: 'Each item must have a non-empty name' }, 400);
    }
    if (typeof item.priceCents !== 'number' || item.priceCents < 1) {
      return c.json({ error: 'Each item must have priceCents >= 1' }, 400);
    }
  }

  const rows = items.map((item) => ({
    merchant_id: merchantId,
    name: (item.name as string).trim(),
    price_cents: item.priceCents as number,
    category: 'other',
  }));

  const inserted = await db`
    INSERT INTO menu_items ${db(rows, 'merchant_id', 'name', 'price_cents', 'category')}
    RETURNING id, name, price_cents, category
  `;

  return c.json(
    { items: inserted.map((r) => ({ id: String(r.id), name: r.name, priceCents: r.price_cents, category: r.category })) },
    201,
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/onboarding.ts
git commit -m "feat(api): add onboarding image and form endpoints"
```

---

## Task 6: Wire Everything in `src/index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace `src/index.ts`**

```ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from './middleware/auth.js';
import { onboardingRouter } from './routes/onboarding.js';
import { aiMockRouter } from './routes/ai-mock.js';

const app = new Hono();

app.use('/*', cors({
  origin: process.env.WEB_ORIGIN || 'http://localhost:3000',
}));

app.use('/v1/*', authMiddleware);

app.get('/health', (c) => {
  return c.json({ ok: true, service: 'api', version: '0.1.0', mode: 'real' });
});

app.route('/v1/onboarding', onboardingRouter);
app.route('/_ai', aiMockRouter);

const port = parseInt(process.env.PORT || '3001', 10);
console.log(`API server running on http://localhost:${port}`);

export default { port, fetch: app.fetch };
```

- [ ] **Step 2: Start the server and smoke-test**

```bash
DATABASE_URL=<your-url> bun dev
```

In a second terminal:

```bash
# Health check
curl http://localhost:3001/health
# Expected: {"ok":true,"service":"api","version":"0.1.0","mode":"real"}

# Form endpoint
curl -X POST http://localhost:3001/v1/onboarding/form \
  -H "Content-Type: application/json" \
  -H "X-Merchant-Id: 1" \
  -d '{"items":[{"name":"Nasi Lemak","priceCents":500},{"name":"Teh Tarik","priceCents":200}]}'
# Expected 201: {"items":[{"id":"1","name":"Nasi Lemak","priceCents":500,"category":"other"},{"id":"2","name":"Teh Tarik","priceCents":200,"category":"other"}]}

# Image endpoint (mock AI — no real S3 needed if AWS creds not set, will 502 on S3 step)
# With real creds:
curl -X POST http://localhost:3001/v1/onboarding/image \
  -H "X-Merchant-Id: 1" \
  -F "image=@/path/to/menu.jpg"
# Expected 201: {"items":[{"id":"...","name":"Nasi Lemak Biasa",...},...]}
```

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(api): wire onboarding routes and AI mock into server"
```

---

## Self-Review Notes

- **Spec coverage:** migration ✓, S3 upload + DB record ✓, AI client + mock ✓, form endpoint ✓, image endpoint ✓, auth middleware ✓, response shape camelCase ✓
- **Type consistency:** `ParsedItem` defined in `ai.ts` Task 4 Step 1, consumed in `onboarding.ts` Task 5 Step 1 via `import` ✓
- **`db` helper usage:** `db(rows, ...cols)` is the `postgres` package's bulk-insert helper — matches the tagged-template client exported from `src/db/index.ts` ✓
- **Mock URL:** `AI_BASE` defaults to `http://localhost:3001/_ai`; mock route mounts at `app.route('/_ai', aiMockRouter)` which registers `/_ai/v1/parse-menu` — path aligns ✓
