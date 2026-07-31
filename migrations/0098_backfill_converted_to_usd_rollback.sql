-- Rollback da Migration 0098 (ADR-243).
-- Reverte APENAS as linhas marcadas pelo back-fill (fx_source = 'backfill_0098').
-- Linhas que ja tinham converted_to_usd = true antes da 0098 nao sao tocadas.

UPDATE tournaments
SET converted_to_usd = false,
    fx_source = NULL
WHERE fx_source = 'backfill_0098';
