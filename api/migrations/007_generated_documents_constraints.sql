ALTER TABLE generated_documents
  ADD CONSTRAINT generated_documents_key_when_generated CHECK (
    status <> 'generated' OR storage_key IS NOT NULL
  );
