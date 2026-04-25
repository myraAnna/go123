CREATE TABLE IF NOT EXISTS chat_sessions (
  id            BIGSERIAL PRIMARY KEY,
  merchant_id   BIGINT NOT NULL REFERENCES merchants(id),
  ai_session_id TEXT NOT NULL,
  session_date  DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, session_date)
);
