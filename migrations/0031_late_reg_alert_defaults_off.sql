-- 0031_late_reg_alert_defaults_off.sql
-- Idempotent. Late-reg auto-alert default off; default threshold 10min -> 1min.
-- Existing user_settings rows preserved; new users start with alerts off.

ALTER TABLE user_settings
  ALTER COLUMN late_reg_alert_enabled SET DEFAULT false;

ALTER TABLE user_settings
  ALTER COLUMN late_reg_alert_minutes SET DEFAULT 1;
