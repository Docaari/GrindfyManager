-- Rollback Migration 0081 — Sprint library-evolution Fase 3.
ALTER TABLE tournaments
  DROP COLUMN IF EXISTS duration_seconds,
  DROP COLUMN IF EXISTS players_per_table,
  DROP COLUMN IF EXISTS structure,
  DROP COLUMN IF EXISTS game_type,
  DROP COLUMN IF EXISTS starting_stack_bb,
  DROP COLUMN IF EXISTS deep_stack;
