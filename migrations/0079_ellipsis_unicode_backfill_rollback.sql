-- Rollback Migration 0079. Reverter unicode ellipsis para 3 dots ASCII.

UPDATE library_lessons
SET transcription_preview = REGEXP_REPLACE(transcription_preview, '…$', '...')
WHERE transcription_preview LIKE '%…';
