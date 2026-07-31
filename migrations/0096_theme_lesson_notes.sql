-- =============================================================================
-- 0096 — Anotacoes por aula vinculada ao tema (ThemeLessonNotes).
--
-- Tabela: theme_lesson_notes
--   - 1 nota por aula por tema por usuario (UNIQUE user_id, theme_id, lesson_id).
--   - lesson_id referencia library_lessons.id (sem FK rigida - ownership app-level).
--   - content: JSONB array BlockNote (mesmo formato de stat_analysis_entries).
--
-- Aditivo, sem drop de dados.
-- =============================================================================

CREATE TABLE theme_lesson_notes (
  id          VARCHAR(32) PRIMARY KEY,
  user_id     VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme_id    VARCHAR(32) NOT NULL REFERENCES study_themes(id) ON DELETE CASCADE,
  lesson_id   VARCHAR(32) NOT NULL,
  title       VARCHAR(120) NOT NULL,
  content     JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1 nota por aula por tema por usuario (upsert via ON CONFLICT).
ALTER TABLE theme_lesson_notes
  ADD CONSTRAINT unique_user_theme_lesson
  UNIQUE (user_id, theme_id, lesson_id);

-- Index para queries por tema + usuario (GET list).
CREATE INDEX idx_theme_lesson_notes_user_theme
  ON theme_lesson_notes (user_id, theme_id);

-- Index para queries por usuario + lesson (lookup on upsert).
CREATE INDEX idx_theme_lesson_notes_user_lesson
  ON theme_lesson_notes (user_id, lesson_id);