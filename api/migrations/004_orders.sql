CREATE TABLE IF NOT EXISTS orders (
  id          BIGSERIAL PRIMARY KEY,
  merchant_id BIGINT NOT NULL REFERENCES merchants(id),
  total_cents INT NOT NULL,
  qr_payload  TEXT NOT NULL,
  paid_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT orders_total_positive CHECK (total_cents > 0)
);

CREATE INDEX IF NOT EXISTS idx_orders_merchant_paid_at
  ON orders(merchant_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_merchant_created_at
  ON orders(merchant_id, created_at DESC);

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS order_items (
  id               BIGSERIAL PRIMARY KEY,
  merchant_id      BIGINT NOT NULL REFERENCES merchants(id),
  order_id         BIGINT NOT NULL REFERENCES orders(id),
  menu_item_id     BIGINT NOT NULL REFERENCES menu_items(id),
  name_snapshot    TEXT NOT NULL,
  qty              INT NOT NULL,
  unit_price_cents INT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT order_items_qty_positive   CHECK (qty > 0),
  CONSTRAINT order_items_price_positive CHECK (unit_price_cents > 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items(order_id);
