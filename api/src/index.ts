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
  return c.json({ ok: true, service: 'api', version: '0.1.0', mode: process.env.FAKE_MODE === '1' ? 'fake' : 'real' });
});

app.route('/v1/onboarding', onboardingRouter);
app.route('/_ai', aiMockRouter);

const port = parseInt(process.env.PORT || '3001', 10);
console.log(`API server running on http://localhost:${port}`);

export default { port, fetch: app.fetch };
