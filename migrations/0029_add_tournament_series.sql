-- ============================================================================
-- Sprint Flight-1 — Tournament Series + back-fill dados historicos
--
-- Spec: Docs/specs/sprint-flight-1.md (RF-01 + RF-17a)
-- ADRs: 090 (single source of truth), 091 (stack_mode enum)
--
-- Fase 1 de 2:
--   Fase 1 (este arquivo) — AUTOMATICA — cria tabela + indices + back-fill.
--   Fase 2 (0030_drop_legacy_flight_flags.sql) — MANUAL — drop colunas legadas
--          ADR-031 apos 7 dias de validacao em producao.
--
-- O back-fill agrupa tournaments com is_flight=true por:
--   1. Mesmo flight_parent_id (quando setado), OU
--   2. Mesmo (name, site) quando flight_parent_id IS NULL.
-- Cria 1 row em tournament_series por grupo + popula series_id em cada entry.
-- Para entries com flight_advanced=true, popula bagged_at = created_at
-- (timestamp aproximado, melhor que NULL para preservar semantica historica).
-- ============================================================================

-- 1. ENUMs (ADR-091)
DO $$ BEGIN
  CREATE TYPE "series_stack_mode" AS ENUM ('single', 'combined');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "series_day2_status" AS ENUM ('pending', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Tabela tournament_series (ADR-090)
CREATE TABLE IF NOT EXISTS "tournament_series" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL,
  "name" varchar NOT NULL,
  "network" varchar,
  "total_day1s" integer NOT NULL DEFAULT 1,
  "day2_datetime" timestamp NOT NULL,
  "day2_status" "series_day2_status" NOT NULL DEFAULT 'pending',
  "stack_mode" "series_stack_mode" NOT NULL DEFAULT 'single',
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "fk_tournament_series_user"
    FOREIGN KEY ("user_id") REFERENCES "users"("user_platform_id") ON DELETE CASCADE
);

-- 3. Indices em tournament_series
CREATE INDEX IF NOT EXISTS "idx_series_user_status"
  ON "tournament_series" ("user_id", "day2_status");

CREATE INDEX IF NOT EXISTS "idx_series_user_datetime"
  ON "tournament_series" ("user_id", "day2_datetime");

CREATE INDEX IF NOT EXISTS "idx_series_user_name"
  ON "tournament_series" ("user_id", "name");

-- 4. FK series_id em tournaments (ON DELETE SET NULL — D2)
ALTER TABLE "tournaments"
  ADD COLUMN IF NOT EXISTS "series_id" varchar
  REFERENCES "tournament_series"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_tournaments_series"
  ON "tournaments" ("series_id")
  WHERE "series_id" IS NOT NULL;

-- 5. FK series_id em planned_tournaments (ON DELETE SET NULL)
ALTER TABLE "planned_tournaments"
  ADD COLUMN IF NOT EXISTS "series_id" varchar
  REFERENCES "tournament_series"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_planned_tournaments_series"
  ON "planned_tournaments" ("series_id")
  WHERE "series_id" IS NOT NULL;

-- 6. bagged_at em tournaments (substitui semantica de flight_advanced=true — ADR-090)
ALTER TABLE "tournaments"
  ADD COLUMN IF NOT EXISTS "bagged_at" timestamp;

-- ============================================================================
-- BACK-FILL: dados historicos com is_flight=true
-- ============================================================================
-- Estrategia: agrupar por flight_parent_id quando setado, OU por (name, site).
-- Para cada grupo: criar tournament_series + popular series_id + bagged_at.
--
-- IMPORTANTE: este script usa nanoid() via pgcrypto (gen_random_uuid trimmed).
-- Se nanoid extension nao disponivel, ajustar para gen_random_uuid()::text.
-- ============================================================================

DO $$
DECLARE
  v_group RECORD;
  v_series_id varchar;
  v_total integer;
  v_stack_mode series_stack_mode;
