-- Rollback Migration 0080 — transcription_previews JSONB (W-A4).
-- Idempotente. NAO dropa coluna varchar legacy `transcription_preview`.

DROP INDEX IF EXISTS idx_library_lessons_transcription_previews_gin;

ALTER TABLE library_lessons
  DROP COLUMN IF EXISTS transcription_previews;
