ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_total_sum_check,
  DROP CONSTRAINT IF EXISTS orders_subtotal_positive,
  DROP CONSTRAINT IF EXISTS orders_tax_non_negative,
  DROP CONSTRAINT IF EXISTS orders_payment_reference_key,
  DROP COLUMN IF EXISTS subtotal_cents,
  DROP COLUMN IF EXISTS tax_cents,
  DROP COLUMN IF EXISTS payment_reference;
