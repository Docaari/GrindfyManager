-- Migration 0082 — Sprint library-evolution Fase 5
-- Cards de familia salvos (modo Overview / library) fixados no topo de "Torneios".
-- Aplicacao MANUAL via psql (founder).

CREATE TABLE IF NOT EXISTS saved_tournament_highlights (
  id           varchar PRIMARY KEY NOT NULL,
  user_id      varchar NOT NULL,
  site         varchar NOT NULL,
  family_key   varchar NOT NULL,
  group_name   varchar,
  buy_in_tier  varchar,
  type         varchar,
  metrics      jsonb,
  reasons      jsonb,
  source       varchar DEFAULT 'overview',
  created_at   timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_highlight_user_family
  ON saved_tournament_highlights (user_id, family_key);
CREATE INDEX IF NOT EXISTS idx_saved_highlight_user_site
  ON saved_tournament_highlights (user_id, site);
