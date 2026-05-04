-- Sprint home-reform-4 / Item 4 — RF-01 (ADR-111)
-- Tabela `coach_lesson_recommendations` para 1 recomendacao curada por user/semana.
--
-- Schema: 8 colunas + 3 indices.
-- FK CASCADE em users.user_platform_id e library_lessons.id.
-- UNIQUE (user_id, week_start_date) garante 1 rec/semana.

CREATE TABLE IF NOT EXISTS coach_lesson_recommendations (
  id varchar PRIMARY KEY NOT NULL,
  user_id varchar NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  lesson_id varchar NOT NULL REFERENCES library_lessons(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  reason text NOT NULL,
  source varchar(20) NOT NULL,
  input_summary jsonb,
  chat_session_id varchar,
  created_at timestamp DEFAULT NOW() NOT NULL,
  dismissed_at timestamp,
  consumed_at timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coach_rec_user_week
  ON coach_lesson_recommendations (user_id, week_start_date);

CREATE INDEX IF NOT EXISTS idx_coach_rec_user_active
  ON coach_lesson_recommendations (user_id, dismissed_at, consumed_at);

CREATE INDEX IF NOT EXISTS idx_coach_rec_lesson
  ON coach_lesson_recommendations (lesson_id);
