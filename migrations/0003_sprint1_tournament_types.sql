-- Sprint 1: Tournament Types Extension (ADR-031, ADR-032)
-- Modelo ortogonal: type primario (Vanilla|PKO|Mystery|Satellite) + modificadores (isFlight, isLive)
-- + campos condicionais (satellite*, flight*, package*) + espelhamento type<->category.

-- =============================================================================
-- tournaments: adiciona `type` (faltava no DB), 17 colunas novas + 3 indexes
-- =============================================================================

-- ADR-031: coluna type primaria. Antes do Sprint 1, tournaments usava so `category`.
-- Default 'Vanilla' atende rows novas; backfill abaixo espelha de category nas existentes.
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "type" varchar DEFAULT 'Vanilla';

ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "is_flight" boolean DEFAULT false;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "is_live" boolean DEFAULT false;

-- Satellite fields (so quando type=Satellite)
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "satellite_reward_type" varchar;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "satellite_ticket_value" numeric;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "satellite_target_template_id" varchar;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "satellite_target_name" varchar;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "satellite_extra_cash" numeric;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "entered_via_satellite" boolean DEFAULT false;

-- Flight fields (so quando isFlight=true)
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "flight_day" varchar;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "flight_parent_id" varchar;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "flight_advanced" boolean;

-- Package fields (so quando isLive=true ou Satellite com rewardType=package)
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "package_buy_in" numeric;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "package_accommodation" numeric;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "package_travel" numeric;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "package_meals" numeric;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "package_other" numeric;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "package_notes" text;

-- Indexes parciais (queries do Selector + dashboard agregados)
CREATE INDEX IF NOT EXISTS "tournaments_satellite_target_idx" ON "tournaments" ("satellite_target_template_id");
CREATE INDEX IF NOT EXISTS "tournaments_flight_parent_idx" ON "tournaments" ("flight_parent_id");
CREATE INDEX IF NOT EXISTS "tournaments_live_idx" ON "tournaments" ("is_live");

-- =============================================================================
-- planned_tournaments: adiciona `category` (faltava no DB), 8 colunas novas
-- =============================================================================

-- ADR-032: category espelho de type para deprecation gradual.
-- Antes do Sprint 1, planned_tournaments usava so `type`. Backfill abaixo espelha.
ALTER TABLE "planned_tournaments" ADD COLUMN IF NOT EXISTS "category" varchar;

-- Modificadores ortogonais
ALTER TABLE "planned_tournaments" ADD COLUMN IF NOT EXISTS "is_flight" boolean DEFAULT false;
ALTER TABLE "planned_tournaments" ADD COLUMN IF NOT EXISTS "is_live" boolean DEFAULT false;

-- Flight fields
ALTER TABLE "planned_tournaments" ADD COLUMN IF NOT EXISTS "flight_day" varchar;
ALTER TABLE "planned_tournaments" ADD COLUMN IF NOT EXISTS "flight_parent_id" varchar;

-- Satellite fields minimos (planned tem subset menor — sem extra_cash/target_template_id)
ALTER TABLE "planned_tournaments" ADD COLUMN IF NOT EXISTS "satellite_reward_type" varchar;
ALTER TABLE "planned_tournaments" ADD COLUMN IF NOT EXISTS "satellite_ticket_value" numeric;
ALTER TABLE "planned_tournaments" ADD COLUMN IF NOT EXISTS "satellite_target_name" varchar;

-- =============================================================================
-- Backfill: espelhamento type<->category para rows existentes
-- =============================================================================

-- tournaments: rows antigas tinham category preenchido mas nao type — espelha
UPDATE "tournaments" SET "type" = "category" WHERE "type" IS NULL OR "type" = 'Vanilla' AND "category" <> 'Vanilla';
UPDATE "tournaments" SET "category" = "type" WHERE "category" <> "type";

-- planned_tournaments: rows antigas tinham type preenchido mas nao category — espelha
UPDATE "planned_tournaments" SET "category" = "type" WHERE "category" IS NULL;