BEGIN
  -- Loop sobre grupos baseados em flight_parent_id (quando setado)
  FOR v_group IN
    SELECT
      flight_parent_id AS group_key,
      user_id,
      MIN(name) AS name,
      MIN(site) AS site,
      MIN(date_played) AS earliest_date,
      MAX(date_played) AS latest_date,
      COUNT(*) AS entry_count,
      ARRAY_AGG(id) AS entry_ids,
      ARRAY_AGG(id) FILTER (WHERE flight_advanced = true) AS bagged_ids
    FROM tournaments
    WHERE is_flight = true
      AND flight_parent_id IS NOT NULL
    GROUP BY user_id, flight_parent_id
  LOOP
    v_total := v_group.entry_count;
    v_stack_mode := CASE WHEN v_total > 1 THEN 'combined'::series_stack_mode
                         ELSE 'single'::series_stack_mode END;

    -- Cria series (id via gen_random_uuid trimmed para nanoid-like)
    v_series_id := substring(replace(gen_random_uuid()::text, '-', ''), 1, 21);

    INSERT INTO tournament_series
      (id, user_id, name, network, total_day1s, day2_datetime,
       day2_status, stack_mode, created_at, updated_at)
    VALUES
      (v_series_id, v_group.user_id, v_group.name, v_group.site,
       v_total, v_group.latest_date, 'completed', v_stack_mode, now(), now());

    -- Linka entries
    UPDATE tournaments
    SET series_id = v_series_id
    WHERE id = ANY(v_group.entry_ids);

    -- Popula bagged_at para entries que tinham flight_advanced=true
    IF v_group.bagged_ids IS NOT NULL THEN
      UPDATE tournaments
      SET bagged_at = created_at
      WHERE id = ANY(v_group.bagged_ids);
    END IF;
  END LOOP;

  -- Loop sobre grupos baseados em (name, site) quando flight_parent_id IS NULL
  FOR v_group IN
    SELECT
      user_id,
      name,
      site,
      MIN(date_played) AS earliest_date,
      MAX(date_played) AS latest_date,
      COUNT(*) AS entry_count,
      ARRAY_AGG(id) AS entry_ids,
      ARRAY_AGG(id) FILTER (WHERE flight_advanced = true) AS bagged_ids
    FROM tournaments
    WHERE is_flight = true
      AND flight_parent_id IS NULL
    GROUP BY user_id, name, site
  LOOP
    v_total := v_group.entry_count;
    v_stack_mode := CASE WHEN v_total > 1 THEN 'combined'::series_stack_mode
                         ELSE 'single'::series_stack_mode END;

    v_series_id := substring(replace(gen_random_uuid()::text, '-', ''), 1, 21);

    INSERT INTO tournament_series
      (id, user_id, name, network, total_day1s, day2_datetime,
       day2_status, stack_mode, created_at, updated_at)
    VALUES
      (v_series_id, v_group.user_id, v_group.name, v_group.site,
       v_total, v_group.latest_date, 'completed', v_stack_mode, now(), now());

    UPDATE tournaments
    SET series_id = v_series_id
    WHERE id = ANY(v_group.entry_ids);

    IF v_group.bagged_ids IS NOT NULL THEN
      UPDATE tournaments
      SET bagged_at = created_at
      WHERE id = ANY(v_group.bagged_ids);
    END IF;
  END LOOP;

  RAISE NOTICE 'Back-fill complete. Series criadas para tournaments historicos com is_flight=true.';
END $$;

-- ============================================================================
-- H3 fix (Reviewer R1): user_settings.reports_expand_flight_series (RF-16)
-- Coluna declarada em shared/schema.ts mas faltava migration SQL.
-- Idempotente: IF NOT EXISTS.
-- ============================================================================
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS reports_expand_flight_series BOOLEAN DEFAULT false;

-- ============================================================================
-- POS-MIGRATION: validar manualmente antes de Fase 2
-- ============================================================================
-- Queries de validacao recomendadas (founder roda em /flight para inspecao visual):
--
--   SELECT COUNT(*) FROM tournament_series;
--   SELECT COUNT(*) FROM tournaments WHERE series_id IS NOT NULL;
--   SELECT COUNT(*) FROM tournaments WHERE bagged_at IS NOT NULL;
--   SELECT name, total_day1s, stack_mode FROM tournament_series LIMIT 10;
--
-- Janela de 7 dias antes de aplicar 0030_drop_legacy_flight_flags.sql (MANUAL).
-- ============================================================================
