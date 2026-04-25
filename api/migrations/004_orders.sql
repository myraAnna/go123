CREATE TABLE IF NOT EXISTS orders (
  id                 BIGSERIAL PRIMARY KEY,
  merchant_id        BIGINT NOT NULL REFERENCES merchants(id),
  subtotal_cents     INT NOT NULL,
  tax_cents          INT NOT NULL,
  total_cents        INT NOT NULL,
  payment_reference  TEXT NOT NULL UNIQUE,
  qr_payload         TEXT NOT NULL,
  paid_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT orders_subtotal_positive CHECK (subtotal_cents > 0),
  CONSTRAINT orders_tax_non_negative   CHECK (tax_cents >= 0),
  CONSTRAINT orders_total_positive     CHECK (total_cents > 0),
  CONSTRAINT orders_total_sum_check    CHECK (total_cents = subtotal_cents + tax_cents)
);

CREATE INDEX IF NOT EXISTS idx_orders_merchant_paid_at
  ON orders(merchant_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_merchant_created_at
  ON orders(merchant_id, created_at DESC);

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS order_items (
  id                                   BIGSERIAL PRIMARY KEY,
  merchant_id                          BIGINT NOT NULL REFERENCES merchants(id),
  order_id                             BIGINT NOT NULL REFERENCES orders(id),
  menu_item_id                         BIGINT NOT NULL REFERENCES menu_items(id),
  item_name_snapshot                   TEXT NOT NULL,
  qty                                  NUMERIC(12,5) NOT NULL,
  unit_price_cents                     INT NOT NULL,
  unit_code_snapshot                   TEXT REFERENCES ref_myinvois_unit_types(code),
  classification_code_snapshot         TEXT REFERENCES ref_myinvois_classification_codes(code),
  tax_code_snapshot                    TEXT REFERENCES ref_myinvois_tax_types(code),
  tax_rate_mode_snapshot               TEXT,
  tax_rate_bps_snapshot                INT,
  tax_per_unit_cents_snapshot          INT,
  tax_exemption_reason_snapshot        TEXT,
  compliance_review_status_snapshot    TEXT NOT NULL,
  created_at                           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT order_items_qty_positive CHECK (qty > 0),
  CONSTRAINT order_items_price_positive CHECK (unit_price_cents > 0),
  CONSTRAINT order_items_tax_rate_mode_check CHECK (
    tax_rate_mode_snapshot IS NULL OR tax_rate_mode_snapshot IN ('percentage','per_unit')
  ),
  CONSTRAINT order_items_tax_rate_bps_check CHECK (
    tax_rate_bps_snapshot IS NULL OR tax_rate_bps_snapshot >= 0
  ),
  CONSTRAINT order_items_tax_per_unit_positive CHECK (
    tax_per_unit_cents_snapshot IS NULL OR tax_per_unit_cents_snapshot > 0
  ),
  CONSTRAINT order_items_compliance_status_check CHECK (
    compliance_review_status_snapshot IN ('pending_review','reviewed')
  ),
  CONSTRAINT order_items_percentage_mode_check CHECK (
    tax_rate_mode_snapshot <> 'percentage' OR (tax_rate_bps_snapshot IS NOT NULL AND tax_per_unit_cents_snapshot IS NULL)
  ),
  CONSTRAINT order_items_per_unit_mode_check CHECK (
    tax_rate_mode_snapshot <> 'per_unit' OR (tax_per_unit_cents_snapshot IS NOT NULL AND tax_rate_bps_snapshot IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_order_items_merchant_order
  ON order_items(merchant_id, order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_menu_item
  ON order_items(menu_item_id);
