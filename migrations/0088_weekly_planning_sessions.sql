-- =============================================================================
-- Migration 0088 — EST-6 Next-Week Planning Flow (ADR-224)
--
-- Cria a tabela weekly_planning_sessions: estado leve de 1 planning session por
-- usuario por semana (chave UTC via ymdUtc). UNIQUE (user_id, week_start_date)
-- garante idempotencia — reabrir a mesma semana retorna a sessao existente.
--
-- `steps` jsonb: { grind:{status,...}, study:{status,...}, lessons:{status,...},
--   themes:{status,...} } — status por passo ∈ pending|proposed|confirmed|skipped
--   (Zod-only, sem CHECK DB — paridade com study_sessions_v2 mode do EST-3).
--
-- Sem CHECK em status/source (validacao Zod em shared/coach-planning.ts).
-- Tabela nasce vazia — sem back-fill.
--
-- APLICAR via psql local (localhost:5433) na finalizacao; PENDENTE PROD (Neon)
-- no deploy — documentar em CLAUDE.md §6 (mesmo padrao das migrations 0086/0087).
-- =============================================================================

CREATE TABLE IF NOT EXISTS weekly_planning_sessions (
  id                varchar         PRIMARY KEY,
  user_id           varchar         NOT NULL,
  week_start_date   date            NOT NULL,
  status            varchar(16)     NOT NULL DEFAULT 'in_progress',
  steps             jsonb           NOT NULL DEFAULT '{}'::jsonb,
  source            varchar(16)     NOT NULL DEFAULT 'coach_manual',
  created_at        timestamp       NOT NULL DEFAULT now(),
  updated_at        timestamp       NOT NULL DEFAULT now(),
  CONSTRAINT weekly_planning_sessions_user_week_unique
    UNIQUE (user_id, week_start_date)
);

-- FK opcional para users (consistente com convencao do projeto — varchar user ids).
-- Mantida fora do CREATE para nao falhar caso users use platform id distinto do PK;
-- o app valida ownership por userId. Se desejado em PROD, adicionar:
--   ALTER TABLE weekly_planning_sessions
--     ADD CONSTRAINT weekly_planning_sessions_user_fk
--     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- O UNIQUE (user_id, week_start_date) ja cobre as queries por (user_id, week_start_date).
-- Nao precisa indice extra.
