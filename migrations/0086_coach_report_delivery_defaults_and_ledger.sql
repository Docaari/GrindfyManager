-- Migration 0086: Coach Report — entrega tripla (EST-1). Flip default-ON + back-fill + ledger.
--
-- Sprint EST-1 (Coach Weekly Delivery & Enablement). ADR-223.
--
-- Três blocos, todos ADDITIVE-ONLY (sem DROP de coluna/tabela existente):
--   1. Flip default false→true em 5 colunas de delivery de user_coach_preferences
--      (report_weekly/daily/monthly_enabled + email_weekly/monthly_enabled). Quarterly
--      (report_quarterly_enabled / email_quarterly_enabled) NÃO é tocado — fora do escopo
--      de entrega de EST-1 (continua AI-2B, default false).
--   2. Back-fill: liga os 5 opt-ins para TODAS as prefs existentes de usuários ELEGÍVEIS
--      (subscription_plan IN ('trial','active','admin') — mesma lista de
--      LIST_USERS_FOR_CRON_PRO_PLUS / planEligibility.ts). 'expired' e 'free' ficam de fora.
--      Decisão de produto D2/D6 (opt-in default ON p/ elegíveis). SEM coluna sentinel.
--   3. Ledger de idempotência da entrega tripla: reports.delivered_channels jsonb.
--      Claim atômico por canal (UPDATE condicional WHERE NOT (delivered_channels ? channel)).
--      Email mantém idempotência própria via email_log UNIQUE (report_id, kind) — a chave
--      'email' no jsonb é só observabilidade. in-app + chat usam o jsonb como barreira real.
--
-- Pré-requisito: migração 0071 (AI-2B) já aplicada (as 5 colunas físicas de email/quarterly
-- já existem). RF-01 (drizzle) sincroniza o TypeScript; ESTA migração muda defaults/dados.
--
-- Rollback: migrations/0086_coach_report_delivery_defaults_and_ledger_rollback.sql
--   (reverte os 5 defaults p/ false + DROP delivered_channels. NÃO desfaz o back-fill de
--    dados — irreversível por design; ver comentário no rollback.)

BEGIN;

-- =========================================================================
-- 1. Flip default false→true (5 colunas de delivery; quarterly intocado)
-- =========================================================================
ALTER TABLE user_coach_preferences
    ALTER COLUMN report_weekly_enabled   SET DEFAULT true,
    ALTER COLUMN report_daily_enabled    SET DEFAULT true,
    ALTER COLUMN report_monthly_enabled  SET DEFAULT true,
    ALTER COLUMN email_weekly_enabled    SET DEFAULT true,
    ALTER COLUMN email_monthly_enabled   SET DEFAULT true;

-- =========================================================================
-- 2. Back-fill — liga os 5 opt-ins para prefs existentes de usuários elegíveis.
--    Fonte de elegibilidade: users.subscription_plan IN ('trial','active','admin').
--    'expired'/'free' não recebem (gating preexistente em reportEligibility.ts).
-- =========================================================================
UPDATE user_coach_preferences
   SET report_weekly_enabled  = true,
       report_daily_enabled   = true,
       report_monthly_enabled = true,
       email_weekly_enabled   = true,
       email_monthly_enabled  = true
 WHERE user_id IN (
     SELECT user_platform_id
       FROM users
      WHERE subscription_plan IN ('trial', 'active', 'admin')
 );

-- =========================================================================
-- 3. Ledger de idempotência da entrega tripla — reports.delivered_channels jsonb.
--    Shape: { "inApp": "<ISO>", "chat": "<ISO>", "email": "<ISO>" } (chave presente
--    = canal já entregue). markReportDelivered faz claim atômico via:
--      UPDATE reports SET delivered_channels = delivered_channels || '{"inApp":"..."}'::jsonb
--       WHERE id = $1 AND NOT (delivered_channels ? 'inApp') RETURNING id
-- =========================================================================
ALTER TABLE reports
    ADD COLUMN IF NOT EXISTS delivered_channels JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN reports.delivered_channels IS
    'EST-1 (ADR-223). Ledger de idempotência da entrega tripla. { inApp, chat, email } com timestamps ISO de entrega. Claim atômico por canal (UPDATE condicional WHERE NOT (delivered_channels ? channel)). in-app + chat usam como barreira anti-duplicata; email mantém idempotência própria via email_log UNIQUE (report_id, kind) — a chave email aqui é só observabilidade.';

COMMIT;
