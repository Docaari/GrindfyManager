-- Migration 0072 — Sprint TS-3 RF-04 (ADR-178)
-- Adiciona coluna `tournament_selector_bankroll_mode` em `user_settings`.
-- Tristate: 'all' (sem filtro), 'hide' (omite acima hard), 'warn' (mostra com badge).
-- Default 'warn' — cohort mid-grinder + cold-start ganha visibilidade sem perder sinal.
--
-- Sprint TS-3 fix HIGH-4 (ADR-178 §2.1): CHECK constraint enforced em DB.
-- Q-L (metadata.invokedBy em JSONB) NAO se aplicava a essa coluna — eh enum
-- estavel (3 valores conhecidos) e merece CHECK p/ integridade.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS tournament_selector_bankroll_mode VARCHAR(8) NOT NULL DEFAULT 'warn';

ALTER TABLE user_settings
  ADD CONSTRAINT user_settings_tournament_selector_bankroll_mode_check
  CHECK (tournament_selector_bankroll_mode IN ('all', 'hide', 'warn'));

-- Rollback:
-- ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_tournament_selector_bankroll_mode_check;
-- ALTER TABLE user_settings DROP COLUMN IF EXISTS tournament_selector_bankroll_mode;
