import { Hono } from 'hono';

export const aiMockRouter = new Hono();

aiMockRouter.post('/v1/parse-menu', (c) => {
  return c.json({
    items: [
      { name: 'Nasi Lemak Biasa', priceCents: 500, category: 'main' },
      { name: 'Ayam Goreng',      priceCents: 400, category: 'main' },
      { name: 'Telur Mata',       priceCents: 150, category: 'side' },
      { name: 'Teh Tarik',        priceCents: 200, category: 'drink' },
      { name: 'Kopi O',           priceCents: 180, category: 'drink' },
    ],
  });
});
