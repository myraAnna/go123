CREATE TABLE IF NOT EXISTS export_jobs (
  id              BIGSERIAL PRIMARY KEY,
  merchant_id     BIGINT NOT NULL REFERENCES merchants(id),
  job_type        TEXT NOT NULL DEFAULT 'lhdn-export-pack',
  period_from     DATE NOT NULL,
  period_to       DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'requested',
  error_message   TEXT,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT export_jobs_type_check CHECK (job_type = 'lhdn-export-pack'),
  CONSTRAINT export_jobs_status_check CHECK (status IN ('requested','generated','failed')),
  CONSTRAINT export_jobs_period_check CHECK (period_from <= period_to)
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_merchant_created_at
  ON export_jobs(merchant_id, created_at DESC);

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS generated_documents (
  id                BIGSERIAL PRIMARY KEY,
  export_job_id     BIGINT NOT NULL REFERENCES export_jobs(id),
  merchant_id       BIGINT NOT NULL REFERENCES merchants(id),
  document_type     TEXT NOT NULL,
  status            TEXT NOT NULL,
  file_name         TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  storage_provider  TEXT NOT NULL DEFAULT 's3',
  storage_key       TEXT,
  payload_json      JSONB,
  generated_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT generated_documents_type_check CHECK (
    document_type IN ('profit-loss','borang-b-summary','cp500-summary','consolidated-einvoice')
  ),
  CONSTRAINT generated_documents_status_check CHECK (status IN ('generated','failed')),
  CONSTRAINT generated_documents_storage_check CHECK (storage_provider = 's3'),
  CONSTRAINT generated_documents_key_when_generated CHECK (
    status <> 'generated' OR storage_key IS NOT NULL
  ),

  UNIQUE (export_job_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_generated_documents_merchant_generated_at
  ON generated_documents(merchant_id, generated_at DESC);
