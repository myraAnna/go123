import { db } from '../db/index.js';

const MERCHANT_ID = process.env.MERCHANT_ID || '1';
const ORDER_COUNT = Number(process.env.ORDER_COUNT || '25');
const PAID_RATIO = Number(process.env.PAID_RATIO || '0.8');
const DAYS_BACK = Number(process.env.DAYS_BACK || '30');

const SAMPLE_EMAILS = [
  'aiman@example.com',
  'mei.ling@example.com',
  'rajesh@example.com',
  'siti@example.com',
  'daniel@example.com',
  'farah@example.com',
  'kumar@example.com',
  'wei.jie@example.com',
];

type MenuRow = { id: string; name: string; price_cents: number };

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = randInt(0, copy.length - 1);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

async function main() {
  const merchant = await db<{ id: bigint | string; business_name: string }[]>`
    SELECT id, business_name FROM merchants WHERE id = ${MERCHANT_ID}
  `;
  if (!merchant.length) {
    console.error(`Merchant ${MERCHANT_ID} not found. Run migrations first or set MERCHANT_ID.`);
    process.exit(1);
  }

  const menu = await db<MenuRow[]>`
    SELECT id::text AS id, name, price_cents
    FROM menu_items
    WHERE merchant_id = ${MERCHANT_ID}
  `;
  if (menu.length === 0) {
    console.error(`No menu items for merchant ${MERCHANT_ID}. Run \`bun run seed:menu\` first.`);
    process.exit(1);
  }

  console.log(
    `Seeding ${ORDER_COUNT} orders for merchant ${MERCHANT_ID} (${merchant[0].business_name}) ` +
      `from ${menu.length} menu items, ~${Math.round(PAID_RATIO * 100)}% paid, spread over ${DAYS_BACK} days.`,
  );

  const now = Date.now();
  const windowMs = DAYS_BACK * 24 * 60 * 60 * 1000;

  let totalItemsInserted = 0;
  let totalPaid = 0;
  let totalRevenueCents = 0;

  for (let i = 0; i < ORDER_COUNT; i++) {
    const lineCount = randInt(1, Math.min(5, menu.length));
    const picked = pickN(menu, lineCount);

    const lineItems = picked.map((m) => {
      const qty = randInt(1, 3);
      return {
        menuItemId: m.id,
        name: m.name,
        qty,
        unitPriceCents: m.price_cents,
      };
    });

    const totalCents = lineItems.reduce((s, li) => s + li.qty * li.unitPriceCents, 0);
    if (totalCents <= 0) continue;

    const createdAt = new Date(now - randInt(0, windowMs));
    const isPaid = Math.random() < PAID_RATIO;
    const paidAt = isPaid ? new Date(createdAt.getTime() + randInt(30_000, 10 * 60_000)) : null;
    const buyerEmail = isPaid ? pick(SAMPLE_EMAILS) : null;

    await db.begin(async (tx) => {
      const [order] = await tx<{ id: bigint | string }[]>`
        INSERT INTO orders (merchant_id, total_cents, qr_payload, paid_at, buyer_email, created_at, updated_at)
        VALUES (
          ${MERCHANT_ID},
          ${totalCents},
          ${''},
          ${paidAt},
          ${buyerEmail},
          ${createdAt},
          ${paidAt ?? createdAt}
        )
        RETURNING id
      `;
      const orderId = String(order.id);

      const itemRows = lineItems.map((li) => ({
        merchant_id: MERCHANT_ID,
        order_id: orderId,
        menu_item_id: li.menuItemId,
        name_snapshot: li.name,
        qty: li.qty,
        unit_price_cents: li.unitPriceCents,
      }));

      await tx`
        INSERT INTO order_items ${tx(
          itemRows,
          'merchant_id',
          'order_id',
          'menu_item_id',
          'name_snapshot',
          'qty',
          'unit_price_cents',
        )}
      `;
    });

    totalItemsInserted += lineItems.length;
    if (isPaid) {
      totalPaid++;
      totalRevenueCents += totalCents;
    }
  }

  console.log(
    `Inserted ${ORDER_COUNT} orders (${totalItemsInserted} line items). ` +
      `${totalPaid} paid, ${ORDER_COUNT - totalPaid} unpaid. ` +
      `Paid revenue: RM ${(totalRevenueCents / 100).toFixed(2)}.`,
  );

  await db.end();
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  await db.end().catch(() => {});
  process.exit(1);
});
