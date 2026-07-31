-- =============================================================================
-- 0094 — Torneios: Famílias Customizáveis + Visões + Workspace (Fases 2-4).
--
-- Additive-only. Cobre as 3 fases de persistência do sprint
-- torneios-custom-families:
--
--   FASE 2 (visões nomeadas): tournament_grouping_views — receitas de
--           agrupamento nomeadas, reutilizáveis, PRIVADAS por usuário.
--   FASE 3 (card reproduzível): 2 colunas em saved_tournament_highlights
--           (recipe + filters) para o card carregar a própria receita/filtros.
--           NULL recipe => receita default legada (read-side default).
--   FASE 4 (workspace cross-conta): account_workspaces + workspace_members
--           (hub-and-spoke; ≤1 workspace por user) + seed da permissão
--           workspace_admin. Membros veem os cards salvos uns dos outros
--           (snapshot congelado; só cards salvos cruzam — visões/histórico
--           ficam privados).
--
-- SEM FK rigida (ownership app-level, padrão das tabelas 0088-0093). Enums
-- Zod-only sem CHECK no DB. Nasce vazio, sem back-fill.
-- =============================================================================

-- FASE 3 — card reproduzível: receita + filtros usados ao salvar.
ALTER TABLE saved_tournament_highlights ADD COLUMN IF NOT EXISTS recipe  JSONB;
ALTER TABLE saved_tournament_highlights ADD COLUMN IF NOT EXISTS filters JSONB;

-- FASE 2 — visões nomeadas (receitas reutilizáveis, privadas por user).
CREATE TABLE IF NOT EXISTS tournament_grouping_views (
  id         VARCHAR PRIMARY KEY NOT NULL,
  user_id    VARCHAR NOT NULL,
  name       VARCHAR NOT NULL,
  dims       JSONB   NOT NULL,          -- GroupDim[] (ordem canônica)
  filters    JSONB,                     -- conjunto de filtros opcional salvo junto
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grouping_views_user ON tournament_grouping_views (user_id);
-- Dedup: 1 nome de visão por user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_grouping_view_user_name ON tournament_grouping_views (user_id, name);

-- FASE 4 — workspaces (hub-and-spoke). Founder/superadmin vincula contas direto.
CREATE TABLE IF NOT EXISTS account_workspaces (
  id         VARCHAR PRIMARY KEY NOT NULL,
  name       VARCHAR NOT NULL,
  created_by VARCHAR NOT NULL,          -- user_platform_id de quem criou (admin)
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workspace_members (
  id           VARCHAR PRIMARY KEY NOT NULL,
  workspace_id VARCHAR NOT NULL,
  user_id      VARCHAR NOT NULL,
  added_by     VARCHAR,
  created_at   TIMESTAMP NOT NULL DEFAULT now()
);
-- ≤1 workspace por user (co-membros = todos do meu workspace menos eu).
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_member_user ON workspace_members (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_member_ws ON workspace_members (workspace_id);

-- Seed idempotente da permissão de admin de workspace (mesmo padrão de 0093).
INSERT INTO permissions (id, name, description, created_at)
VALUES (
  'perm_workspace_admin',
  'workspace_admin',
  'Gerenciar workspaces de contas (criar, vincular/desvincular contas — compartilha cards salvos entre as contas vinculadas)',
  now()
)
ON CONFLICT (name) DO NOTHING;
