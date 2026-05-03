-- 0033_user_settings_default_screen_cap.sql
-- Idempotent. Add default_screen_cap (1-24) to user_settings.
-- Default 10 mantem comportamento atual de novas sessoes.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS default_screen_cap INTEGER DEFAULT 10;
