-- Rollback Sprint Mini Player 2 (RF-NEW.2).

ALTER TABLE user_coach_preferences DROP CONSTRAINT IF EXISTS chk_audio_sleep_timer_minutes;
ALTER TABLE user_coach_preferences DROP COLUMN IF EXISTS audio_sleep_timer_minutes;
