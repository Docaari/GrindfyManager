-- Sprint AI-1B (ADR-155/156/157) — report_jobs / reports + 3 colunas em user_coach_preferences.

-- =============================================================================
-- report_jobs — fila de jobs de relatorio
-- =============================================================================
CREATE TABLE IF NOT EXISTS "report_jobs" (
  "id" varchar(21) PRIMARY KEY NOT NULL,
  "user_id" varchar(21) NOT NULL REFERENCES "users"("user_platform_id") ON DELETE CASCADE,
  "report_type" varchar(16) NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "scheduled_for" timestamptz NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 3,
  "next_attempt_at" timestamptz,
  "timezone" varchar(64),
  "subscription_plan_at_enqueue" varchar(16),
  "report_id" varchar(21),
  "last_error" text,
  "enqueued_by" varchar(32),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_report_jobs_due" ON "report_jobs" ("status", "scheduled_for");
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_report_jobs_user_type_period" ON "report_jobs" ("user_id", "report_type", "period_start");
CREATE INDEX IF NOT EXISTS "idx_report_jobs_user_status" ON "report_jobs" ("user_id", "status");

-- =============================================================================
-- reports — relatorios gerados
-- =============================================================================
CREATE TABLE IF NOT EXISTS "reports" (
  "id" varchar(21) PRIMARY KEY NOT NULL,
  "user_id" varchar(21) NOT NULL REFERENCES "users"("user_platform_id") ON DELETE CASCADE,
  "report_type" varchar(16) NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'ready',
  "content" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "markdown" text,
  "model_used" varchar(64),
  "summarizer_model_used" varchar(64),
  "cost_usd_estimate" numeric(10,4),
  "input_tokens" integer,
  "cache_creation_input_tokens" integer,
  "cache_read_input_tokens" integer,
  "output_tokens" integer,
  "degraded_reason" varchar(64),
  "read_at" timestamptz,
  "dismissed_at" timestamptz,
  "generated_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_reports_user_generated" ON "reports" ("user_id", "generated_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_reports_user_type_period" ON "reports" ("user_id", "report_type", "period_start");

-- FK report_jobs.report_id -> reports.id (ON DELETE SET NULL) — adicionado depois da criacao de reports.
DO $$ BEGIN
  ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_report_id_fk"
    FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- user_coach_preferences — opt-in Weekly Report + toggles B-GAPCHECK / B-IMPORT
-- =============================================================================
ALTER TABLE "user_coach_preferences"
  ADD COLUMN IF NOT EXISTS "report_weekly_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "user_coach_preferences"
  ADD COLUMN IF NOT EXISTS "nudge_b_gapcheck" boolean NOT NULL DEFAULT true;
ALTER TABLE "user_coach_preferences"
  ADD COLUMN IF NOT EXISTS "nudge_b_import" boolean NOT NULL DEFAULT true;
