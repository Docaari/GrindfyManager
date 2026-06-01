-- =============================================================================
-- Rollback Migration 0091 — Ferramenta de Metas 4DX fatia-1 (ADR-229)
--
-- DROP em ordem reversa de dependencia (goal_links depende de goals;
-- goal_wig_meta + goal_progress_snapshots tem FK SQL-only para career_goals).
-- DROP TABLE CASCADE remove constraints/indices/FKs associados.
-- career_goals NAO e tocada (apenas as FKs declaradas aqui somem com os DROPs).
-- =============================================================================

DROP TABLE IF EXISTS goal_progress_snapshots CASCADE;
DROP TABLE IF EXISTS goal_links CASCADE;
DROP TABLE IF EXISTS goal_wig_meta CASCADE;
DROP TABLE IF EXISTS goals CASCADE;
