-- Rollback 0094 — Torneios: Famílias Customizáveis + Visões + Workspace.
-- Reverte as colunas/tabelas/seed adicionados em 0094 (ordem reversa).
-- ATENÇÃO: dropa dados das tabelas novas; as 2 colunas de
-- saved_tournament_highlights são removidas (perde recipe/filters salvos).

DROP INDEX IF EXISTS idx_workspace_member_ws;
DROP INDEX IF EXISTS uq_workspace_member_user;
DROP TABLE IF EXISTS workspace_members;
DROP TABLE IF EXISTS account_workspaces;

DROP INDEX IF EXISTS uq_grouping_view_user_name;
DROP INDEX IF EXISTS idx_grouping_views_user;
DROP TABLE IF EXISTS tournament_grouping_views;

ALTER TABLE saved_tournament_highlights DROP COLUMN IF EXISTS filters;
ALTER TABLE saved_tournament_highlights DROP COLUMN IF EXISTS recipe;

DELETE FROM permissions WHERE name = 'workspace_admin';
