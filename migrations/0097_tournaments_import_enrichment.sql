-- Migration 0097 — Sprint import-otimizacao (ADR-243)
--
-- Campos que o parser JA extraia do CSV e que morriam antes do INSERT (os 3
-- caminhos de upload tinham mapeamentos divergentes), + campos novos medidos no
-- export real do SharkScope (1.183 torneios / 6 contas / 6 redes):
--
--   gross_prize          coluna `Prêmio` = premio BRUTO do jogador. Estava sendo
--                        gravada em prize_pool (semantica errada). ITM canonico.
--   bounty_prize         coluna `Prêmio de Recompensa` (35 linhas, $1.254).
--   player_nick          coluna `Jogador` — export "Player Group" mistura contas.
--   end_date             coluna `Data de Conclusão` — sessao real por overlap.
--   field_total_entries  coluna `Total de Reentradas` (do FIELD, nao do jogador).
--   flags                coluna `Bandeiras` crua (jsonb) — Satellite/Rebuy/
--                        Multi-Entry/Deep-Stack/6-Max/Mystery/Progressive/...
--   upload_id            rastreabilidade + desfazer import.
--   buy_in_native /      valores na moeda original + taxa/origem usadas.
--   prize_native /       Corrige tambem a dupla conversao: converted_to_usd
--   fx_rate_used /       nunca era gravado, e o guard de leitura
--   fx_source            (normalizeTournamentsToUsd) reconvertia linha ja em USD.
--   fx_rate_date         data da cotacao usada (cambio por data do torneio).
--   source_timezone      fuso declarado no cabecalho (America/Sao_Paulo).
--
-- Additive-only. Tudo nullable sem default (lesson #7): null = "o export nao
-- trouxe", distinto de 0/false. Nenhum back-fill aqui.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS gross_prize        decimal,
  ADD COLUMN IF NOT EXISTS bounty_prize       decimal,
  ADD COLUMN IF NOT EXISTS player_nick        varchar,
  ADD COLUMN IF NOT EXISTS end_date           timestamp,
  ADD COLUMN IF NOT EXISTS field_total_entries integer,
  ADD COLUMN IF NOT EXISTS flags              jsonb,
  ADD COLUMN IF NOT EXISTS upload_id          varchar,
  ADD COLUMN IF NOT EXISTS buy_in_native      decimal,
  ADD COLUMN IF NOT EXISTS prize_native       decimal,
  ADD COLUMN IF NOT EXISTS fx_rate_used       decimal,
  ADD COLUMN IF NOT EXISTS fx_source          varchar,
  ADD COLUMN IF NOT EXISTS fx_rate_date       date,
  ADD COLUMN IF NOT EXISTS source_timezone    varchar;

-- Desfazer import / auditoria por arquivo.
CREATE INDEX IF NOT EXISTS idx_tournaments_upload
  ON tournaments (upload_id);

-- ROI por conta (export multi-nick).
CREATE INDEX IF NOT EXISTS idx_tournaments_user_nick
  ON tournaments (user_id, player_nick);

-- Reconciliacao do import: linhas no arquivo vs inseridas vs duplicadas vs rejeitadas.
ALTER TABLE upload_history
  ADD COLUMN IF NOT EXISTS rows_in_file   integer,
  ADD COLUMN IF NOT EXISTS rejected_count integer,
  ADD COLUMN IF NOT EXISTS import_summary jsonb;
