CREATE TABLE IF NOT EXISTS expenses (
  id               BIGSERIAL PRIMARY KEY,
  merchant_id      BIGINT NOT NULL REFERENCES merchants(id),
  expense_date     DATE NOT NULL,
  amount_cents     INT NOT NULL,
  description      TEXT NOT NULL,
  source           TEXT NOT NULL,
  receipt_s3_key   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT expenses_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT expenses_source_check CHECK (source IN ('manual','receipt-scan'))
);

CREATE INDEX IF NOT EXISTS idx_expenses_merchant_date
  ON expenses(merchant_id, expense_date DESC);
