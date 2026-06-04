-- Rollback 0094_goal_daily_logs (ADR-241).
DROP INDEX IF EXISTS idx_goal_daily_logs_user_date;
DROP TABLE IF EXISTS goal_daily_logs;
ALTER TABLE goals DROP COLUMN IF EXISTS start_date;
ALTER TABLE goals DROP COLUMN IF EXISTS deadline;
