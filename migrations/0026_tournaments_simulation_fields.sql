-- ============================================================================
-- Sprint F4 W0 Migration 0014 — tournaments simulation fields
--
-- Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (Modelos D.2)
-- ADR-054: PrimeDope external provider
--
-- Adiciona 3 colunas em tournaments para alimentar PrimeDope simulation.
-- ============================================================================

ALTER TABLE "tournaments"
  ADD COLUMN IF NOT EXISTS "players_avg" integer;
ALTER TABLE "tournaments"
  ADD COLUMN IF NOT EXISTS "places_paid_avg" integer;
ALTER TABLE "tournaments"
  ADD COLUMN IF NOT EXISTS "rake_pct" decimal(5,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournaments_players_avg_check'
  ) THEN
    ALTER TABLE "tournaments"
      ADD CONSTRAINT "tournaments_players_avg_check"
      CHECK ("players_avg" IS NULL OR ("players_avg" BETWEEN 10 AND 50000));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournaments_places_paid_avg_check'
  ) THEN
    ALTER TABLE "tournaments"
      ADD CONSTRAINT "tournaments_places_paid_avg_check"
      CHECK ("places_paid_avg" IS NULL OR ("places_paid_avg" BETWEEN 1 AND 10000));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournaments_rake_pct_check'
  ) THEN
    ALTER TABLE "tournaments"
      ADD CONSTRAINT "tournaments_rake_pct_check"
      CHECK ("rake_pct" IS NULL OR ("rake_pct" BETWEEN 0 AND 30));
  END IF;
END$$;
