-- =============================================================================
-- Sprint Estudos-Habito-1 — Migration 0054
-- Spec RF-2.1, RF-2.3: extender users com daily goal + freezes + last reset month.
-- ADR-128: race-safe via SELECT FOR UPDATE; lazy reset + cron 00:05 UTC.
-- =============================================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS daily_study_goal_minutes INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS study_streak_freezes_used_this_month INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_freeze_reset_month VARCHAR(7);

-- PostgreSQL nao tem ADD CONSTRAINT IF NOT EXISTS — usamos DO block guard.

DO $$
BEGIN
    -- CHECK enum: 0=desligado, 15/30/45/60/90/120 valores aceitos
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_daily_goal_enum'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_daily_goal_enum CHECK (
                daily_study_goal_minutes IN (0, 15, 30, 45, 60, 90, 120)
            );
    END IF;

    -- CHECK range freezes (0-2 por mes)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_freezes_range'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_freezes_range CHECK (
                study_streak_freezes_used_this_month >= 0 AND
                study_streak_freezes_used_this_month <= 2
            );
    END IF;

    -- CHECK formato YYYY-MM (ou NULL)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_freeze_reset_month_format'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_freeze_reset_month_format CHECK (
                last_freeze_reset_month IS NULL OR
                last_freeze_reset_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
            );
    END IF;
END $$;

-- =============================================================================
-- Verificacao
-- =============================================================================
-- Aditiva. Rows existentes ganham defaults seguros (goal=0=desligado, freezes=0).
-- O cron resetStudyFreezesMonthly + lazy reset em bumpStudyStreak (ADR-128) garantem
-- que last_freeze_reset_month se popule organicamente; nao requer back-fill.
