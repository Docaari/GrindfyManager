-- Sprint 1 — Tournament Selector schema additions
-- All statements are idempotent (IF NOT EXISTS) — safe to re-run.
-- Applied to local dev DB on 2026-04-24. Must be applied to production (Neon) before deploy.

-- 1) tournament_selector_logs (RF-07 telemetry)
CREATE TABLE IF NOT EXISTS tournament_selector_logs (
  id                         VARCHAR PRIMARY KEY NOT NULL,
  user_id                    VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  event_type                 VARCHAR NOT NULL,
  tournament_external_id     VARCHAR,
  score                      INTEGER,
  grade                      VARCHAR,
  confidence                 VARCHAR,
  metadata                   JSONB,
  created_at                 TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tsl_user_created  ON tournament_selector_logs (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tsl_event_created ON tournament_selector_logs (event_type, created_at);

-- 2) planned_tournaments.library_template_id (Q4 — Selector alreadyInGrid detection)
ALTER TABLE planned_tournaments
  ADD COLUMN IF NOT EXISTS library_template_id VARCHAR;

-- 3) user_settings bankroll fields (Q8 — reservados em Sprint 1 para Sprint 2 UI)
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS bankroll_amount DECIMAL;
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS bankroll_rule   VARCHAR DEFAULT '1pct';

-- 4) tournament_library day_of_week + currency (RF-04/RF-05 + CRITICAL #7)
ALTER TABLE tournament_library
  ADD COLUMN IF NOT EXISTS day_of_week INTEGER;
ALTER TABLE tournament_library
  ADD COLUMN IF NOT EXISTS currency    VARCHAR DEFAULT 'USD';
