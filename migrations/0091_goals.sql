-- =============================================================================
-- Migration 0091 — Ferramenta de Metas 4DX fatia-1 (ADR-229)
--
-- Cria 4 tabelas novas: goals (medidas de direcao D2), goal_wig_meta (filha 1:1
-- da WIG = career_goals), goal_links (N:N WIG<->medida), goal_progress_snapshots
-- (placar historico). career_goals INTOCADA (DEC-A6-impl opcao b) — as colunas
-- que referenciam career_goals.id ganham FK SQL-only (drizzle nao conhece a tabela).
--
-- Additive-only. APLICAR via psql local (localhost:5433); PENDENTE PROD (Neon)
-- no deploy — documentar em CLAUDE.md §6 (padrao 0086/0087/0088/0089).
-- =============================================================================

-- --- goals: medidas de direcao (D2) ---
CREATE TABLE IF NOT EXISTS goals (
  id              varchar       PRIMARY KEY,
  user_id         varchar       NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  goal_kind       varchar(12)   NOT NULL DEFAULT 'measure',
  goal_type       varchar(16)   NOT NULL,
  category        varchar(24)   NOT NULL,
  title           varchar(120)  NOT NULL,
  source_metric   varchar(48),
  target_value    numeric,
  unit            varchar(16),
  cadence         varchar(8),
  direction       varchar(4)    NOT NULL DEFAULT 'up',
  horizon         varchar(8)    NOT NULL,
  status          varchar(12)   NOT NULL DEFAULT 'active',
  origin          varchar(24)   NOT NULL DEFAULT 'manual',
  created_at      timestamp     NOT NULL DEFAULT now(),
  updated_at      timestamp     NOT NULL DEFAULT now(),
  archived_at     timestamp
);

ALTER TABLE goals ADD CONSTRAINT goals_goal_type_enum
  CHECK (goal_type IN ('process','performance','result'));
ALTER TABLE goals ADD CONSTRAINT goals_category_enum
  CHECK (category IN ('financial_brm','volume_grind','study','mental_tilt',
                      'process_routine','longevity_burnout','leak_focus'));
ALTER TABLE goals ADD CONSTRAINT goals_cadence_enum
  CHECK (cadence IS NULL OR cadence IN ('weekly','daily'));
ALTER TABLE goals ADD CONSTRAINT goals_horizon_enum
  CHECK (horizon IN ('week','month','quarter','season'));
ALTER TABLE goals ADD CONSTRAINT goals_direction_enum
  CHECK (direction IN ('up','down'));

CREATE INDEX IF NOT EXISTS idx_goals_user_status ON goals (user_id, status);
CREATE INDEX IF NOT EXISTS idx_goals_user_kind ON goals (user_id, goal_kind);

-- --- goal_wig_meta: filha 1:1 da WIG (career_goals). Presenca = e WIG-4DX. ---
CREATE TABLE IF NOT EXISTS goal_wig_meta (
  career_goal_id        varchar       PRIMARY KEY,
  user_id               varchar       NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  baseline_value        numeric       NOT NULL,
  target_value_4dx      numeric,
  source_metric         varchar(48),
  unit                  varchar(16),
  horizon_4dx           varchar(8),
  wig_role              varchar(24),
  coach_tone_at_create  varchar(8),
  origin                varchar(24)   NOT NULL DEFAULT 'manual',
  created_at            timestamp     NOT NULL DEFAULT now(),
  updated_at            timestamp     NOT NULL DEFAULT now()
);

-- FK SQL-only para career_goals (career_goals nao esta no drizzle).
ALTER TABLE goal_wig_meta ADD CONSTRAINT goal_wig_meta_career_goal_fk
  FOREIGN KEY (career_goal_id) REFERENCES career_goals(id) ON DELETE CASCADE;
ALTER TABLE goal_wig_meta ADD CONSTRAINT goal_wig_meta_horizon_enum
  CHECK (horizon_4dx IS NULL OR horizon_4dx IN ('quarter','season'));

CREATE INDEX IF NOT EXISTS idx_goal_wig_meta_user ON goal_wig_meta (user_id);

-- --- goal_links: N:N WIG<->medida ---
CREATE TABLE IF NOT EXISTS goal_links (
  id                  varchar     PRIMARY KEY,
  user_id             varchar     NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  wig_career_goal_id  varchar     NOT NULL,
  measure_id          varchar     NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  created_at          timestamp   NOT NULL DEFAULT now()
);

-- FK SQL-only para career_goals.
ALTER TABLE goal_links ADD CONSTRAINT goal_links_wig_career_goal_fk
  FOREIGN KEY (wig_career_goal_id) REFERENCES career_goals(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS goal_links_wig_measure_unique
  ON goal_links (wig_career_goal_id, measure_id);
CREATE INDEX IF NOT EXISTS idx_goal_links_user ON goal_links (user_id);

-- --- goal_progress_snapshots: placar historico (RF-08) ---
CREATE TABLE IF NOT EXISTS goal_progress_snapshots (
  id                varchar       PRIMARY KEY,
  user_id           varchar       NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  goal_ref_id       varchar       NOT NULL,   -- polimorfico: goals.id OU career_goals.id (sem FK)
  goal_kind         varchar(12)   NOT NULL,
  week_start_date   date          NOT NULL,
  current_value     numeric,
  expected_value    numeric,
  compliance_pct    numeric,
  streak_days       integer       DEFAULT 0,
  status            varchar(12),
  data_sufficiency  varchar(4)    NOT NULL DEFAULT 'ok',
  created_at        timestamp     NOT NULL DEFAULT now()
);

ALTER TABLE goal_progress_snapshots ADD CONSTRAINT goal_snapshots_kind_enum
  CHECK (goal_kind IN ('measure','wig'));
ALTER TABLE goal_progress_snapshots ADD CONSTRAINT goal_snapshots_sufficiency_enum
  CHECK (data_sufficiency IN ('ok','low'));

CREATE UNIQUE INDEX IF NOT EXISTS goal_progress_snapshots_ref_week_unique
  ON goal_progress_snapshots (goal_ref_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_goal_snapshots_user_week
  ON goal_progress_snapshots (user_id, week_start_date);
