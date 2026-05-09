-- Rollback Sprint stats-themes-linking-1 (ADR-141).
-- Remove GIN index criado em 0060_study_themes_linked_stats_gin.sql.

DROP INDEX CONCURRENTLY IF EXISTS idx_study_themes_linked_stats_gin;
