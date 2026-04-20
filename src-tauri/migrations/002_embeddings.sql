-- M2 — add embeddings column to skills for semantic recall.
-- Stored as JSONB array of floats (no pgvector dependency). 384 dims
-- when populated; NULL when the write pre-dates fastembed wiring.

ALTER TABLE skills ADD COLUMN IF NOT EXISTS embedding JSONB;
CREATE INDEX IF NOT EXISTS idx_skills_embedding_not_null ON skills((embedding IS NOT NULL));
