import { db } from '../db/index.js';

type Category = 'main' | 'side' | 'drink' | 'dessert' | 'other';
type SeedItem = { name: string; price_cents: number; category: Category };

const MERCHANT_ID = process.env.MERCHANT_ID || '1';

const ITEMS: SeedItem[] = [
  // Mains
  { name: 'Nasi Lemak',          price_cents: 500,  category: 'main' },
  { name: 'Nasi Goreng Kampung', price_cents: 700,  category: 'main' },
  { name: 'Mee Goreng Mamak',    price_cents: 750,  category: 'main' },
  { name: 'Roti Canai',          price_cents: 180,  category: 'main' },
  { name: 'Char Kuey Teow',      price_cents: 800,  category: 'main' },
  { name: 'Nasi Ayam',           price_cents: 850,  category: 'main' },
  { name: 'Mee Rebus',           price_cents: 650,  category: 'main' },
  { name: 'Laksa',               price_cents: 800,  category: 'main' },
  { name: 'Nasi Kerabu',         price_cents: 900,  category: 'main' },

  // Sides
  { name: 'Telur Mata',     price_cents: 150, category: 'side' },
  { name: 'Ayam Goreng',    price_cents: 400, category: 'side' },
  { name: 'Sambal Sotong',  price_cents: 600, category: 'side' },
  { name: 'Tempe Goreng',   price_cents: 200, category: 'side' },
  { name: 'Kerupuk',        price_cents: 100, category: 'side' },
  { name: 'Sayur Campur',   price_cents: 300, category: 'side' },

  // Drinks
  { name: 'Teh Tarik',      price_cents: 250, category: 'drink' },
  { name: 'Kopi O',         price_cents: 200, category: 'drink' },
  { name: 'Milo Ais',       price_cents: 350, category: 'drink' },
  { name: 'Air Limau',      price_cents: 250, category: 'drink' },
  { name: 'Sirap Bandung',  price_cents: 300, category: 'drink' },
  { name: 'Air Suam',       price_cents: 100, category: 'drink' },
  { name: 'Teh Ais',        price_cents: 250, category: 'drink' },

  // Desserts
  { name: 'Cendol',         price_cents: 450, category: 'dessert' },
  { name: 'ABC',            price_cents: 500, category: 'dessert' },
  { name: 'Pisang Goreng',  price_cents: 300, category: 'dessert' },
  { name: 'Kuih Lapis',     price_cents: 150, category: 'dessert' },
];

async function main() {
  const merchant = await db<{ id: bigint | string; business_name: string }[]>`
    SELECT id, business_name FROM merchants WHERE id = ${MERCHANT_ID}
  `;
  if (!merchant.length) {
    console.error(`Merchant ${MERCHANT_ID} not found. Run migrations first (\`bun run migrate\`) or set MERCHANT_ID.`);
    process.exit(1);
  }
  console.log(`Seeding menu for merchant ${MERCHANT_ID} (${merchant[0].business_name})`);

  const namesLower = ITEMS.map((i) => i.name.toLowerCase());
  const existing = await db<{ name: string }[]>`
    SELECT name FROM menu_items
    WHERE merchant_id = ${MERCHANT_ID}
      AND lower(name) = ANY(${namesLower})
  `;
  const existingLower = new Set(existing.map((r) => r.name.toLowerCase()));

  const toInsert = ITEMS.filter((i) => !existingLower.has(i.name.toLowerCase()));
  const skipped = ITEMS.length - toInsert.length;

  if (toInsert.length === 0) {
    console.log(`Nothing to insert. ${skipped} item(s) already exist.`);
    await db.end();
    return;
  }

  const rows = toInsert.map((i) => ({
    merchant_id: MERCHANT_ID,
    name: i.name,
    price_cents: i.price_cents,
    category: i.category,
  }));

  const inserted = await db`
    INSERT INTO menu_items ${db(rows, 'merchant_id', 'name', 'price_cents', 'category')}
    RETURNING id, name, price_cents, category
  ` as unknown as Array<{ id: bigint | string; name: string; price_cents: number; category: string }>;

  console.log(`Inserted ${inserted.length} item(s); skipped ${skipped} existing.`);
  for (const r of inserted) {
    const price = (r.price_cents / 100).toFixed(2);
    console.log(`  + [${r.category.padEnd(7)}] ${r.name.padEnd(22)} RM ${price}`);
  }

  await db.end();
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  await db.end().catch(() => {});
  process.exit(1);
});
