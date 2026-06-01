-- =============================================================================
-- Rollback Migration 0090 — MDA-1 Registro de MDA (ADR-230)
--
-- Reverte por completo: dropa as 2 tabelas novas (mda_read_themes primeiro pois
-- referencia logica mda_reads — sem FK fisica, mas mantem-se a ordem por clareza)
-- + seus indices + o UNIQUE via CASCADE. Tabelas novas e isoladas — nenhum outro
-- objeto depende delas, rollback total e seguro.
--
-- Os prints ja gravados em private-uploads/mda/ NAO sao removidos por este
-- rollback (DDL nao toca filesystem); limpar manualmente se necessario.
-- =============================================================================

DROP TABLE IF EXISTS mda_read_themes CASCADE;
DROP TABLE IF EXISTS mda_reads CASCADE;
