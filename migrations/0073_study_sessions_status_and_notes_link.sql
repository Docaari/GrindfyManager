-- Sprint Estudos-Sessao-1 — RF-01
-- ADR-177: pagina dedicada de sessao de estudo + linkagem dual de notes.
--
-- Objetivos:
--   1. Adicionar `study_sessions.status` (active/finished/abandoned, default active).
--   2. Tornar `study_notes.study_card_id` NULLABLE (deprecation gradual — lesson #7).
--   3. Adicionar `study_notes.study_session_id` (FK CASCADE, nullable).
--   4. CHECK constraint XOR-fraco: pelo menos um link presente.
--   5. Index parcial em `study_sessions(user_id, theme_id) WHERE status='active'`.
--   6. Index em `study_notes(study_session_id) WHERE study_session_id IS NOT NULL`.

BEGIN;

-- 1. study_sessions.status
ALTER TABLE study_sessions
  ADD COLUMN IF NOT EXISTS status varchar(16) NOT NULL DEFAULT 'active';

ALTER TABLE study_sessions
  DROP CONSTRAINT IF EXISTS study_sessions_status_check;
ALTER TABLE study_sessions
  ADD CONSTRAINT study_sessions_status_check
  CHECK (status IN ('active', 'finished', 'abandoned'));

CREATE INDEX IF NOT EXISTS idx_study_sessions_active
  ON study_sessions (user_id, theme_id)
  WHERE status = 'active';

-- 2. study_notes.study_session_id (FK)
ALTER TABLE study_notes
  ADD COLUMN IF NOT EXISTS study_session_id varchar(21);

-- FK constraint (nullable). Idempotente via DROP IF EXISTS.
ALTER TABLE study_notes
  DROP CONSTRAINT IF EXISTS study_notes_study_session_id_fkey;
ALTER TABLE study_notes
  ADD CONSTRAINT study_notes_study_session_id_fkey
  FOREIGN KEY (study_session_id) REFERENCES study_sessions(id) ON DELETE CASCADE;

-- 3. study_card_id passa a aceitar NULL
ALTER TABLE study_notes
  ALTER COLUMN study_card_id DROP NOT NULL;

-- 4. CHECK XOR-fraco — pelo menos UM dos dois links presente.
ALTER TABLE study_notes
  DROP CONSTRAINT IF EXISTS study_notes_link_xor;
ALTER TABLE study_notes
  ADD CONSTRAINT study_notes_link_xor
  CHECK ((study_card_id IS NOT NULL) OR (study_session_id IS NOT NULL));

-- 5. Index parcial
CREATE INDEX IF NOT EXISTS idx_study_notes_session
  ON study_notes (study_session_id)
  WHERE study_session_id IS NOT NULL;

COMMIT;
