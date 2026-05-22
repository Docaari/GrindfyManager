-- Migration 0080 — transcription_previews JSONB multi-lang (W-A4 / ADR-201).
-- Sprint Mini Player 3.2. Aditiva (NAO dropa varchar legacy).
--
-- Cria nova coluna JSONB que armazena previews por language code,
-- e.g.: { "pt": "...", "en": "..." }. A coluna varchar antiga
-- `transcription_preview` continua existindo como fallback de back-compat
-- (drop deferred para sprint futuro).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + backfill condicional.

-- Adicionar coluna JSONB nova.
ALTER TABLE library_lessons
  ADD COLUMN IF NOT EXISTS transcription_previews JSONB;

-- Backfill: copia varchar legacy -> { "pt": <varchar> } quando varchar
-- nao for NULL E coluna JSONB ainda estiver NULL (idempotente: rodar 2x = no-op).
UPDATE library_lessons
   SET transcription_previews = jsonb_build_object('pt', transcription_preview)
 WHERE transcription_preview IS NOT NULL
   AND transcription_previews IS NULL;

-- Index GIN para queries do tipo `WHERE transcription_previews ? 'pt'`
-- ou `WHERE transcription_previews @> '{"pt": "..."}'`.
CREATE INDEX IF NOT EXISTS idx_library_lessons_transcription_previews_gin ON library_lessons USING GIN (transcription_previews);
