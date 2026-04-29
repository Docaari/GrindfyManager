-- ============================================================================
-- Sprint F4 W0 Migration 0015 — primedope_runs (NOVA tabela)
--
-- Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (Modelos D.3)
-- ADR-054: cache 30min + fallback stale 24h + audit trail.
-- ============================================================================

-- HIGH #5 (reviewer): FK aponta para users.user_platform_id, padrao do
-- projeto (wallets, planned_tournaments, etc.). Coluna usa varchar
-- (sem length cap) pra acompanhar o tipo da coluna referenciada.
CREATE TABLE IF NOT EXISTS "primedope_runs" (
  "id" varchar(21) PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("user_platform_id") ON DELETE CASCADE,
  "profile_letter" char(1) NOT NULL,
  "day_of_week" integer NOT NULL,
  "multiplier" integer NOT NULL,
  "input_hash" char(64) NOT NULL,
  "input_json" jsonb NOT NULL,
  "result_json" jsonb NOT NULL,
  "histogram_path" text,
  "random_runs_path" text,
  "latency_ms" integer,
  "source" varchar(20) NOT NULL,
  "pinned" boolean NOT NULL DEFAULT FALSE,
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  "expires_at" timestamp
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'primedope_runs_profile_letter_check'
  ) THEN
    ALTER TABLE "primedope_runs"
      ADD CONSTRAINT "primedope_runs_profile_letter_check"
      CHECK ("profile_letter" IN ('A','B','C'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'primedope_runs_day_of_week_check'
  ) THEN
    ALTER TABLE "primedope_runs"
      ADD CONSTRAINT "primedope_runs_day_of_week_check"
      CHECK ("day_of_week" BETWEEN 0 AND 6);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'primedope_runs_multiplier_check'
  ) THEN
    ALTER TABLE "primedope_runs"
      ADD CONSTRAINT "primedope_runs_multiplier_check"
      CHECK ("multiplier" IN (1,4,12,52));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'primedope_runs_source_check'
  ) THEN
    ALTER TABLE "primedope_runs"
      ADD CONSTRAINT "primedope_runs_source_check"
      CHECK ("source" IN ('primedope','cache','fallback-stale'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "primedope_runs_user_profile_day_created_idx"
  ON "primedope_runs" ("user_id", "profile_letter", "day_of_week", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "primedope_runs_input_hash_idx"
  ON "primedope_runs" ("input_hash");
