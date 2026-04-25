import { Hono } from 'hono';
import { db } from '../db/index.js';
import { sendEmail } from '../clients/mailjet.js';

export const callbacksRouter = new Hono();

type OrderRow = {
  id: bigint | string;
  merchant_id: bigint | string;
  total_cents: number;
  paid_at: Date | null;
  buyer_email: string | null;
  created_at: Date;
  was_already_paid: boolean;
};

type OrderItemRow = {
  menu_item_id: bigint | string;
  name_snapshot: string;
  qty: number;
  unit_price_cents: number;
};

const formatRm = (cents: number) => `RM ${(cents / 100).toFixed(2)}`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// GET /callback/orders/:id/paid?email=...   (QR-code callback, public)
callbacksRouter.get('/orders/:id/paid', async (c) => {
  const id = c.req.param('id');
  if (!/^\d+$/.test(id)) {
    return c.json({ error: 'Invalid id' }, 400);
  }

  const emailParam = c.req.query('email');
  if (typeof emailParam !== 'string' || !emailParam.includes('@')) {
    return c.json({ error: 'email query parameter must be a valid email' }, 400);
  }
  const paymentEmail = emailParam.trim();

  // Idempotent: only set paid_at on first scan; later scans don't reset it
  // or overwrite a different buyer_email.
  const updated = await db<OrderRow[]>`
    WITH prev AS (
      SELECT id, paid_at AS prev_paid_at FROM orders WHERE id = ${id}
    )
    UPDATE orders o
    SET paid_at = COALESCE(o.paid_at, NOW()),
        buyer_email = COALESCE(o.buyer_email, ${paymentEmail}),
        updated_at = NOW()
    FROM prev
    WHERE o.id = prev.id
    RETURNING
      o.id, o.merchant_id, o.total_cents, o.paid_at, o.buyer_email, o.created_at,
      (prev.prev_paid_at IS NOT NULL) AS was_already_paid
  `;

  if (!updated.length) {
    return c.json({ error: 'Order not found' }, 404);
  }
  const order = updated[0];

  if (order.was_already_paid) {
    return c.json({
      orderId: String(order.id),
      paidAt: order.paid_at ? order.paid_at.toISOString() : null,
      buyerEmail: order.buyer_email,
      invoiceSent: false,
      alreadyPaid: true,
    });
  }

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
