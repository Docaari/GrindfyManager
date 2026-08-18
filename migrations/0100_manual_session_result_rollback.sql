-- Rollback da Migration 0100 (ADR-244).
--
-- Remove o toggle do ajuste manual do resultado final da sessao.
--
-- ATENCAO — ordem obrigatoria: reverter `insertUserSettingsSchema`
-- (shared/schema.ts) ANTES de rodar este DROP. Com o campo ainda no Zod e a
-- coluna ausente no banco, `GET`/`PUT /api/user-settings` quebra com
-- `column "manual_session_result_enabled" does not exist` — e o PUT de settings
-- e parcial-por-merge, entao a quebra atinge todas as preferencias, nao so esta.
--
-- Perda de dado: quem havia DESLIGADO o toggle perde essa escolha (a coluna
-- some). Reaplicar a 0100 devolve todo mundo ao default TRUE. Nao ha o que
-- preservar alem disso — nenhuma outra tabela referencia esta coluna.
--
-- Nao reverte nada em `grind_sessions`: valores ja gravados em `profit`, `roi` e
-- `wallet_profit_usd` por um ajuste manual permanecem (D2 do ADR-244 — sem
-- trilha de auditoria, entao nao ha como distingui-los do calculado).

ALTER TABLE user_settings
  DROP COLUMN IF EXISTS manual_session_result_enabled;
