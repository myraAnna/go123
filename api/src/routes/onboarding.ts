import { Hono } from 'hono';
import { db } from '../db/index.js';
import { uploadBuffer, getPresignedUrl } from '../clients/s3.js';
import { parseMenuImage } from '../clients/ai.js';

export const onboardingRouter = new Hono();

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
};

const ALLOWED_CATEGORIES = ['main', 'side', 'drink', 'dessert', 'other'] as const;
type Category = typeof ALLOWED_CATEGORIES[number];

const isCategory = (v: unknown): v is Category =>
  typeof v === 'string' && (ALLOWED_CATEGORIES as readonly string[]).includes(v);

type MenuItemRow = {
  id: bigint | string;
  name: string;
  price_cents: number;
  category: string;
};

const toApiItem = (r: MenuItemRow) => ({
  id: String(r.id),
  name: r.name,
  priceCents: r.price_cents,
  category: r.category,
});

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
  const ext = MIME_TO_EXT[contentType];
  if (!ext) {
    return c.json({ error: 'Unsupported image type. Use jpeg, png, webp, or gif.' }, 415);
  }
  const key = `merchants/${merchantId}/menus/${crypto.randomUUID()}.${ext}`;

  const buffer = await file.arrayBuffer();

  try {
    await uploadBuffer(key, buffer, contentType);
  } catch (err) {
    console.error('S3 upload failed', err);
    return c.json({ error: 'Failed to upload image' }, 502);
  }

  try {
    await db`
      INSERT INTO merchant_menu_uploads (merchant_id, s3_key)
      VALUES (${merchantId}, ${key})
    `;
  } catch (err) {
    console.error('DB insert failed for merchant_menu_uploads', err);
    return c.json({ error: 'Failed to record upload' }, 500);
  }

  let imageUrl: string;
  try {
    imageUrl = getPresignedUrl(key);
  } catch (err) {
    console.error('Presign failed', err);
    return c.json({ error: 'Failed to presign image url' }, 500);
  }

  let parsed: { name: string; priceCents: number; category: string }[];
  try {
    parsed = await parseMenuImage(imageUrl);
  } catch (err) {
    console.error('AI parse failed', err);
    return c.json({ error: 'AI service unavailable' }, 502);
  }

  const items = parsed.map((item) => ({
    name: item.name,
    priceCents: item.priceCents,
    category: isCategory(item.category) ? item.category : 'other',
  }));

  return c.json({ items }, 200);
});

// POST /v1/onboarding/form
onboardingRouter.post('/form', async (c) => {
  const merchantId = c.get('merchantId');

  const body = await c.req.json<{ items?: unknown[] }>().catch(() => ({} as { items?: unknown[] }));
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: 'items must be a non-empty array' }, 400);
  }

  const items = body.items as Array<{ name?: unknown; priceCents?: unknown }>;
  for (const item of items) {
    if (typeof item.name !== 'string' || !item.name.trim()) {
      return c.json({ error: 'Each item must have a non-empty name' }, 400);
    }
    if (typeof item.priceCents !== 'number' || !Number.isInteger(item.priceCents) || item.priceCents < 1) {
      return c.json({ error: 'Each item must have priceCents >= 1' }, 400);
    }
  }

  const rows = items.map((item) => ({
    merchant_id: merchantId,
    name: (item.name as string).trim(),
    price_cents: item.priceCents as number,
    category: 'other',
  }));

  const inserted = (await db`
    INSERT INTO menu_items ${db(rows, 'merchant_id', 'name', 'price_cents', 'category')}
    RETURNING id, name, price_cents, category
  `) as unknown as MenuItemRow[];

  return c.json(
    { items: inserted.map(toApiItem) },
    201,
  );
});

// GET /v1/onboarding/menu
onboardingRouter.get('/menu', async (c) => {
  const merchantId = c.get('merchantId');

  const rows = await db<MenuItemRow[]>`
    SELECT id, name, price_cents, category
    FROM menu_items
    WHERE merchant_id = ${merchantId}
    ORDER BY id ASC
  `;

  return c.json({ items: rows.map(toApiItem) });
});

// PATCH /v1/onboarding/menu/:id
onboardingRouter.patch('/menu/:id', async (c) => {
  const merchantId = c.get('merchantId');
  const id = c.req.param('id');
  if (!/^\d+$/.test(id)) {
    return c.json({ error: 'Invalid id' }, 400);
  }

  const body = await c.req
    .json<{ name?: unknown; priceCents?: unknown; category?: unknown }>()
    .catch(() => ({} as { name?: unknown; priceCents?: unknown; category?: unknown }));

  const updates: { name?: string; price_cents?: number; category?: Category } = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return c.json({ error: 'name must be a non-empty string' }, 400);
    }
    updates.name = body.name.trim();
  }

  if (body.priceCents !== undefined) {
    if (typeof body.priceCents !== 'number' || !Number.isInteger(body.priceCents) || body.priceCents < 1) {
      return c.json({ error: 'priceCents must be an integer >= 1' }, 400);
    }
    updates.price_cents = body.priceCents;
  }

  if (body.category !== undefined) {
    if (!isCategory(body.category)) {
      return c.json({ error: `category must be one of ${ALLOWED_CATEGORIES.join(', ')}` }, 400);
    }
    updates.category = body.category;
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  const updated = await db<MenuItemRow[]>`
    UPDATE menu_items
    SET ${db(updates)}, updated_at = NOW()
    WHERE id = ${id} AND merchant_id = ${merchantId}
    RETURNING id, name, price_cents, category
  `;

  if (!updated.length) {
    return c.json({ error: 'Menu item not found' }, 404);
  }

  return c.json({ item: toApiItem(updated[0]) });
});

