-- Migration 0048: warmup_setup_items (Reform 2026-05-05, ADR-120)
-- Persiste lista custom de items do Setup Fisico (warm-up bloco 1) por user.
-- null = usa defaults do client (DEFAULT_SETUP_ITEMS).

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS warmup_setup_items jsonb DEFAULT NULL;
