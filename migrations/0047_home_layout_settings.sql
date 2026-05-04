-- Migration 0047 — Sprint home-reform-5 item 11
-- Adiciona JSONB home_layout_settings na tabela users.
-- Shape: { visibility: { headerStrip, coach, immediateAction, gradeToday,
--                        sessionsRegistered, dashboard, performance, studies,
--                        news }, performanceFromGrind }
-- Default: aplicado em runtime (server/services/homeSettings.ts) — mantemos
-- coluna NULLABLE para evitar back-fill caro; route /api/home/settings faz
-- merge com defaults antes de devolver pro client.
-- Idempotente.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS home_layout_settings jsonb;

COMMENT ON COLUMN users.home_layout_settings IS
  'Home customization (Sprint home-reform-5 item 11). Shape em shared/types/homeSettings.ts. NULL = usar defaults (todos toggles on, performanceFromGrind=true).';
