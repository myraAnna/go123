CREATE TABLE IF NOT EXISTS merchant_menu_uploads (
  id          BIGSERIAL PRIMARY KEY,
  merchant_id BIGINT NOT NULL REFERENCES merchants(id),
  s3_key      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_menu_uploads_merchant
  ON merchant_menu_uploads(merchant_id);
