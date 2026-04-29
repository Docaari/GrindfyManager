-- ============================================================================
-- Sprint F4 — Stats Analyzer Targets (knowledge base global)
--
-- Spec: Docs/specs/sprint-f4-stats-targets-sample-size.md
-- ADRs: 057 (knowledge base), 058 (sample size per stat)
--
-- Tabela hud_stat_targets armazena recomendacoes GTO globais por
-- (statKey, format, stakeBucket, version).
--
-- hud_stat_snapshots.values NAO precisa migration — formato 3 (V1 number,
-- V2 {value, sampleSize}) coexiste via Zod normalizer.
-- hud_layouts.sections idem — campos novos opcionais.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "hud_stat_targets" (
  "id" varchar PRIMARY KEY NOT NULL,
  "stat_key" varchar NOT NULL,
  "format" varchar NOT NULL,
  "stake_bucket" varchar NOT NULL,
  "target_min" numeric NOT NULL,
  "target_max" numeric NOT NULL,
  "source" varchar NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_hud_stat_targets"
  ON "hud_stat_targets" ("stat_key", "format", "stake_bucket", "version");

CREATE INDEX IF NOT EXISTS "idx_hud_stat_targets_lookup"
  ON "hud_stat_targets" ("stat_key", "format", "stake_bucket");
