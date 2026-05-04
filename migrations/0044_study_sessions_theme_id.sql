-- 0044_study_sessions_theme_id.sql
-- Sprint home-reform-4 Item 7 — Focus Stats accountability
-- ADR-117 (Opcao C aprovada — nullable + sem back-fill)
--
-- Adiciona coluna theme_id em study_sessions (FK SET NULL para preservar
-- audit) + indice parcial WHERE theme_id IS NOT NULL para queries
-- agregadoras de tempo de estudo por tema.

ALTER TABLE study_sessions
    ADD COLUMN IF NOT EXISTS theme_id VARCHAR(21)
        REFERENCES study_themes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_theme_date
    ON study_sessions (user_id, theme_id, date)
    WHERE theme_id IS NOT NULL;

-- Rollback (manual):
-- DROP INDEX IF EXISTS idx_study_sessions_user_theme_date;
-- ALTER TABLE study_sessions DROP COLUMN IF EXISTS theme_id;
