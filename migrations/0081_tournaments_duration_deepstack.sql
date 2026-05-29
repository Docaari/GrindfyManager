-- Migration 0081 — Sprint library-evolution Fase 3
-- Adiciona colunas capturadas do CSV Sharkscope (antes descartadas) +
-- deepstack/stack-depth derivados do nome. Tudo nullable/default — back-compat
-- total: linhas existentes e parsers que nao setam ficam null/false.
--   duration_seconds   -> habilita $/hora-mesa (Fase 4). null = desconhecido (!= 0).
--   players_per_table  -> 6 / 8 / 9.
--   structure          -> 'NL' | 'PL'.
--   game_type          -> 'Holdem' | 'Omaha'.
--   starting_stack_bb  -> profundidade parseada do nome ("[10BB]"). null = desconhecido.
--   deep_stack         -> heuristica (deep keyword OU stack >= 50bb).
-- Aplicacao MANUAL via psql (founder) — nao db:push em producao.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS players_per_table integer,
  ADD COLUMN IF NOT EXISTS structure varchar,
  ADD COLUMN IF NOT EXISTS game_type varchar,
  ADD COLUMN IF NOT EXISTS starting_stack_bb integer,
  ADD COLUMN IF NOT EXISTS deep_stack boolean DEFAULT false;
