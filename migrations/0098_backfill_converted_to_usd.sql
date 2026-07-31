-- Migration 0098 — Sprint import-otimizacao (ADR-243). BACK-FILL de correcao.
--
-- BUG QUE ESTA MIGRATION FECHA (dupla conversao de moeda)
-- Os 3 caminhos de upload nunca gravavam `converted_to_usd`, embora o parser JA
-- convertesse os valores para USD no import (`stake / conversionRate`). Resultado
-- no DB: linha em CNY/EUR com valores JA em USD mas com a flag em `false`.
-- O guard de leitura `storage.normalizeTournamentsToUsd` (Biblioteca de Torneios)
-- confia na flag: ve `!converted_to_usd AND currency <> 'USD'` e converte DE NOVO.
-- Efeito observado no DB local do founder: torneio de ¥388 (~US$54) gravado como
-- buy_in 53.888 (=388/7.2, ja USD) aparecia como ~US$7,48 na Biblioteca.
--
-- Verificacao feita antes deste back-fill (DB local, 126.108 torneios):
--   CNY: 174 linhas, valores conferem com 388/7.2 -> ja convertidas
--   EUR: 1.504 linhas (1.487 com flag true + 17 com flag false, todas ja
--        convertidas: 12.5/0.92 = 13.586...)
-- Logo: TODA linha nao-USD existente esta convertida, e a flag e que estava errada.
--
-- A partir da Migration 0097 + mapeamento unico, `converted_to_usd` passa a ser
-- gravado corretamente e `fx_rate_used`/`buy_in_native` registram a taxa usada.
--
-- REVERSIVEL: o rollback devolve a flag para false apenas nas linhas que este
-- script tocou (marcadas por fx_source = 'backfill_0098').

UPDATE tournaments
SET converted_to_usd = true,
    fx_source = COALESCE(fx_source, 'backfill_0098')
WHERE currency IS NOT NULL
  AND currency <> 'USD'
  AND (converted_to_usd IS NULL OR converted_to_usd = false);
