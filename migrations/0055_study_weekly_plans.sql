-- =============================================================================
-- Sprint Estudos-Coach-Biblio-2 — Migration 0055
-- ADR-132: Schema study_weekly_plans com plan_jsonb (vs tabela child)
-- ADR-107: Cron pattern reuso (segunda 9h UTC para gerar plano semanal)
-- ADR-134: Coach tools coachStudyPlan persiste output via UPSERT idempotente
-- =============================================================================

-- =============================================================================
-- 1. study_weekly_plans — tabela nova
-- =============================================================================

CREATE TABLE IF NOT EXISTS study_weekly_plans (
    id                    VARCHAR(21) PRIMARY KEY,
    user_id               VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    week_start_date       DATE NOT NULL,                          -- segunda da semana UTC
    plan_jsonb            JSONB NOT NULL,                         -- StudyWeeklyPlan shape (5 dias x 3-4 atividades)
    completed_items_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,     -- array de itemId
    source                VARCHAR(16) NOT NULL,                   -- 'coach_auto' | 'coach_manual'
    daily_target_minutes  INTEGER NOT NULL,                       -- clamp 5-240
    cost_tokens_used      INTEGER,                                -- tracking custo Coach (nullable)
    generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    regenerated_at        TIMESTAMPTZ,                            -- nullable, bumpa em UPDATE
    regenerated_count     INTEGER NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- CHECK constraints (ADR-132 §2.1)
    CONSTRAINT swp_source_enum
        CHECK (source IN ('coach_auto', 'coach_manual')),
    CONSTRAINT swp_target_range
        CHECK (daily_target_minutes >= 5 AND daily_target_minutes <= 240),
    CONSTRAINT swp_regenerated_count_nonnegative
        CHECK (regenerated_count >= 0)
);

-- Indices (ADR-132 §2.1)

-- 1 plano por user por semana — idempotency cron + manual (UPSERT base)
CREATE UNIQUE INDEX IF NOT EXISTS uq_swp_user_week
    ON study_weekly_plans (user_id, week_start_date);

-- Listagem historica de planos por user
CREATE INDEX IF NOT EXISTS idx_swp_user_generated
    ON study_weekly_plans (user_id, generated_at DESC);

-- Trigger updated_at (reusa funcao set_updated_at criada em 0052)
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

DROP TRIGGER IF EXISTS trg_swp_updated_at ON study_weekly_plans;
CREATE TRIGGER trg_swp_updated_at
    BEFORE UPDATE ON study_weekly_plans
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Comments (documentacao inline para DB consumers)
-- =============================================================================

COMMENT ON TABLE study_weekly_plans IS
    'Plano semanal de estudo gerado pelo Coach (cron segunda 9h UTC ou manual). 1 row por (user, week_start_date). plan_jsonb embarca 5 dias x 3-4 atividades estruturadas. completed_items_jsonb array de itemId estaveis dentro do plano. Ref ADR-132.';

COMMENT ON COLUMN study_weekly_plans.plan_jsonb IS
    'Shape: { days: [{ dayLabel, date, activities: [{itemId, type, title, description, estimatedMinutes, ctaTarget, themeId, lessonId, handIds, reasoning}] }] }. Validado por Zod (StudyWeeklyPlanSchema) antes de INSERT.';

COMMENT ON COLUMN study_weekly_plans.completed_items_jsonb IS
    'Array de itemId completados pelo user. Toggle via PATCH /items/:itemId/toggle (read-modify-write FOR UPDATE).';

COMMENT ON COLUMN study_weekly_plans.source IS
    'coach_auto = gerado por cron segunda 9h UTC. coach_manual = gerado por POST /regenerate.';

COMMENT ON COLUMN study_weekly_plans.daily_target_minutes IS
    'clamp(avg duration ultima semana * 0.95, 15, 120). Default 30 se sem historico. Range maximo permitido 5-240 (CHECK constraint).';

-- =============================================================================
-- Verificacao final (idempotente)
-- =============================================================================
-- A migration eh segura para rodar multiple vezes (IF NOT EXISTS em todos os DDLs).
-- Reverter: DROP TABLE study_weekly_plans CASCADE.
