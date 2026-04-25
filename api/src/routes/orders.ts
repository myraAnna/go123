import { Hono } from 'hono';
import { db } from '../db/index.js';
import { sendEmail } from '../clients/mailjet.js';

export const ordersRouter = new Hono();

type MenuRow = {
  id: bigint | string;
  name: string;
  price_cents: number;
};

type OrderItemRow = {
  menu_item_id: bigint | string;
  name_snapshot: string;
  qty: number;
  unit_price_cents: number;
};

type OrderRow = {
  id: bigint | string;
  merchant_id: bigint | string;
  total_cents: number;
  paid_at: Date | null;
  buyer_email: string | null;
  created_at: Date;
};

const formatRm = (cents: number) => `RM ${(cents / 100).toFixed(2)}`;

type OrderListItemRow = {
  id: bigint | string;
  total_cents: number;
  paid_at: Date | null;
  buyer_email: string | null;
  created_at: Date;
};

type OrderItemListRow = {
  order_id: bigint | string;
  menu_item_id: bigint | string;
  name_snapshot: string;
  qty: number;
  unit_price_cents: number;
};

const isIsoDate = (s: string) => !Number.isNaN(Date.parse(s));

// GET /v1/orders?from=ISO&to=ISO
ordersRouter.get('/', async (c) => {
  const merchantId = c.get('merchantId');

  const from = c.req.query('from');
  const to = c.req.query('to');

  if (from !== undefined && !isIsoDate(from)) {
    return c.json({ error: 'from must be a valid ISO date' }, 400);
  }
  if (to !== undefined && !isIsoDate(to)) {
    return c.json({ error: 'to must be a valid ISO date' }, 400);
  }

  const orders = await db<OrderListItemRow[]>`
    SELECT id, total_cents, paid_at, buyer_email, created_at
    FROM orders
    WHERE merchant_id = ${merchantId}
      ${from ? db`AND created_at >= ${from}` : db``}
      ${to ? db`AND created_at <= ${to}` : db``}
    ORDER BY created_at DESC
  `;

  if (orders.length === 0) {
    return c.json({ orders: [] });
  }

  const orderIds = orders.map((o) => String(o.id));
  const items = await db<OrderItemListRow[]>`
    SELECT order_id, menu_item_id, name_snapshot, qty, unit_price_cents
    FROM order_items
    WHERE order_id = ANY(${orderIds})
    ORDER BY id ASC
  `;

  const itemsByOrder = new Map<string, OrderItemListRow[]>();
  for (const it of items) {
    const key = String(it.order_id);
    const list = itemsByOrder.get(key) ?? [];
    list.push(it);
    itemsByOrder.set(key, list);
  }

  return c.json({
    orders: orders.map((o) => {
      const orderId = String(o.id);
      const oItems = itemsByOrder.get(orderId) ?? [];
      return {
        orderId,
        totalCents: o.total_cents,
        paidAt: o.paid_at ? o.paid_at.toISOString() : null,
        buyerEmail: o.buyer_email,
        createdAt: o.created_at.toISOString(),
        items: oItems.map((i) => ({
          menuItemId: String(i.menu_item_id),
          name: i.name_snapshot,
          qty: i.qty,
          unitPriceCents: i.unit_price_cents,
          lineTotalCents: i.unit_price_cents * i.qty,
        })),
      };
    }),
  });
});

// POST /v1/orders
ordersRouter.post('/', async (c) => {
  const merchantId = c.get('merchantId');

  const body = await c.req
    .json<{ items?: unknown[] }>()
    .catch(() => ({} as { items?: unknown[] }));

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: 'items must be a non-empty array' }, 400);
  }

  const rawItems = body.items as Array<{ menuItemId?: unknown; qty?: unknown }>;
  const requested: { menuItemId: string; qty: number }[] = [];

  for (const [i, item] of rawItems.entries()) {
    if (typeof item.menuItemId !== 'string' || !/^\d+$/.test(item.menuItemId)) {
      return c.json({ error: `Item #${i}: menuItemId must be a numeric string` }, 400);
    }
    if (typeof item.qty !== 'number' || !Number.isInteger(item.qty) || item.qty < 1) {
      return c.json({ error: `Item #${i}: qty must be an integer >= 1` }, 400);
    }
    requested.push({ menuItemId: item.menuItemId, qty: item.qty });
  }

  // Aggregate qty per menuItemId so duplicates merge.
  const qtyByMenuId = new Map<string, number>();
  for (const r of requested) {
    qtyByMenuId.set(r.menuItemId, (qtyByMenuId.get(r.menuItemId) ?? 0) + r.qty);
  }
  const menuIds = [...qtyByMenuId.keys()];

  const menuRows = await db<MenuRow[]>`
    SELECT id, name, price_cents
    FROM menu_items
    WHERE merchant_id = ${merchantId}
      AND id = ANY(${menuIds})
  `;

  if (menuRows.length !== menuIds.length) {
    const found = new Set(menuRows.map((r) => String(r.id)));
    const missing = menuIds.filter((id) => !found.has(id));
    return c.json({ error: `Menu items not found: ${missing.join(', ')}` }, 404);
  }

  const lineItems = menuRows.map((m) => {
    const qty = qtyByMenuId.get(String(m.id))!;
    return {
      menuItemId: String(m.id),
      name: m.name,
      qty,
      unitPriceCents: m.price_cents,
      lineTotalCents: m.price_cents * qty,
    };
  });

  const totalCents = lineItems.reduce((sum, li) => sum + li.lineTotalCents, 0);

  const result = await db.begin(async (tx) => {
    const [order] = await tx<{ id: bigint | string }[]>`
      INSERT INTO orders (merchant_id, total_cents, qr_payload)
      VALUES (${merchantId}, ${totalCents}, ${''})
      RETURNING id
    `;
    const orderId = String(order.id);

    const itemRows = lineItems.map((li) => ({
      merchant_id: merchantId,
      order_id: orderId,
      menu_item_id: li.menuItemId,
      name_snapshot: li.name,
      qty: li.qty,
      unit_price_cents: li.unitPriceCents,
    }));

    await tx`
      INSERT INTO order_items ${tx(
        itemRows,
        'merchant_id',
        'order_id',
        'menu_item_id',
        'name_snapshot',
        'qty',
        'unit_price_cents',
      )}
    `;

    return { orderId };
  });

  return c.json(
    {
      orderId: result.orderId,
      items: lineItems,
      totalCents,
    },
    201,
  );
});

