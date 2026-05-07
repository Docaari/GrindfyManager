-- Sprint 2026-05-07: extender session_tournaments com modificadores ortogonais ADR-031
-- (extensao 2026-05-06 Add-on + audit 2026-05-07).
--
-- Motivacao: tabela session_tournaments era minimal (so type + allowsAddOn).
-- Audit detectou que durante sessao live, jogador nao podia editar campos:
--   - isFlight / isLive (modificadores ortogonais)
--   - satellite_reward_type / satellite_ticket_value / satellite_target_name
--
-- Sem essas colunas, EditTournamentDialog nao podia expor esses campos sem
-- perda de dado. Migration adiciona como nullable defaults seguros.
--
-- Reversivel via DROP COLUMN (sem dropar dados de tournaments/planned).

ALTER TABLE session_tournaments
  ADD COLUMN IF NOT EXISTS is_flight boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_live boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS satellite_reward_type varchar,
  ADD COLUMN IF NOT EXISTS satellite_ticket_value decimal,
  ADD COLUMN IF NOT EXISTS satellite_target_name varchar;

-- Backfill: torneios existentes recebem defaults (false/null) ja via ALTER.
-- Nao ha re-classificacao retroativa de session_tournaments (o jogador edita
-- manualmente quando quiser).
