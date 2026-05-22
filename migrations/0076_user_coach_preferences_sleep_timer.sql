-- Sprint Mini Player 2 (RF-NEW.2) — adiciona coluna audio_sleep_timer_minutes em user_coach_preferences.
-- ADR: spec sprint-mini-player-2.md secao 7.1.

ALTER TABLE user_coach_preferences
  ADD COLUMN IF NOT EXISTS audio_sleep_timer_minutes integer;

-- CHECK constraint enum [15, 30, 45, 60, 90, NULL] — NULL = nao auto-ativa.
ALTER TABLE user_coach_preferences
  ADD CONSTRAINT chk_audio_sleep_timer_minutes
  CHECK (audio_sleep_timer_minutes IS NULL OR audio_sleep_timer_minutes IN (15, 30, 45, 60, 90));

COMMENT ON COLUMN user_coach_preferences.audio_sleep_timer_minutes IS
  'Sleep timer preset chosen by user. NULL = not auto-active. Sprint Mini Player 2.';
