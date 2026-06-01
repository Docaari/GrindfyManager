-- =============================================================================
-- Rollback Migration 0089 — EST-5 Interactive Monday Ritual (ADR-226)
--
-- Reverte por completo: dropa a tabela weekly_reviews (e o UNIQUE + qualquer FK
-- opcional via CASCADE). Tabela nova e isolada — nenhum outro objeto depende
-- dela, rollback total e seguro.
-- =============================================================================

DROP TABLE IF EXISTS weekly_reviews CASCADE;
