CREATE TABLE IF NOT EXISTS menu_items (
  id                        BIGSERIAL PRIMARY KEY,
  merchant_id               BIGINT NOT NULL REFERENCES merchants(id),
  name                      TEXT NOT NULL,
  price_cents               INT NOT NULL,
  category                  TEXT NOT NULL,
  unit_code                 TEXT REFERENCES ref_myinvois_unit_types(code),
  classification_code       TEXT REFERENCES ref_myinvois_classification_codes(code),
  tax_code                  TEXT REFERENCES ref_myinvois_tax_types(code),
  tax_rate_mode             TEXT,
  tax_rate_bps              INT,
  tax_per_unit_cents        INT,
  tax_exemption_reason      TEXT,
  compliance_review_status  TEXT NOT NULL DEFAULT 'pending_review',
  compliance_reviewed_at    TIMESTAMPTZ,
  color                     TEXT NOT NULL,
  display_order             INT NOT NULL DEFAULT 0,
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT menu_items_price_positive CHECK (price_cents > 0),
  CONSTRAINT menu_items_category_check CHECK (
    category IN ('main','side','drink','dessert','other')
  ),
  CONSTRAINT menu_items_compliance_status_check CHECK (
    compliance_review_status IN ('pending_review','reviewed')
  ),
  CONSTRAINT menu_items_tax_rate_mode_check CHECK (
    tax_rate_mode IS NULL OR tax_rate_mode IN ('percentage','per_unit')
  ),
  CONSTRAINT menu_items_tax_rate_bps_check CHECK (
    tax_rate_bps IS NULL OR tax_rate_bps >= 0
  ),
  CONSTRAINT menu_items_tax_per_unit_positive CHECK (
    tax_per_unit_cents IS NULL OR tax_per_unit_cents > 0
  ),
  -- percentage mode requires bps, forbids per_unit
  CONSTRAINT menu_items_percentage_mode_check CHECK (
    tax_rate_mode <> 'percentage' OR (tax_rate_bps IS NOT NULL AND tax_per_unit_cents IS NULL)
  ),
  -- per_unit mode requires per_unit_cents, forbids bps
  CONSTRAINT menu_items_per_unit_mode_check CHECK (
    tax_rate_mode <> 'per_unit' OR (tax_per_unit_cents IS NOT NULL AND tax_rate_bps IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_menu_items_merchant_active_order
  ON menu_items(merchant_id, is_active, display_order);
