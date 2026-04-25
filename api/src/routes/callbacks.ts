import { Hono } from 'hono';
import QRCode from 'qrcode';
import { db } from '../db/index.js';
import { sendEmail } from '../clients/resend.js';

export const callbacksRouter = new Hono();

const webOrigin = () => process.env.WEB_ORIGIN || 'http://localhost:3000';
const payPageUrl = (orderId: string) => `${webOrigin()}/warung-ai/pay/${orderId}`;

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

type MerchantRow = {
  business_name: string;
  owner_name: string;
  tin: string;
  registration_type: string;
  registration_number: string;
  sst_registration_number: string | null;
  phone: string;
  email: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state_code: string;
  postcode: string;
  country_code: string;
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
    return c.redirect(payPageUrl(String(order.id)), 302);
  }

  const [items, merchantRows] = await Promise.all([
    db<OrderItemRow[]>`
      SELECT menu_item_id, name_snapshot, qty, unit_price_cents
      FROM order_items
      WHERE order_id = ${id}
      ORDER BY id ASC
    `,
    db<MerchantRow[]>`
      SELECT
        business_name, owner_name, tin,
        registration_type, registration_number,
        sst_registration_number,
        phone, email,
        address_line1, address_line2, city, state_code, postcode, country_code
      FROM merchants
      WHERE id = ${String(order.merchant_id)}
    `,
  ]);
  const merchant = merchantRows[0];
  const businessName = merchant?.business_name ?? 'Warung AI';

  const orderIdStr = String(order.id);
  const paidAt = order.paid_at ?? new Date();
  const paidAtIso = paidAt.toISOString();
  const issuedDate = paidAt.toISOString().slice(0, 10);
  const invoiceNumber = `INV-${orderIdStr.padStart(6, '0')}`;

  const merchantAddressLines = merchant
    ? [
        merchant.address_line1,
        merchant.address_line2,
        [merchant.postcode, merchant.city].filter(Boolean).join(' '),
        [merchant.state_code, merchant.country_code].filter(Boolean).join(' '),
      ].filter((s): s is string => !!s && s.trim().length > 0)
    : [];

  const merchantContactText = merchant
    ? [
        merchant.phone ? `Phone: ${merchant.phone}` : null,
        merchant.email ? `Email: ${merchant.email}` : null,
        merchant.tin ? `TIN: ${merchant.tin}` : null,
        merchant.registration_number ? `${merchant.registration_type ?? 'Reg'}: ${merchant.registration_number}` : null,
        merchant.sst_registration_number ? `SST: ${merchant.sst_registration_number}` : null,
      ].filter((s): s is string => s !== null)
    : [];

  const subtotalCents = items.reduce((s, i) => s + i.unit_price_cents * i.qty, 0);

  const lineRowsText = items
    .map((i, idx) => {
      const lineTotal = i.unit_price_cents * i.qty;
      return `  ${idx + 1}. ${i.name_snapshot}  —  ${i.qty} x ${formatRm(i.unit_price_cents)}  =  ${formatRm(lineTotal)}`;
    })
    .join('\n');

  const lineRowsHtml = items
    .map(
      (i, idx) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;">${idx + 1}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(i.name_snapshot)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${i.qty}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${formatRm(i.unit_price_cents)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${formatRm(i.unit_price_cents * i.qty)}</td>
        </tr>`,
    )
    .join('');

  const text = [
    `INVOICE`,
    `========================================`,
    `Invoice No: ${invoiceNumber}`,
    `Order ID:   ${orderIdStr}`,
    `Issued:     ${issuedDate}`,
    `Paid at:    ${paidAtIso}`,
    `Status:     PAID`,
    ``,
    `From:`,
    `  ${businessName}`,
    ...(merchant?.owner_name ? [`  ${merchant.owner_name}`] : []),
    ...merchantAddressLines.map((l) => `  ${l}`),
    ...merchantContactText.map((l) => `  ${l}`),
    ``,
    `Bill to:`,
    `  ${paymentEmail}`,
    ``,
    `Items:`,
    `----------------------------------------`,
    lineRowsText,
    `----------------------------------------`,
    `Subtotal: ${formatRm(subtotalCents)}`,
    `TOTAL:    ${formatRm(order.total_cents)}`,
    ``,
    `Thank you for your purchase!`,
  ].join('\n');

  const qrPayload = {
    invoiceNumber,
    orderId: orderIdStr,
    merchant: businessName,
    paidAt: paidAtIso,
    totalCents: order.total_cents,
    items: items.map((i) => ({
      name: i.name_snapshot,
      qty: i.qty,
      unitPriceCents: i.unit_price_cents,
    })),
  };
  let qrPngBuffer: Buffer | null = null;
  try {
    qrPngBuffer = await QRCode.toBuffer(JSON.stringify(qrPayload), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 220,
      type: 'png',
    });
  } catch (err) {
    console.error('QR generation failed', err);
  }
  const qrCid = 'order-qr';

  const merchantBlockHtml = `
    <div style="font-weight:bold;font-size:16px;margin-bottom:4px;">${escapeHtml(businessName)}</div>
    ${merchant?.owner_name ? `<div style="color:#555;">${escapeHtml(merchant.owner_name)}</div>` : ''}
    ${merchantAddressLines.map((l) => `<div style="color:#555;">${escapeHtml(l)}</div>`).join('')}
    <div style="margin-top:8px;color:#555;font-size:13px;">
      ${merchantContactText.map((l) => `<div>${escapeHtml(l)}</div>`).join('')}
    </div>
  `;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#222;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="vertical-align:top;">
            <h1 style="margin:0;font-size:28px;letter-spacing:2px;">INVOICE</h1>
            <div style="color:#666;margin-top:4px;">${escapeHtml(invoiceNumber)}</div>
          </td>
          <td style="vertical-align:top;text-align:right;">
            <div style="display:inline-block;padding:6px 12px;background:#e8f5e9;color:#2e7d32;border-radius:4px;font-weight:bold;letter-spacing:1px;">PAID</div>
            <div style="margin-top:8px;color:#666;font-size:13px;">Issued: ${escapeHtml(issuedDate)}</div>
            <div style="color:#666;font-size:13px;">Order ID: ${escapeHtml(orderIdStr)}</div>
          </td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="vertical-align:top;width:50%;padding-right:12px;">
            <div style="text-transform:uppercase;color:#999;font-size:11px;letter-spacing:1px;margin-bottom:6px;">From</div>
            ${merchantBlockHtml}
          </td>
          <td style="vertical-align:top;width:50%;padding-left:12px;">
            <div style="text-transform:uppercase;color:#999;font-size:11px;letter-spacing:1px;margin-bottom:6px;">Bill to</div>
            <div style="font-weight:bold;font-size:16px;margin-bottom:4px;">${escapeHtml(paymentEmail)}</div>
            <div style="color:#555;font-size:13px;">Paid at ${escapeHtml(paidAtIso)}</div>
          </td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <thead>
          <tr style="background:#f7f7f7;">
            <th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#666;width:36px;">#</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#666;">Description</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#666;">Qty</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#666;">Unit</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#666;">Amount</th>
          </tr>
        </thead>
        <tbody>${lineRowsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="padding:10px 12px;text-align:right;color:#666;">Subtotal</td>
            <td style="padding:10px 12px;text-align:right;">${formatRm(subtotalCents)}</td>
          </tr>
          <tr>
            <td colspan="4" style="padding:12px;text-align:right;font-weight:bold;font-size:16px;border-top:2px solid #222;">Total</td>
            <td style="padding:12px;text-align:right;font-weight:bold;font-size:16px;border-top:2px solid #222;">${formatRm(order.total_cents)}</td>
          </tr>
        </tfoot>
      </table>

      ${qrPngBuffer ? `
      <div style="margin-top:32px;text-align:left;">
        <img src="cid:${qrCid}" alt="Order QR code" width="110" height="110" style="display:block;border:1px solid #eee;padding:4px;background:#fff;" />
        <div style="margin-top:6px;color:#999;font-size:10px;letter-spacing:1px;text-transform:uppercase;">Scan to verify</div>
      </div>
      ` : ''}

      <p style="margin-top:32px;color:#666;font-size:13px;text-align:center;">Thank you for your purchase!</p>
    </div>
  `;

  try {
    await sendEmail({
      to: { email: paymentEmail },
      subject: `Invoice ${invoiceNumber} from ${businessName}`,
      text,
      html,
      ...(qrPngBuffer
        ? {
            attachments: [
              {
                filename: `${invoiceNumber}-qr.png`,
                content: qrPngBuffer,
                contentType: 'image/png',
                contentId: qrCid,
              },
            ],
          }
        : {}),
    });
  } catch (err) {
    console.error('Email send failed', err);
    return c.json({ error: 'Failed to send invoice email', orderId: orderIdStr }, 502);
  }

  return c.redirect(payPageUrl(orderIdStr), 302);
});
