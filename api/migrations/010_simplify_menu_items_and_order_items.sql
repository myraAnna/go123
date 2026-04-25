-- Strip MyInvois tax/compliance columns from menu_items
ALTER TABLE menu_items
  DROP COLUMN IF EXISTS unit_code,
  DROP COLUMN IF EXISTS classification_code,
  DROP COLUMN IF EXISTS tax_code,
  DROP COLUMN IF EXISTS tax_rate_mode,
  DROP COLUMN IF EXISTS tax_rate_bps,
  DROP COLUMN IF EXISTS tax_per_unit_cents,
  DROP COLUMN IF EXISTS tax_exemption_reason,
  DROP COLUMN IF EXISTS compliance_review_status,
  DROP COLUMN IF EXISTS compliance_reviewed_at,
  DROP COLUMN IF EXISTS color,
  DROP COLUMN IF EXISTS display_order,
  DROP COLUMN IF EXISTS is_active;

DROP INDEX IF EXISTS idx_menu_items_merchant_active_order;
CREATE INDEX IF NOT EXISTS idx_menu_items_merchant ON menu_items(merchant_id);

-- Strip snapshot columns from order_items and rename name column
ALTER TABLE order_items
  DROP COLUMN IF EXISTS unit_code_snapshot,
  DROP COLUMN IF EXISTS classification_code_snapshot,
  DROP COLUMN IF EXISTS tax_code_snapshot,
  DROP COLUMN IF EXISTS tax_rate_mode_snapshot,
  DROP COLUMN IF EXISTS tax_rate_bps_snapshot,
  DROP COLUMN IF EXISTS tax_per_unit_cents_snapshot,
  DROP COLUMN IF EXISTS tax_exemption_reason_snapshot,
  DROP COLUMN IF EXISTS compliance_review_status_snapshot;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_items' AND column_name = 'item_name_snapshot'
  ) THEN
    ALTER TABLE order_items RENAME COLUMN item_name_snapshot TO name_snapshot;
  END IF;
END $$;

ALTER TABLE order_items ALTER COLUMN qty TYPE INT USING qty::INT;
