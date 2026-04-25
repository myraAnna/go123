CREATE TABLE IF NOT EXISTS menu_items (
  id          BIGSERIAL PRIMARY KEY,
  merchant_id BIGINT NOT NULL REFERENCES merchants(id),
  name        TEXT NOT NULL,
  price_cents INT NOT NULL,
  category    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT menu_items_price_positive CHECK (price_cents > 0),
  CONSTRAINT menu_items_category_check CHECK (
    category IN ('main','side','drink','dessert','other')
  )
);

CREATE INDEX IF NOT EXISTS idx_menu_items_merchant
  ON menu_items(merchant_id);
