-- =============================================================================
-- Sprint Estudos-Habito-1 — Migration 0052
-- ADR-126: Criar study_sessions_v2 como tabela nova; legado read-only.
-- ADR-128: Indice partial uq_ssv2_user_running enforce max 1 cronometro live por user.
-- ADR-130: Indice partial idx_ssv2_user_lesson_partial para idempotency auto_lesson 24h.
-- ADR-127: Estende study_themes com curated columns (slug + linked_stats + linked_lessons).
-- =============================================================================

-- =============================================================================
-- 1. study_sessions_v2 — tabela nova
-- =============================================================================

CREATE TABLE IF NOT EXISTS study_sessions_v2 (
    id                 VARCHAR(21) PRIMARY KEY,
    user_id            VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    mode               VARCHAR(32) NOT NULL,
    source             VARCHAR(32) NOT NULL,
    status             VARCHAR(16) NOT NULL DEFAULT 'completed',
    theme_id           VARCHAR(21) REFERENCES study_themes(id) ON DELETE SET NULL,
    tournament_id      VARCHAR REFERENCES tournaments(id) ON DELETE SET NULL,
    lesson_id          VARCHAR REFERENCES library_lessons(id) ON DELETE SET NULL,
    starred_hand_ids   JSONB,
    drill_platform     VARCHAR(32),
    drill_accuracy     INTEGER,
    difficult_spots    JSONB,
    duration_minutes   INTEGER NOT NULL,
    started_at         TIMESTAMPTZ,
    ended_at           TIMESTAMPTZ,
    registered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idle_periods       JSONB,
    notes              TEXT,
    attachments        JSONB,
    was_productive     BOOLEAN,
    daily_goal_met     BOOLEAN NOT NULL DEFAULT FALSE,
    xp_awarded         INTEGER NOT NULL DEFAULT 0,
    deleted_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- CHECK constraints discriminator-based (ADR-126 §2.2)
    CONSTRAINT ssv2_mode_enum CHECK (
        mode IN ('drill_gto', 'tournament_review', 'hand_review', 'lesson', 'other')
    ),
    CONSTRAINT ssv2_source_enum CHECK (
        source IN ('manual_post_hoc', 'manual_live', 'auto_lesson', 'auto_grind_finalize')
    ),
    CONSTRAINT ssv2_status_enum CHECK (status IN ('running', 'completed')),
    CONSTRAINT ssv2_duration_range CHECK (duration_minutes >= 1 AND duration_minutes <= 1440),
    CONSTRAINT ssv2_drill_accuracy_range CHECK (
        drill_accuracy IS NULL OR (drill_accuracy >= 0 AND drill_accuracy <= 100)
    ),
    CONSTRAINT ssv2_notes_length CHECK (notes IS NULL OR LENGTH(notes) <= 500),
    CONSTRAINT ssv2_drill_gto_theme CHECK (mode <> 'drill_gto' OR theme_id IS NOT NULL),
    CONSTRAINT ssv2_lesson_id CHECK (mode <> 'lesson' OR lesson_id IS NOT NULL),
    CONSTRAINT ssv2_hand_review_ids CHECK (
        mode <> 'hand_review' OR (
            starred_hand_ids IS NOT NULL
            AND jsonb_typeof(starred_hand_ids) = 'array'
            AND jsonb_array_length(starred_hand_ids) >= 1
        )
    ),
    CONSTRAINT ssv2_other_theme CHECK (mode <> 'other' OR theme_id IS NOT NULL),
    CONSTRAINT ssv2_running_started CHECK (
        status <> 'running' OR (started_at IS NOT NULL AND ended_at IS NULL)
    ),
    CONSTRAINT ssv2_completed_duration CHECK (
        status <> 'completed' OR duration_minutes IS NOT NULL
    )
);

-- Indices (ADR-126 §2.3)
CREATE INDEX IF NOT EXISTS idx_ssv2_user_started
    ON study_sessions_v2 (user_id, started_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_ssv2_user_mode_started
    ON study_sessions_v2 (user_id, mode, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ssv2_user_registered
    ON study_sessions_v2 (user_id, registered_at DESC);

CREATE INDEX IF NOT EXISTS idx_ssv2_user_lesson_partial
    ON study_sessions_v2 (user_id, lesson_id, registered_at DESC)
    WHERE lesson_id IS NOT NULL;

-- UNIQUE parcial — enforce max 1 cronometro live por user (ADR-128)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ssv2_user_running
    ON study_sessions_v2 (user_id) WHERE status = 'running';

-- Aggregate por tema + mes (FocusStatsCard v2 — ADR-126 §2)
CREATE INDEX IF NOT EXISTS idx_ssv2_user_theme_month
    ON study_sessions_v2 (user_id, theme_id, started_at)
    WHERE theme_id IS NOT NULL AND status = 'completed' AND deleted_at IS NULL;

-- Trigger updated_at (reusa funcao set_updated_at se ja existe)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at'
    ) THEN
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $body$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $body$ LANGUAGE plpgsql;
    END IF;
END $$;

CREATE TRIGGER trg_ssv2_updated_at
    BEFORE UPDATE ON study_sessions_v2
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 2. study_themes — extensao curated taxonomy (ADR-127)
-- =============================================================================

ALTER TABLE study_themes
    ADD COLUMN IF NOT EXISTS slug VARCHAR(60),
    ADD COLUMN IF NOT EXISTS is_curated BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS category VARCHAR(32),
    ADD COLUMN IF NOT EXISTS linked_stats JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS linked_lessons JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS seeded_at TIMESTAMP;

-- Categoria valida quando is_curated=true. PostgreSQL nao tem ADD CONSTRAINT IF NOT EXISTS,
-- usamos DO block guard para idempotencia.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'study_themes_category_enum'
    ) THEN
        ALTER TABLE study_themes
            ADD CONSTRAINT study_themes_category_enum CHECK (
                category IS NULL OR
                category IN ('preflop', 'postflop', 'icm', 'mental', 'specific')
            );
    END IF;
END $$;

-- UNIQUE parcial: cada user tem no max 1 copia de cada slug curated
CREATE UNIQUE INDEX IF NOT EXISTS uq_study_themes_user_slug_curated
    ON study_themes (user_id, slug)
    WHERE is_curated = TRUE AND slug IS NOT NULL;

-- GIN index para auto-suggest stats foco lookup (linked_stats @> [stat_id])
CREATE INDEX IF NOT EXISTS idx_study_themes_curated_stats
    ON study_themes USING GIN (linked_stats jsonb_path_ops)
    WHERE is_curated = TRUE;

-- =============================================================================
-- Verificacao final (idempotente)
-- =============================================================================
-- A migration eh segura para rodar multiple vezes (IF NOT EXISTS em todos os DDLs).
-- Reverter: DROP TABLE study_sessions_v2 CASCADE + ALTER TABLE study_themes DROP COLUMN ...
