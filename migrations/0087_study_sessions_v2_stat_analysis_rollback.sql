-- Rollback do Sprint EST-3 (ADR-222 / 0087).
-- Reversivel em DDL. As imagens ja gravadas em private-uploads/stat-analysis/
-- NAO sao removidas pelo rollback (DDL nao toca filesystem); limpar manualmente
-- se necessario.

DROP INDEX IF EXISTS idx_ssv2_stat_analysis_theme_stat;

ALTER TABLE study_sessions_v2
  DROP COLUMN IF EXISTS lesson_insights,
  DROP COLUMN IF EXISTS filters_analyzed_count,
  DROP COLUMN IF EXISTS hands_solved_count,
  DROP COLUMN IF EXISTS stat_analysis_entries,
  DROP COLUMN IF EXISTS stat_id;
