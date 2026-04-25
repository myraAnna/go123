import { Hono } from 'hono';
import { db } from '../db/index.js';

export const merchantsRouter = new Hono();

type MerchantRow = {
  id: bigint | string;
  business_name: string;
  owner_name: string;
  business_type: string;
  tin: string;
  registration_type: string;
  registration_number: string;
  sst_registration_number: string | null;
  ttx_registration_number: string | null;
  msic_code: string;
  business_activity_description: string;
  phone: string;
  email: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state_code: string;
  postcode: string;
  country_code: string;
  created_at: Date;
  updated_at: Date;
};

const toApiMerchant = (r: MerchantRow) => ({
  id: String(r.id),
  businessName: r.business_name,
  ownerName: r.owner_name,
  businessType: r.business_type,
  tin: r.tin,
  registrationType: r.registration_type,
  registrationNumber: r.registration_number,
  sstRegistrationNumber: r.sst_registration_number,
  ttxRegistrationNumber: r.ttx_registration_number,
  msicCode: r.msic_code,
  businessActivityDescription: r.business_activity_description,
  phone: r.phone,
  email: r.email,
  addressLine1: r.address_line1,
  addressLine2: r.address_line2,
  city: r.city,
  stateCode: r.state_code,
  postcode: r.postcode,
  countryCode: r.country_code,
  createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
});

// GET /v1/merchants/:id
merchantsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^\d+$/.test(id)) {
    return c.json({ error: 'Invalid id' }, 400);
  }

  const rows = await db<MerchantRow[]>`
    SELECT
      id, business_name, owner_name, business_type, tin,
      registration_type, registration_number,
      sst_registration_number, ttx_registration_number,
      msic_code, business_activity_description,
      phone, email,
      address_line1, address_line2, city, state_code, postcode, country_code,
      created_at, updated_at
    FROM merchants
    WHERE id = ${id}
  `;

  if (!rows.length) {
    return c.json({ error: 'Merchant not found' }, 404);
  }

  return c.json({ merchant: toApiMerchant(rows[0]) });
});
