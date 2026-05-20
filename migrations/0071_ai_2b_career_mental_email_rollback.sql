-- Rollback Migration 0071: AI-2B — drop 3 tables + reverse ALTER em user_coach_preferences.
--
-- ATENÇÃO: rollback destrói dados de career_goals, mental_hand_history e email_log.
-- Use apenas em dev/staging ou rollback emergencial documentado.

BEGIN;

-- Reverse ALTER user_coach_preferences (5 cols)
ALTER TABLE user_coach_preferences
    DROP COLUMN IF EXISTS disclaimer_accepted_at,
    DROP COLUMN IF EXISTS email_quarterly_enabled,
    DROP COLUMN IF EXISTS email_monthly_enabled,
    DROP COLUMN IF EXISTS email_weekly_enabled,
    DROP COLUMN IF EXISTS report_quarterly_enabled;

-- Drop email_log (depende de reports.id via FK ON DELETE SET NULL — safe drop)
DROP INDEX IF EXISTS idx_email_log_pending;
DROP INDEX IF EXISTS idx_email_log_user_kind_created;
DROP INDEX IF EXISTS uq_email_log_report_kind;
DROP TABLE IF EXISTS email_log;

-- Drop mental_hand_history (FK grind_sessions.id ON DELETE SET NULL — safe)
DROP INDEX IF EXISTS idx_mental_hh_user_emotion;
DROP INDEX IF EXISTS idx_mental_hh_user_occurred;
DROP TABLE IF EXISTS mental_hand_history;

-- Drop career_goals
DROP INDEX IF EXISTS idx_career_goals_user_deadline;
DROP INDEX IF EXISTS idx_career_goals_user_status;
DROP TABLE IF EXISTS career_goals;

COMMIT;
