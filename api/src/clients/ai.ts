const AI_BASE = process.env.AI_URL ?? 'http://localhost:8001';

async function aiFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${AI_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '<unreadable>');
    throw new Error(`AI service error: ${res.status} ${init.method ?? 'GET'} ${path} body=${body}`);
  }
  return res.json() as Promise<T>;
}

export type MenuItemCategory = 'main' | 'side' | 'drink' | 'dessert' | 'other';

export interface ParsedItem {
  name: string;
  priceCents: number;
  category: string;
  description?: string;
}

export async function parseMenuImage(imageUrl: string): Promise<ParsedItem[]> {
  const data = await aiFetch<{ items: ParsedItem[] }>('/v1/onboarding/extract-menu', {
    method: 'POST',
    body: JSON.stringify({ urls: [imageUrl] }),
  });
  return data.items;
}

export interface ExtractMenuRequest {
  text?: string;
  files?: string[];
  urls?: string[];
}

export async function extractMenu(req: ExtractMenuRequest): Promise<ParsedItem[]> {
  const data = await aiFetch<{ items: ParsedItem[] }>('/v1/onboarding/extract-menu', {
    method: 'POST',
    body: JSON.stringify(req),
  });
  return data.items;
}

export interface AskEvidence {
  label: string;
  value?: string | null;
  valueCents?: number | null;
  valuePct?: number | null;
}

export interface AskQueryTrace {
  name: string;
  rowCount: number;
  durationMs: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  evidence?: AskEvidence[] | null;
  createdAt: string;
}

export interface AskResponse {
  answer: string;
  evidence: AskEvidence[];
  queries?: AskQueryTrace[] | null;
}

export async function createChatSession(merchantId: string): Promise<string> {
  const data = await aiFetch<{ sessionId: string }>('/v1/chat/sessions', {
    method: 'POST',
    body: JSON.stringify({ merchantId }),
  });
  return data.sessionId;
}

export async function getChatMessages(
  sessionId: string,
  merchantId: string,
): Promise<{ sessionId: string; messages: ChatMessage[] }> {
  const qs = new URLSearchParams({ merchantId }).toString();
  return aiFetch(`/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages?${qs}`, {
    method: 'GET',
  });
}

export async function chatAsk(req: {
  sessionId: string;
  question: string;
  merchantId: string;
}): Promise<AskResponse> {
  return aiFetch<AskResponse>('/v1/chat/ask', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function suggestChatQuestions(
  sessionId: string,
  merchantId: string,
): Promise<string[]> {
  const data = await aiFetch<{ suggestedQuestions: string[] }>('/v1/chat/suggest-questions', {
    method: 'POST',
    body: JSON.stringify({ sessionId, merchantId }),
  });
  return data.suggestedQuestions;
}
