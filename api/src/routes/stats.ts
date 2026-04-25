import { Hono } from 'hono';
import { db } from '../db/index.js';

export const statsRouter = new Hono();

const isIsoDate = (s: string) => !Number.isNaN(Date.parse(s));

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type Window = { since: Date; until: Date };

/**
 * Parses ?since=&until= ISO query params with last-30-days defaults.
 * Returns either a parsed window or a 400-ready error message.
 */
function parseWindow(sinceParam: string | undefined, untilParam: string | undefined):
  | { window: Window }
  | { error: string } {
  if (sinceParam !== undefined && !isIsoDate(sinceParam)) {
    return { error: 'since must be a valid ISO date' };
  }
  if (untilParam !== undefined && !isIsoDate(untilParam)) {
    return { error: 'until must be a valid ISO date' };
  }
  const until = untilParam ? new Date(untilParam) : new Date();
  const since = sinceParam ? new Date(sinceParam) : new Date(until.getTime() - DEFAULT_WINDOW_MS);
  if (since.getTime() >= until.getTime()) {
    return { error: 'since must be earlier than until' };
  }
  return { window: { since, until } };
}

// Suppress unused-import warning until first handler lands.
void db;

// GET /v1/stats/_ping — temporary, removed after Task 2 lands.
statsRouter.get('/_ping', (c) => c.json({ ok: true }));
