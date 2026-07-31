-- =============================================================================
-- Rollback de 0096 — remove a tabela theme_lesson_notes.
-- Idempotente (IF EXISTS). Executar em ordem reversa ao apply.
-- =============================================================================

DROP TABLE IF EXISTS theme_lesson_notes;