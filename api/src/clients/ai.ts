const AI_BASE = process.env.AI_URL ?? 'http://localhost:3001/_ai';

export interface ParsedItem {
  name: string;
  priceCents: number;
  category: string;
}

export async function parseMenuImage(s3Key: string): Promise<ParsedItem[]> {
  const res = await fetch(`${AI_BASE}/v1/parse-menu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ s3Key }),
  });
  if (!res.ok) throw new Error(`AI service error: ${res.status}`);
  const data = await res.json() as { items: ParsedItem[] };
  return data.items;
}
