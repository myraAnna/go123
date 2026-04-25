import { Hono } from 'hono';
import type { Context } from 'hono';
import { db } from '../db/index.js';
import { chatAsk, createChatSession, getChatMessages, suggestChatQuestions } from '../clients/ai.js';

export const chatRouter = new Hono();

type ChatSessionRow = { ai_session_id: string };

async function getOrCreateTodaySession(merchantId: string): Promise<string> {
  const existing = await db<ChatSessionRow[]>`
    SELECT ai_session_id
    FROM chat_sessions
    WHERE merchant_id = ${merchantId}
      AND session_date = (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
    LIMIT 1
  `;
  if (existing.length > 0) return existing[0].ai_session_id;

  const aiSessionId = await createChatSession(merchantId);

  // Self-referential DO UPDATE forces RETURNING on conflict so we don't need a follow-up SELECT.
  // If a parallel request beat us, we get its ai_session_id and discard ours.
  const [row] = await db<ChatSessionRow[]>`
    INSERT INTO chat_sessions (merchant_id, ai_session_id, session_date)
    VALUES (
      ${merchantId},
      ${aiSessionId},
      (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
    )
    ON CONFLICT (merchant_id, session_date)
    DO UPDATE SET ai_session_id = chat_sessions.ai_session_id
    RETURNING ai_session_id
  `;
  return row.ai_session_id;
}

async function withSession(
  c: Context,
  handler: (sessionId: string, merchantId: string) => Promise<Response>,
): Promise<Response> {
  const merchantId = c.get('merchantId');
  let sessionId: string;
  try {
    sessionId = await getOrCreateTodaySession(merchantId);
  } catch (err) {
    console.error('Chat session init failed', err);
    return c.json({ error: 'Failed to init chat session' }, 502);
  }
  try {
    return await handler(sessionId, merchantId);
  } catch (err) {
    console.error('Chat AI call failed', err);
    return c.json({ error: 'AI service unavailable' }, 502);
  }
}

// POST /v1/chat
chatRouter.post('/', async (c) => {
  const body = await c.req
    .json<{ question?: unknown }>()
    .catch(() => ({} as { question?: unknown }));
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) {
    return c.json({ error: 'question must be a non-empty string' }, 400);
  }

  return withSession(c, async (sessionId, merchantId) => {
    const res = await chatAsk({ sessionId, question, merchantId });
    return c.json({ sessionId, answer: res.answer, evidence: res.evidence });
  });
});

// GET /v1/chat/messages
chatRouter.get('/messages', (c) =>
  withSession(c, async (sessionId, merchantId) => {
    const res = await getChatMessages(sessionId, merchantId);
    return c.json({ sessionId, messages: res.messages });
  }),
);

// POST /v1/chat/suggest-questions
chatRouter.post('/suggest-questions', (c) =>
  withSession(c, async (sessionId, merchantId) => {
    const suggestedQuestions = await suggestChatQuestions(sessionId, merchantId);
    return c.json({ sessionId, suggestedQuestions });
  }),
);
