-- Sprint AI-1C (ADR-159) — opt-in do Daily Debrief + Monthly Report em user_coach_preferences.
--
-- Lesson #7 (schema gradual): colunas novas `optional + default`, NOT NULL DEFAULT false
-- (back-fill trivial — relatorios sao opt-in, founder Q2). Nenhuma ALTER em report_jobs/reports:
-- report_type ja eh varchar(16) LIVRE (migration 0067) e aceita 'daily'/'monthly' sem mudanca.
-- enqueued_by tambem eh varchar livre (aceita 'session_completed').
--
-- ReportContent.reportType alargado p/ 'weekly'|'monthly'|'daily' + campos opcionais novos
-- (comparatives/variance/leaksDelta/goalsProgress/followUp/sessionSummary, schemaVersion 1->2)
-- sao mudancas de TIPO TS em shared/schema.ts — NAO de schema DB (content eh jsonb livre).

-- =============================================================================
-- user_coach_preferences — opt-in Daily Debrief + Monthly Report
-- =============================================================================
ALTER TABLE "user_coach_preferences"
  ADD COLUMN IF NOT EXISTS "report_daily_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "user_coach_preferences"
  ADD COLUMN IF NOT EXISTS "report_monthly_enabled" boolean NOT NULL DEFAULT false;
