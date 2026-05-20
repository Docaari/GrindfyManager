-- Migration 0071: AI-2B — career_goals + mental_hand_history + email_log + user_coach_preferences (+5 cols)
--
-- Sprint AI-2B (último sprint do plano de IA — "Tecnico de carreira" parte 2).
-- Cria 3 tabelas novas + ALTER em user_coach_preferences:
--   1. career_goals          — metas estruturadas (substitui Goal Setting cancelado / supersede texto livre em ai_structured_profile.metas).
--   2. mental_hand_history   — Mental Hand History framework Tendler (situação/emoção/resposta real vs ideal).
--   3. email_log             — idempotência + retries + bounces dos emails de relatório (Gmail SMTP fase 1, Q-F locked).
--   4. user_coach_preferences ADD 5 cols: report_quarterly_enabled, email_weekly_enabled,
--      email_monthly_enabled, email_quarterly_enabled, disclaimer_accepted_at.
--
-- NÃO mexe em:
--   - warmup_rituals  — usado read-only pelo cgameAggregator (Q-D heurística determinística sem LLM).
--   - report_jobs/reports — report_type='quarterly' já reservado em ADR-159 (varchar(16) livre, sem ALTER nem CHECK enum).
--   - users.ai_structured_profile.metas — legacy mantida (back-compat onboarding wizard AI-1A).
--   - coach_actions — reuso direto para undo das 2 write tools novas.
--
-- Rollback: migrations/0071_ai_2b_career_mental_email_rollback.sql
-- ADRs: ADR-168 (career_goals), ADR-169 (Quarterly Report + IRPF), ADR-170 (C-game/Inchworm),
--        ADR-171 (mental_hand_history), ADR-172 (Email pipeline), ADR-173 (Disclaimer regulatório).

BEGIN;

-- =========================================================================
-- 1. career_goals (ADR-168) — metas estruturadas
-- =========================================================================
CREATE TABLE IF NOT EXISTS career_goals (
    id                VARCHAR(21) PRIMARY KEY,
    user_id           VARCHAR(21) NOT NULL
                      REFERENCES users(user_platform_id) ON DELETE CASCADE,
    title             VARCHAR(120) NOT NULL,
    description       TEXT,
    target_metric     VARCHAR(40),
    target_value      NUMERIC,
    target_deadline   DATE,
    horizon           VARCHAR(16) NOT NULL DEFAULT 'trimestre',
    status            VARCHAR(16) NOT NULL DEFAULT 'active',
    progress_note     TEXT,
    achieved_at       TIMESTAMP,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT career_goals_horizon_enum
        CHECK (horizon IN ('mes','trimestre','ano','multi_ano')),
    CONSTRAINT career_goals_status_enum
        CHECK (status IN ('active','achieved','abandoned','expired')),
    CONSTRAINT career_goals_target_metric_enum
        CHECK (target_metric IS NULL OR target_metric IN ('profit_usd','tournaments_count','roi_pct','bankroll_usd','custom'))
);

CREATE INDEX IF NOT EXISTS idx_career_goals_user_status
    ON career_goals(user_id, status);

CREATE INDEX IF NOT EXISTS idx_career_goals_user_deadline
    ON career_goals(user_id, target_deadline);

COMMENT ON TABLE career_goals IS
    'Sprint AI-2B (ADR-168). Metas estruturadas do user. Substitui Goal Setting cancelado; legacy ai_structured_profile.metas mantida sem mudança (universos paralelos — ver ADR-168 §sync). Cap 5 ativas por código (env COACH_CAREER_GOALS_MAX_ACTIVE). Sem UNIQUE.';

COMMENT ON COLUMN career_goals.horizon IS
    'mes | trimestre | ano | multi_ano — guia evaluate_career_goal sobre janela de comparação.';

COMMENT ON COLUMN career_goals.target_metric IS
    'profit_usd | tournaments_count | roi_pct | bankroll_usd | custom — evaluate_career_goal usa getPerformanceByPeriod / walletService conforme métrica; custom → progress não calculado (só narrative LLM).';

COMMENT ON COLUMN career_goals.progress_note IS
    'Read-only puro: NÃO populado por evaluate_career_goal (ADR-168 §RF-02.2). Reservado para PATCH manual do user via UI ou tool futura evaluate_career_goal_with_save (fora de escopo AI-2B).';


-- =========================================================================
-- 2. mental_hand_history (ADR-171) — framework Tendler
-- =========================================================================
CREATE TABLE IF NOT EXISTS mental_hand_history (
    id                          VARCHAR(21) PRIMARY KEY,
    user_id                     VARCHAR(21) NOT NULL
                                REFERENCES users(user_platform_id) ON DELETE CASCADE,
    occurred_at                 TIMESTAMP NOT NULL,
    situation                   TEXT NOT NULL,
    emotion                     VARCHAR(32),
    real_response               TEXT NOT NULL,
    ideal_response              TEXT NOT NULL,
    tags                        TEXT[],
    linked_grind_session_id     VARCHAR(21)
                                REFERENCES grind_sessions(id) ON DELETE SET NULL,
    created_at                  TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT mental_hh_emotion_enum
        CHECK (emotion IS NULL OR emotion IN ('frustration','tilt','fear','overconfidence','fatigue','other'))
);

