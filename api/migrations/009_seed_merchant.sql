INSERT INTO merchants (
  id, business_name, owner_name, business_type,
  tin, registration_type, registration_number,
  msic_code, business_activity_description,
  phone, address_line1, city, state_code, postcode
)
OVERRIDING SYSTEM VALUE
VALUES (
  1, 'Warung Demo', 'Pemilik Demo', 'warung',
  '000000000000', 'NRIC', '000000000000',
  '56106', 'Food stalls/hawkers',
  '0123456789', '1 Jalan Demo', 'Kuala Lumpur', '14', '50000'
)
ON CONFLICT (id) DO NOTHING;

-- Keep sequence ahead of the seeded id
SELECT setval('merchants_id_seq', GREATEST((SELECT MAX(id) FROM merchants), 1));
