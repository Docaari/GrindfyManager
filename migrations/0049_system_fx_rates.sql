-- Sprint FX-1 RF-01: system_fx_rates table (ADR-121).
-- Cron-fetched FX rates BRL/EUR daily. PK composta (date, currency).
-- ADR-033 convention: rate_per_usd = native units per 1 USD.

CREATE TABLE IF NOT EXISTS system_fx_rates (
  date DATE NOT NULL,
  currency VARCHAR(8) NOT NULL,
  rate_per_usd NUMERIC(18, 8) NOT NULL,
  source VARCHAR(16) NOT NULL CHECK (source IN ('bcb_ptax', 'frankfurter', 'manual', 'fallback')),
  fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (date, currency)
);

CREATE INDEX IF NOT EXISTS idx_system_fx_rates_currency_date
  ON system_fx_rates (currency, date DESC);
