-- 0032_late_reg_alert_disable_existing.sql
-- Idempotent. Disable late-reg auto alerts em rows existentes que nunca foram
-- customizadas pelo usuario (i.e., `late_reg_alert_minutes = 10` AND `late_reg_alert_enabled = true`,
-- combinacao = old defaults). Migration 0031 mudou apenas DEFAULT do schema mas
-- manteve existing rows; founder feedback 2026-05-03: "ainda recebo alerta sem
-- ter configurado".
--
-- Preserva rows customizadas (usuario que escolheu minutos != 10 OU desligou
-- explicitly OU re-ligou apos 0031 deploy).

UPDATE user_settings
SET
  late_reg_alert_enabled = false,
  late_reg_alert_minutes = 1
WHERE
  late_reg_alert_enabled = true
  AND late_reg_alert_minutes = 10;
