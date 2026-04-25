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

  const inserted = await db`
    INSERT INTO menu_items ${db(rows, 'merchant_id', 'name', 'price_cents', 'category')}
    RETURNING id, name, price_cents, category
  `;

  return c.json(
    { items: inserted.map((r) => ({ id: String(r.id), name: r.name, priceCents: r.price_cents, category: r.category })) },
    201,
  );
});
