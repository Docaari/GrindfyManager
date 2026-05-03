-- =============================================================================
-- Sprint Biblioteca-2 / RF-08 + ADR-095
-- Adiciona coluna learning_objectives JSONB em library_lessons.
-- Default '[]'::jsonb cobre back-fill automatico para rows existentes.
-- =============================================================================

ALTER TABLE library_lessons
  ADD COLUMN IF NOT EXISTS learning_objectives JSONB NOT NULL DEFAULT '[]'::jsonb;

-- (Out of scope MVP) Optional GIN index para futura busca por objective:
-- CREATE INDEX idx_library_lessons_learning_objectives
--   ON library_lessons USING gin(learning_objectives);
