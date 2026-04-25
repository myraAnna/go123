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