// POST /v1/orders/:id/paid  (payment gateway callback)
ordersRouter.post('/:id/paid', async (c) => {
  const id = c.req.param('id');
  if (!/^\d+$/.test(id)) {
    return c.json({ error: 'Invalid id' }, 400);
  }

  const body = await c.req
    .json<{ paymentEmail?: unknown; orderId?: unknown }>()
    .catch(() => ({} as { paymentEmail?: unknown; orderId?: unknown }));

  // Allow orderId in body too — gateways often POST it that way.
  if (body.orderId !== undefined && String(body.orderId) !== id) {
    return c.json({ error: 'orderId in body does not match path' }, 400);
  }
  if (typeof body.paymentEmail !== 'string' || !body.paymentEmail.includes('@')) {
    return c.json({ error: 'paymentEmail must be a valid email' }, 400);
  }
  const paymentEmail = body.paymentEmail.trim();

  const updated = await db<OrderRow[]>`
    UPDATE orders
    SET paid_at = NOW(),
        buyer_email = ${paymentEmail},
        updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, merchant_id, total_cents, paid_at, buyer_email, created_at
  `;

  if (!updated.length) {
    return c.json({ error: 'Order not found' }, 404);
  }
  const order = updated[0];

  const items = await db<OrderItemRow[]>`
    SELECT menu_item_id, name_snapshot, qty, unit_price_cents
    FROM order_items
    WHERE order_id = ${id}
    ORDER BY id ASC
  `;

  const merchantRows = await db<{ business_name: string }[]>`
    SELECT business_name FROM merchants WHERE id = ${String(order.merchant_id)}
  `;
  const businessName = merchantRows[0]?.business_name ?? 'Warung AI';

  const orderIdStr = String(order.id);
  const paidAtIso = order.paid_at ? order.paid_at.toISOString() : new Date().toISOString();

  const lineRowsText = items
    .map((i) => `  ${i.qty} x ${i.name_snapshot} @ ${formatRm(i.unit_price_cents)} = ${formatRm(i.unit_price_cents * i.qty)}`)
    .join('\n');

  const lineRowsHtml = items
    .map(
      (i) => `
        <tr>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;">${escapeHtml(i.name_snapshot)}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;">${i.qty}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;">${formatRm(i.unit_price_cents)}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;">${formatRm(i.unit_price_cents * i.qty)}</td>
        </tr>`,
    )
    .join('');

  const text = [
    `E-Invoice from ${businessName}`,
    ``,
    `Order ID: ${orderIdStr}`,
    `Paid at: ${paidAtIso}`,
    ``,
    `Items:`,
    lineRowsText,
    ``,
    `Total: ${formatRm(order.total_cents)}`,
    ``,
    `Thank you for your purchase!`,
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 4px 0;">E-Invoice</h2>
      <div style="color:#666;margin-bottom:16px;">${escapeHtml(businessName)}</div>
      <div><strong>Order ID:</strong> ${escapeHtml(orderIdStr)}</div>
      <div><strong>Paid at:</strong> ${escapeHtml(paidAtIso)}</div>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead>
          <tr style="background:#f7f7f7;">
            <th style="padding:8px 12px;text-align:left;">Item</th>
            <th style="padding:8px 12px;text-align:center;">Qty</th>
            <th style="padding:8px 12px;text-align:right;">Unit</th>
            <th style="padding:8px 12px;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${lineRowsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding:12px;text-align:right;font-weight:bold;">Total</td>
            <td style="padding:12px;text-align:right;font-weight:bold;">${formatRm(order.total_cents)}</td>
          </tr>
        </tfoot>
      </table>
      <p style="margin-top:24px;color:#666;">Thank you for your purchase!</p>
    </div>
  `;

  try {
    await sendEmail({
      to: { email: paymentEmail },
      subject: `E-Invoice ${orderIdStr} from ${businessName}`,
      text,
      html,
    });
  } catch (err) {
    console.error('Mailjet send failed', err);
    return c.json({ error: 'Failed to send invoice email', orderId: orderIdStr }, 502);
  }

  return c.json({
    orderId: orderIdStr,
    paidAt: paidAtIso,
    buyerEmail: paymentEmail,
    invoiceSent: true,
  });
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
