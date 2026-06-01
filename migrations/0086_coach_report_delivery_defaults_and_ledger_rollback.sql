-- Rollback da Migration 0086: Coach Report — entrega tripla (EST-1). ADR-223.
--
-- ⚠️ ROLLBACK PARCIAL — IRREVERSÍVEL EM DADOS POR DESIGN.
--
-- Este rollback restaura apenas a ESTRUTURA / COMPORTAMENTO DE DEFAULT:
--   1. Reverte os 5 defaults de delivery de true→false.
--   2. Dropa a coluna de ledger reports.delivered_channels.
--
-- Ele NÃO desfaz o back-fill de dados (UPDATE user_coach_preferences ... = true).
-- Razão (D2/D6 + ADR-223 Decisão 2): o opt-in default-ON é a decisão de produto. Setar
-- false em massa apagaria opt-outs LEGÍTIMOS que usuários tenham feito após o back-fill
-- (não há coluna sentinel distinguindo "back-fillado" de "ligado pelo usuário"). Por isso o
-- rollback de dados é deliberadamente omitido — restauração de valores individuais, se
-- necessária, é manual e específica por usuário.
--
-- Reverter os defaults sozinho é seguro: linhas existentes mantêm seus valores; só novos
-- inserts que omitam as colunas voltam a nascer false.

BEGIN;

-- 1. Reverte os 5 defaults de delivery para false (estado pré-0086).
ALTER TABLE user_coach_preferences
    ALTER COLUMN report_weekly_enabled   SET DEFAULT false,
    ALTER COLUMN report_daily_enabled    SET DEFAULT false,
    ALTER COLUMN report_monthly_enabled  SET DEFAULT false,
    ALTER COLUMN email_weekly_enabled    SET DEFAULT false,
    ALTER COLUMN email_monthly_enabled   SET DEFAULT false;

-- 2. Dropa a coluna de ledger (additive na 0086 → DROP no rollback).
--    Perde-se o histórico de delivered_channels; a entrega tripla volta a não ter ledger
--    (e portanto in-app/chat perderiam idempotência se o código de EST-1 ainda rodasse —
--    rollback de estrutura pressupõe rollback do código EST-1 junto).
ALTER TABLE reports
    DROP COLUMN IF EXISTS delivered_channels;

-- 3. (NÃO executado — documentado como manual/indesejável)
--    O back-fill de dados abaixo NÃO é revertido por design:
--    -- UPDATE user_coach_preferences SET report_weekly_enabled=false, ... WHERE ...;
--    Apagaria opt-outs legítimos. Ver cabeçalho.

COMMIT;
