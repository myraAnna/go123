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

type RevenueRow = { revenue_cents: number; order_count: number };

async function fetchRevenue(merchantId: string, since: Date, until: Date): Promise<RevenueRow> {
  const [row] = await db<RevenueRow[]>`
    SELECT COALESCE(SUM(total_cents), 0)::int AS revenue_cents,
           COUNT(*)::int                       AS order_count
    FROM orders
    WHERE merchant_id = ${merchantId}
      AND paid_at IS NOT NULL
      AND paid_at >= ${since}
      AND paid_at <  ${until}
  `;
  return row;
}

const pctChange = (curr: number, prev: number): number | null => {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10; // one decimal place
};

// GET /v1/stats/summary?since=&until=&compare=true
statsRouter.get('/summary', async (c) => {
  const merchantId = c.get('merchantId');

  const parsed = parseWindow(c.req.query('since'), c.req.query('until'));
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);
  const { since, until } = parsed.window;

  const compare = c.req.query('compare') === 'true';

  const current = await fetchRevenue(merchantId, since, until);

  const periodMs = until.getTime() - since.getTime();
  const periodDays = Math.ceil(periodMs / (24 * 60 * 60 * 1000));
  const aov = current.order_count === 0
    ? 0
    : Math.round(current.revenue_cents / current.order_count);

  let comparePrevious: { revenueChangePct: number | null; orderCountChangePct: number | null } | null = null;

  if (compare) {
    const prevUntil = since;
    const prevSince = new Date(prevUntil.getTime() - periodMs);
    const prev = await fetchRevenue(merchantId, prevSince, prevUntil);
    if (prev.order_count === 0 && prev.revenue_cents === 0) {
      comparePrevious = null;
    } else {
      comparePrevious = {
        revenueChangePct: pctChange(current.revenue_cents, prev.revenue_cents),
        orderCountChangePct: pctChange(current.order_count, prev.order_count),
      };
    }
  }

  return c.json({
    revenueCents: current.revenue_cents,
    orderCount: current.order_count,
    averageOrderValueCents: aov,
    periodDays,
    comparePrevious,
  });
});

type HeatmapRow = {
  day_of_week: number;
  hour: number;
  order_count: number;
  revenue_cents: number;
};

// GET /v1/stats/heatmap?since=&until=
statsRouter.get('/heatmap', async (c) => {
  const merchantId = c.get('merchantId');

  const parsed = parseWindow(c.req.query('since'), c.req.query('until'));
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);
  const { since, until } = parsed.window;

  const rows = await db<HeatmapRow[]>`
    SELECT EXTRACT(DOW  FROM paid_at AT TIME ZONE 'Asia/Kuala_Lumpur')::int AS day_of_week,
           EXTRACT(HOUR FROM paid_at AT TIME ZONE 'Asia/Kuala_Lumpur')::int AS hour,
           COUNT(*)::int                AS order_count,
           COALESCE(SUM(total_cents),0)::int AS revenue_cents
    FROM orders
    WHERE merchant_id = ${merchantId}
      AND paid_at IS NOT NULL
      AND paid_at >= ${since}
      AND paid_at <  ${until}
    GROUP BY 1, 2
    ORDER BY 1, 2
  `;

  return c.json({
    cells: rows.map((r) => ({
      dayOfWeek: r.day_of_week,
      hour: r.hour,
      orderCount: r.order_count,
      revenueCents: r.revenue_cents,
    })),
  });
});

type TopItemRow = {
  id: bigint | string;
  name: string;
  qty: number;
  revenue_cents: number;
};

const LIMIT_MIN = 1;
const LIMIT_MAX = 50;
const LIMIT_DEFAULT = 10;

const parseLimit = (raw: string | undefined): number => {
  if (raw === undefined) return LIMIT_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return LIMIT_DEFAULT;
  return Math.min(Math.max(Math.trunc(n), LIMIT_MIN), LIMIT_MAX);
};

// GET /v1/stats/top-items?since=&until=&limit=10
statsRouter.get('/top-items', async (c) => {
  const merchantId = c.get('merchantId');

  const parsed = parseWindow(c.req.query('since'), c.req.query('until'));
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);
  const { since, until } = parsed.window;

  const limit = parseLimit(c.req.query('limit'));

  const best = await db<TopItemRow[]>`
    SELECT mi.id,
           mi.name,
           SUM(oi.qty)::int                       AS qty,
           SUM(oi.qty * oi.unit_price_cents)::int AS revenue_cents
    FROM order_items oi
    JOIN orders     o  ON o.id = oi.order_id
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE oi.merchant_id = ${merchantId}
      AND o.paid_at IS NOT NULL
      AND o.paid_at >= ${since}
      AND o.paid_at <  ${until}
    GROUP BY mi.id, mi.name
    ORDER BY qty DESC, revenue_cents DESC
    LIMIT ${limit}
  `;

  const worst = await db<TopItemRow[]>`
    SELECT mi.id,
           mi.name,
           COALESCE(sales.qty, 0)           AS qty,
           COALESCE(sales.revenue_cents, 0) AS revenue_cents
    FROM menu_items mi
    LEFT JOIN (
      SELECT oi.menu_item_id,
             SUM(oi.qty)::int                       AS qty,
             SUM(oi.qty * oi.unit_price_cents)::int AS revenue_cents
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.merchant_id = ${merchantId}
        AND o.paid_at IS NOT NULL
        AND o.paid_at >= ${since}
        AND o.paid_at <  ${until}
      GROUP BY oi.menu_item_id
    ) sales ON sales.menu_item_id = mi.id
    WHERE mi.merchant_id = ${merchantId}
    ORDER BY COALESCE(sales.qty, 0) ASC, mi.name ASC
    LIMIT ${limit}
  `;

  const shape = (r: TopItemRow) => ({
    menuItemId: String(r.id),
    name: r.name,
    qty: r.qty,
    revenueCents: r.revenue_cents,
  });

  return c.json({
    best:  best.map(shape),
    worst: worst.map(shape),
  });
});
