import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';

const app = new Hono();

// CORS middleware
app.use('/*', cors({
  origin: process.env.WEB_ORIGIN || 'http://localhost:3000',
}));

// Health check
app.get('/health', (c) => {
  const mode = process.env.FAKE_MODE === '1' ? 'fake' : 'real';
  return c.json({
    ok: true,
    service: 'api',
    version: '0.1.0',
    mode,
  });
});

// TODO: Add routes
// import { menuRouter } from './routes/menu';
// app.route('/v1/menu', menuRouter);

// Start server
const port = parseInt(process.env.PORT || '3001', 10);
console.log(`API server running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});

export default app;
