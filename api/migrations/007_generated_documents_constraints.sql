DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_documents_key_when_generated'
  ) THEN
    ALTER TABLE generated_documents
      ADD CONSTRAINT generated_documents_key_when_generated CHECK (
        status <> 'generated' OR storage_key IS NOT NULL
      );
  END IF;
END $$;
