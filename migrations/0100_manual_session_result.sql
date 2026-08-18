-- =============================================================================
-- 0100 — Ajuste manual do resultado final da sessao (grind-live). ADR-244.
--
-- Toggle global do jogador que habilita o campo de ajuste manual do resultado
-- no modal de fim de sessao (SessionSummaryModal). Ligado por padrao (D3):
-- quem nunca tocou na preferencia herda `true` pelo DEFAULT, sem back-fill.
--
-- Additive-only. Sem CHECK (booleano). Sem indice (leitura sempre por
-- user_settings.user_id, ja UNIQUE).
--
-- DEPENDENCIA DURA — aplicar junto com a atualizacao do Zod na mesma sprint:
--   `PUT /api/user-settings` (server/routes/misc.ts) faz
--   `insertUserSettingsSchema.parse(merge_do_registro_existente)`. Uma coluna
--   presente no banco e ausente no schema Zod derruba TODO o PUT parcial de
--   settings — nao apenas este toggle. O inverso (Zod atualizado sem a coluna)
--   quebra GET/PUT com `column "manual_session_result_enabled" does not exist`.
--
-- Escopo: esta migration NAO altera `grind_sessions`. O ajuste manual grava nas
-- colunas existentes `profit`, `roi` e `wallet_profit_usd` (D1/D2 do ADR-244) —
-- `wallet_profit_usd` muda de SEMANTICA (de "delta reconciliado das wallets"
-- para "resultado final declarado da sessao"), nao de tipo.
-- =============================================================================

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS manual_session_result_enabled BOOLEAN NOT NULL DEFAULT TRUE;