// PATCH /v1/onboarding/menu
onboardingRouter.patch('/menu', async (c) => {
  const merchantId = c.get('merchantId');

  const body = await c.req.json<{ items?: unknown[] }>().catch(() => ({} as { items?: unknown[] }));
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: 'items must be a non-empty array' }, 400);
  }

  const items = body.items as Array<{
    id?: unknown;
    name?: unknown;
    priceCents?: unknown;
    category?: unknown;
  }>;

  type Patch = { id: string; name?: string; price_cents?: number; category?: Category };
  const patches: Patch[] = [];

  for (const item of items) {
    if (typeof item.id !== 'string' || !/^\d+$/.test(item.id)) {
      return c.json({ error: 'Each item must have a numeric string id' }, 400);
    }
    const patch: Patch = { id: item.id };

    if (item.name !== undefined) {
      if (typeof item.name !== 'string' || !item.name.trim()) {
        return c.json({ error: `Item ${item.id}: name must be a non-empty string` }, 400);
      }
      patch.name = item.name.trim();
    }
    if (item.priceCents !== undefined) {
      if (typeof item.priceCents !== 'number' || !Number.isInteger(item.priceCents) || item.priceCents < 1) {
        return c.json({ error: `Item ${item.id}: priceCents must be an integer >= 1` }, 400);
      }
      patch.price_cents = item.priceCents;
    }
    if (item.category !== undefined) {
      if (!isCategory(item.category)) {
        return c.json({ error: `Item ${item.id}: category must be one of ${ALLOWED_CATEGORIES.join(', ')}` }, 400);
      }
      patch.category = item.category;
    }

    if (patch.name === undefined && patch.price_cents === undefined && patch.category === undefined) {
      return c.json({ error: `Item ${item.id}: at least one field to update` }, 400);
    }
    patches.push(patch);
  }

  type Outcome = { ok: true; rows: MenuItemRow[] } | { ok: false; missingId: string };

  const outcome: Outcome = await db
    .begin(async (tx) => {
      const results: MenuItemRow[] = [];
      for (const p of patches) {
        const { id, ...fields } = p;
        const row = await tx<MenuItemRow[]>`
          UPDATE menu_items
          SET ${tx(fields)}, updated_at = NOW()
          WHERE id = ${id} AND merchant_id = ${merchantId}
          RETURNING id, name, price_cents, category
        `;
        if (!row.length) {
          throw new Error(`NOT_FOUND:${id}`);
        }
        results.push(row[0]);
      }
      return results;
    })
    .then((rows) => ({ ok: true as const, rows: rows as MenuItemRow[] }))
    .catch((err: Error) => {
      if (err.message?.startsWith('NOT_FOUND:')) {
        return { ok: false as const, missingId: err.message.split(':')[1] };
      }
      throw err;
    });

  if (!outcome.ok) {
    return c.json({ error: `Menu item not found: ${outcome.missingId}` }, 404);
  }

  return c.json({ items: outcome.rows.map(toApiItem) });
});

// POST /v1/onboarding/menu/verify
// Accept the merchant-verified menu items. For each item, insert a new row
// or skip it if a menu item with the same name (case-insensitive) already
// exists for this merchant.
onboardingRouter.post('/menu/verify', async (c) => {
  const merchantId = c.get('merchantId');

  const body = await c.req.json<{ items?: unknown[] }>().catch(() => ({} as { items?: unknown[] }));
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: 'items must be a non-empty array' }, 400);
  }

  const items = body.items as Array<{ name?: unknown; priceCents?: unknown; category?: unknown }>;

  type Entry = { name: string; price_cents: number; category: Category };
  const entries: Entry[] = [];

  for (const [i, item] of items.entries()) {
    if (typeof item.name !== 'string' || !item.name.trim()) {
      return c.json({ error: `Item #${i}: name is required` }, 400);
    }
    if (typeof item.priceCents !== 'number' || !Number.isInteger(item.priceCents) || item.priceCents < 1) {
      return c.json({ error: `Item #${i}: priceCents must be an integer >= 1` }, 400);
    }
    if (!isCategory(item.category)) {
      return c.json({ error: `Item #${i}: category must be one of ${ALLOWED_CATEGORIES.join(', ')}` }, 400);
    }
    entries.push({
      name: item.name.trim(),
      price_cents: item.priceCents,
      category: item.category,
    });
  }

  // De-duplicate within the request (case-insensitive), keeping first occurrence.
  const seen = new Set<string>();
  const deduped = entries.filter((e) => {
    const key = e.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const namesLower = deduped.map((e) => e.name.toLowerCase());
  const existing = await db<{ name: string }[]>`
    SELECT name FROM menu_items
    WHERE merchant_id = ${merchantId}
      AND lower(name) = ANY(${namesLower})
  `;
  const existingLower = new Set(existing.map((r) => r.name.toLowerCase()));

  const toInsert = deduped.filter((e) => !existingLower.has(e.name.toLowerCase()));
  const skippedCount = entries.length - toInsert.length;

  if (toInsert.length === 0) {
    return c.json({ items: [], skippedCount });
  }

  const rows = toInsert.map((e) => ({
    merchant_id: merchantId,
    name: e.name,
    price_cents: e.price_cents,
    category: e.category,
  }));

  const inserted = (await db`
    INSERT INTO menu_items ${db(rows, 'merchant_id', 'name', 'price_cents', 'category')}
    RETURNING id, name, price_cents, category
  `) as unknown as MenuItemRow[];

  return c.json({ items: inserted.map(toApiItem), skippedCount });
});
