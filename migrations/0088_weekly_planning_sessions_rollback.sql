-- =============================================================================
-- Rollback Migration 0088 — EST-6 Next-Week Planning Flow (ADR-224)
--
-- Reverte por completo: dropa a tabela weekly_planning_sessions (e o UNIQUE
-- + qualquer FK opcional via CASCADE). Tabela nova e isolada — nenhum outro
-- objeto depende dela, rollback total e seguro.
-- =============================================================================

DROP TABLE IF EXISTS weekly_planning_sessions CASCADE;
