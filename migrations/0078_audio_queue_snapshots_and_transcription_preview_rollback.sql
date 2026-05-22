-- Sprint Mini Player 3 — Rollback migration 0078.

ALTER TABLE library_lessons DROP COLUMN IF EXISTS transcription_preview;
DROP TABLE IF EXISTS audio_queue_snapshots;
