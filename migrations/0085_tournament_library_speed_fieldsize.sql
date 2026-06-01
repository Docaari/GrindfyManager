-- Migration 0085: Tournament Library — indices de velocidade/field-size + backfill FX.
--
-- Contexto: velocidade vira dimensao de agrupamento de familia + filtro funcional;
-- field-size ganha filtro de range na UI. Os indices abaixo dao suporte ao
-- buildFilters (inArray(speed) + range field_size) e ao bucketing dos insights.
--
-- O backfill normaliza para USD as linhas residuais em moeda nativa (legadas, de
-- antes do withExchangeRateDefaults garantir conversao no import). Sem isso uma
-- conta multi-moeda soma BRL/EUR/CNY/USD crus e corrompe ROI/totais da biblioteca.
-- Rates = unidades por USD (mesmos defaults de server/routes/upload.ts). So moedas
-- com cotacao default conhecida sao convertidas; moeda exotica sem rate fica intacta.

CREATE INDEX IF NOT EXISTS idx_tournaments_user_speed ON tournaments (user_id, speed);
CREATE INDEX IF NOT EXISTS idx_tournaments_user_field_size ON tournaments (user_id, field_size);

UPDATE tournaments
SET
  buy_in = CAST(buy_in AS DECIMAL) / r.rate,
  prize  = CAST(COALESCE(prize, '0') AS DECIMAL) / r.rate,
  converted_to_usd = true
FROM (VALUES
  ('BRL', 5.0),
  ('CNY', 7.20),
  ('EUR', 0.92)
) AS r(currency, rate)
WHERE tournaments.converted_to_usd = false
  AND tournaments.currency = r.currency;
