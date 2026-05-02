-- =============================================================================
-- Migration 0025: tournament_library — late_reg_minutes
--
-- Adiciona coluna late_reg_minutes (integer, nullable) em tournament_library
-- para preservar janela de late registration no template (antes existia apenas
-- em planned_tournaments e session_tournaments). Sem essa coluna, importacoes
-- de torneios com late-reg perdem a info ao re-instanciar do template.
-- =============================================================================

ALTER TABLE tournament_library
  ADD COLUMN IF NOT EXISTS late_reg_minutes integer;
