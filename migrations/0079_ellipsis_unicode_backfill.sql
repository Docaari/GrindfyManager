-- Sprint Mini Player 3.1 / Wave A / L2 — Ellipsis unicode backfill.
-- Migration 0078 usou `'...'` (3 caracteres ASCII) ao truncar
-- transcription_preview. Substituir pelo character unicode U+2026 (`'…'`)
-- para preservar largura de coluna varchar(120) (3 chars → 1) e melhorar
-- rendering tipografico no UI.

UPDATE library_lessons
SET transcription_preview = REGEXP_REPLACE(transcription_preview, '\.\.\.$', '…')
WHERE transcription_preview LIKE '%...';

-- Note: a backfill em 0078 usou `LEFT(transcription_full, 80) || '...'`. Apos
-- esta migration, novos backfills devem usar `|| '…'` (atualizado em
-- transcriptionIngestor.ts — Sprint MP3.1 Wave A / H1).
