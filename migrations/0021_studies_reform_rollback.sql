-- migrations/0021_studies_reform_rollback.sql
-- Reverts migration 0021 — Studies-Reform Sprint

DROP INDEX IF EXISTS idx_users_streak_active;

ALTER TABLE users
    DROP COLUMN IF EXISTS last_study_activity_at,
    DROP COLUMN IF EXISTS study_streak_days;

DROP TABLE IF EXISTS study_theme_spot_links CASCADE;
