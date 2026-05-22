-- Sprint Mini Player 3 (ADR-193 + RF-04.2) — Migration 0078.
-- Cria audio_queue_snapshots (queue persistence server-side opcional) +
-- adiciona library_lessons.transcription_preview (varchar 120) + backfill.

-- =============================================================================
-- audio_queue_snapshots (RF-05.6 / ADR-193)
-- =============================================================================
CREATE TABLE IF NOT EXISTS audio_queue_snapshots (
  user_id varchar PRIMARY KEY REFERENCES users(user_platform_id) ON DELETE CASCADE,
  queue_jsonb jsonb NOT NULL DEFAULT '[]'::jsonb,
  repeat_mode varchar(8) NOT NULL DEFAULT 'off' CHECK (repeat_mode IN ('off', 'all', 'one')),
  shuffle_enabled boolean NOT NULL DEFAULT false,
  shuffled_order jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamp DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE audio_queue_snapshots IS
  'Sprint Mini Player 3 (ADR-193). Queue persistence server-side opcional. Local primario, server best-effort.';

-- =============================================================================
-- library_lessons.transcription_preview (RF-04.2)
-- =============================================================================
ALTER TABLE library_lessons
  ADD COLUMN IF NOT EXISTS transcription_preview varchar(120);

COMMENT ON COLUMN library_lessons.transcription_preview IS
  'Sprint Mini Player 3 (RF-04.2). Primeiros 80 chars do transcription_full + ellipsis (NULL se ausente). Pre-computado em ingestion.';

-- Backfill best-effort: a coluna fonte (transcription_full) pode ou nao existir
-- em todas as bases. O bloco DO abaixo so atualiza se a coluna existir.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'library_lessons'
      AND column_name = 'transcription_full'
  ) THEN
    EXECUTE $sql$
      UPDATE library_lessons
      SET transcription_preview = LEFT(transcription_full, 80) || '...'
      WHERE transcription_full IS NOT NULL
        AND transcription_preview IS NULL
        AND LENGTH(transcription_full) > 80;
    $sql$;
    EXECUTE $sql$
      UPDATE library_lessons
      SET transcription_preview = transcription_full
      WHERE transcription_full IS NOT NULL
        AND transcription_preview IS NULL
        AND LENGTH(transcription_full) <= 80;
    $sql$;
  END IF;
END $$;
