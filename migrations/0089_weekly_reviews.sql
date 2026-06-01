-- =============================================================================
-- Migration 0089 — EST-5 Interactive Monday Ritual (ADR-226)
--
-- Cria a tabela weekly_reviews: estado da maquina de estados "Weekly Review"
-- (ritual de segunda) — 1 row por usuario por semana (chave UTC via ymdUtc).
-- UNIQUE (user_id, week_start_date) garante idempotencia — reabrir a mesma
-- semana retorna a review existente.
--
-- status ∈ recap_sent|awaiting_upload|upload_confirmed|deep_analysis_done|
--   planning (Zod-only em shared/coach-weekly-review.ts, sem CHECK DB).
-- recap_content / analysis_content jsonb = snapshots deterministicos (RF-04/06).
-- Sem CHECK em status; sem FK (app valida ownership por userId). Nasce vazia.
--
-- APLICAR via psql local (localhost:5433); PENDENTE PROD (Neon) no deploy —
-- documentar em CLAUDE.md §6 (mesmo padrao das migrations 0086/0087/0088).
-- =============================================================================

CREATE TABLE IF NOT EXISTS weekly_reviews (
  id                    varchar         PRIMARY KEY,
  user_id               varchar         NOT NULL,
  week_start_date       date            NOT NULL,
  status                varchar(24)     NOT NULL DEFAULT 'recap_sent',
  recap_content         jsonb,
  analysis_content      jsonb,
  upload_source         varchar(16),
  planning_session_id   varchar,
  chat_session_id       varchar,
  created_at            timestamp       NOT NULL DEFAULT now(),
  updated_at            timestamp       NOT NULL DEFAULT now(),
  CONSTRAINT weekly_reviews_user_week_unique
    UNIQUE (user_id, week_start_date)
);

-- FK opcional para users (consistente com convencao do projeto — varchar user ids).
-- Mantida fora do CREATE; o app valida ownership por userId. Se desejado em PROD:
--   ALTER TABLE weekly_reviews
--     ADD CONSTRAINT weekly_reviews_user_fk
--     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- O UNIQUE (user_id, week_start_date) ja cobre as queries por (user_id, week_start_date).
-- Nao precisa indice extra (paridade 0088).