CREATE INDEX IF NOT EXISTS idx_mental_hh_user_occurred
    ON mental_hand_history(user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_mental_hh_user_emotion
    ON mental_hand_history(user_id, emotion);

COMMENT ON TABLE mental_hand_history IS
    'Sprint AI-2B (ADR-171). Framework Tendler — situação, emoção, resposta real vs ideal. Capturado via tool log_mental_hand (Pro+/Trial gated) ou POST /api/coach/mental-hands (free + UI form). Quarterly Report seleciona top 3 highlights (mentalHandHighlights em ReportContent).';

COMMENT ON COLUMN mental_hand_history.linked_grind_session_id IS
    'FK ON DELETE SET NULL: deletar a sessão NÃO apaga a mental hand (registro mental sobrevive).';

COMMENT ON COLUMN mental_hand_history.tags IS
    'Array de tags livre. Ex: [''preflop'',''3bet'',''tilt-after-bad-beat'']. Sem índice GIN no MVP — queries com filtro por tag específica = follow-up.';


-- =========================================================================
-- 3. email_log (ADR-172) — idempotência + retries
-- =========================================================================
CREATE TABLE IF NOT EXISTS email_log (
    id              VARCHAR(21) PRIMARY KEY,
    user_id         VARCHAR(21) NOT NULL
                    REFERENCES users(user_platform_id) ON DELETE CASCADE,
    report_id       VARCHAR(21)
                    REFERENCES reports(id) ON DELETE SET NULL,
    kind            VARCHAR(32) NOT NULL,
    to_email        VARCHAR(255) NOT NULL,
    subject         VARCHAR(255) NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'pending',
    attempts        INTEGER NOT NULL DEFAULT 0,
    message_id      TEXT,
    error_message   TEXT,
    sent_at         TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT email_log_status_enum
        CHECK (status IN ('pending','sent','failed','bounced','unsubscribed')),
    CONSTRAINT email_log_kind_enum
        CHECK (kind IN ('report_weekly','report_monthly','report_quarterly'))
);

-- Idempotência: 1 email por (report_id, kind). NULLs em report_id NÃO disparam UNIQUE
-- (comportamento PG default). Mas como kind é NOT NULL e email-de-report sempre tem report_id
-- existente, o caso "duplicado" relevante é coberto.
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_log_report_kind
    ON email_log(report_id, kind)
    WHERE report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_log_user_kind_created
    ON email_log(user_id, kind, created_at DESC);

-- Index parcial para fila de pending — picker do retry loop varre só rows pendentes.
CREATE INDEX IF NOT EXISTS idx_email_log_pending
    ON email_log(created_at)
    WHERE status = 'pending';

COMMENT ON TABLE email_log IS
    'Sprint AI-2B (ADR-172). Log idempotente de emails de relatório (Gmail SMTP fase 1 reusando emailService.ts). 3 kinds suportados em AI-2B: report_weekly, report_monthly, report_quarterly. Daily NÃO entra (Q-G locked). Sem webhook de bounce externo (SES/SendGrid = follow-up).';

COMMENT ON COLUMN email_log.message_id IS
    'header SMTP messageId retornado por nodemailer.transporter.sendMail. Usado para debug e potencial correlação com bounce reports futuros.';

COMMENT ON COLUMN email_log.attempts IS
    'Contador de tentativas. Retry exponencial 15min/1h/4h após status=failed; >=3 → status=failed final, sem mais retries.';


-- =========================================================================
-- 4. user_coach_preferences — +5 colunas (Q-F/Q-G/Q-H locked)
-- =========================================================================
ALTER TABLE user_coach_preferences
    ADD COLUMN IF NOT EXISTS report_quarterly_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS email_weekly_enabled     BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS email_monthly_enabled    BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS email_quarterly_enabled  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS disclaimer_accepted_at   TIMESTAMP;

COMMENT ON COLUMN user_coach_preferences.report_quarterly_enabled IS
    'AI-2B (ADR-169). Opt-in CONTEÚDO do Quarterly Report (geração in-app). Default false. PREF_FIELD_BY_KIND mapeia quarterly→este campo em reportEligibility.ts.';

COMMENT ON COLUMN user_coach_preferences.email_weekly_enabled IS
    'AI-2B (ADR-172). Opt-in CANAL email do Weekly Report. Default false. Independente de report_weekly_enabled (user pode ter conteúdo in-app sem email).';

COMMENT ON COLUMN user_coach_preferences.email_monthly_enabled IS
    'AI-2B (ADR-172). Opt-in CANAL email do Monthly Report. Default false.';

COMMENT ON COLUMN user_coach_preferences.email_quarterly_enabled IS
    'AI-2B (ADR-172). Opt-in CANAL email do Quarterly Report. Default false.';

COMMENT ON COLUMN user_coach_preferences.disclaimer_accepted_at IS
    'AI-2B (ADR-173). Timestamp do aceite explícito do disclaimer regulatório (3 superfícies: footer reports + system prompt + onboarding step). Users existentes pré-AI-2B: NULL → mostra banner não-bloqueante no /coach-ai pedindo aceite single-click.';

COMMIT;
