-- Sprint Spot-Anki-Reentry-3 — Migration 0058
-- Spec: Docs/specs/spot-anki-reentry-3.md
-- ADRs : 136 (table+SM-2), 137 (cap diario), 138 (relax FK), 139 (initial interval), 140 (coach extension)
-- Diagrama: Docs/architecture/data-model-spot-anki-reentry-3.mermaid
--
-- Risco R9 spec: consolidar TUDO em 1 migration (ALTER + CREATE) para reduzir surface de erro.
-- Defaults safe (todos NULLABLE em starred_hands, defaults safe em spot_reentry_cards).

-- =============================================================================
-- PARTE 1 — Extensao starred_hands (RF-1 + ADR-138 relax FKs)
-- =============================================================================

-- 1.1 Adicionar 4 colunas semanticas (todas nullable, sem back-fill)
ALTER TABLE starred_hands
  ADD COLUMN IF NOT EXISTS insight           TEXT,
  ADD COLUMN IF NOT EXISTS decision_correct  BOOLEAN,
  ADD COLUMN IF NOT EXISTS confidence_level  INTEGER,
  ADD COLUMN IF NOT EXISTS tags              JSONB;

-- 1.2 CHECK constraint confidence_level [1, 5]
DO $$ BEGIN
  ALTER TABLE starred_hands
    ADD CONSTRAINT chk_starred_confidence_range
    CHECK (confidence_level IS NULL OR (confidence_level >= 1 AND confidence_level <= 5));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 1.3 Index parcial para query "spots com insight" (filtros ?withInsight=true)
CREATE INDEX IF NOT EXISTS idx_starred_user_has_insight
  ON starred_hands (user_id, created_at DESC)
  WHERE insight IS NOT NULL;

-- 1.4 ADR-138 — Relax NOT NULL em session_id e session_tournament_id
--     (drill spots orfaos do cron precisam session_id=NULL)
ALTER TABLE starred_hands
  ALTER COLUMN session_id           DROP NOT NULL,
  ALTER COLUMN session_tournament_id DROP NOT NULL;

-- 1.5 ADR-138 — Estender enum captured_during para suportar drill_gto
--     (drop existing CHECK + recreate com novo valor)
DO $$ BEGIN
  ALTER TABLE starred_hands
    DROP CONSTRAINT chk_starred_captured_during;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE starred_hands
  ADD CONSTRAINT chk_starred_captured_during
  CHECK (captured_during IN ('grind-live', 'cooldown', 'drill_gto'));

-- =============================================================================
-- PARTE 2 — Tabela nova spot_reentry_cards (RF-2 + ADR-136)
-- =============================================================================

CREATE TABLE IF NOT EXISTS spot_reentry_cards (
  id              VARCHAR(21) PRIMARY KEY NOT NULL,
  user_id         VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  spot_id         VARCHAR(21) NOT NULL REFERENCES starred_hands(id)        ON DELETE CASCADE,
  source          VARCHAR(32) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- SRS state
  next_review_at  TIMESTAMPTZ NOT NULL,
  interval_days   NUMERIC(8,2) NOT NULL,
  ease_factor     NUMERIC(3,2) NOT NULL DEFAULT 2.5,

  -- tracking
  review_count    INTEGER NOT NULL DEFAULT 0,
  correct_count   INTEGER NOT NULL DEFAULT 0,
  last_review_at  TIMESTAMPTZ,
  last_grade      VARCHAR(8),

  -- lifecycle
  archived_at     TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- CHECK constraints
  CONSTRAINT chk_srs_source
    CHECK (source IN ('manual_add', 'drill_gto_difficult_spot', 'coach_session_insight')),
  CONSTRAINT chk_srs_grade
    CHECK (last_grade IS NULL OR last_grade IN ('again', 'hard', 'good', 'easy')),
  CONSTRAINT chk_srs_interval
    CHECK (interval_days > 0 AND interval_days <= 120),
  CONSTRAINT chk_srs_ease
    CHECK (ease_factor >= 1.3 AND ease_factor <= 3.0),
  CONSTRAINT chk_srs_review_count
    CHECK (review_count >= 0),
  CONSTRAINT chk_srs_correct_count
    CHECK (correct_count >= 0 AND correct_count <= review_count)
);

-- 2.1 Index para query queue (cards pendentes hoje)
--     WHERE archived_at IS NULL AND next_review_at <= NOW()
CREATE INDEX IF NOT EXISTS idx_srs_user_next_review
  ON spot_reentry_cards (user_id, next_review_at)
  WHERE archived_at IS NULL;

-- 2.2 UNIQUE parcial — 1 card ativo por (user, spot). Idempotency POST /reentry.
CREATE UNIQUE INDEX IF NOT EXISTS uq_srs_user_spot_active
  ON spot_reentry_cards (user_id, spot_id)
  WHERE archived_at IS NULL;

-- 2.3 Index para stats "cards revisados ultimos 7 dias"
CREATE INDEX IF NOT EXISTS idx_srs_user_last_review
  ON spot_reentry_cards (user_id, last_review_at)
  WHERE last_review_at IS NOT NULL;

-- =============================================================================
-- NOTA: coach_session_insights.insights_jsonb extension (ADR-140)
-- Sem migration SQL — campos opcionais em jsonb shape, validacao apenas via Zod.
-- =============================================================================

-- =============================================================================
-- NOTA: users.home_layout_settings extension (RF-1.3 + RF-5.4)
-- Sem migration SQL — coluna ja e jsonb (ADR-119), shape extension via Zod.
-- Novos campos opcionais:
--   spotInsightDialogAutoOpen: boolean (default true)
--   showSrsStatsCard: boolean (default true)
-- =============================================================================

-- Verify migration applied (smoke):
-- SELECT 'spot_reentry_cards' AS table_name, COUNT(*) AS rows FROM spot_reentry_cards;
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_name = 'starred_hands' AND column_name IN ('session_id','session_tournament_id','insight','decision_correct','confidence_level','tags');
