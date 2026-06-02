-- =============================================================================
-- 0092 — Coach AI UX Overhaul (#8) — loop de accountability.
--
-- 1) Tabela nova coach_commitments: compromissos do jogador ("vou estudar PKO")
--    que o Coach cobra no vencimento (tick B-FOLLOWUP) + injeta no contexto.
-- 2) Coluna nudge_b_followup em user_coach_preferences (default TRUE — cobrar um
--    compromisso explicito e esperado).
--
-- Additive-only. Sem CHECK em status/category (Zod-only, padrao do projeto).
-- =============================================================================

CREATE TABLE IF NOT EXISTS coach_commitments (
  id               VARCHAR PRIMARY KEY NOT NULL,
  user_id          VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  text             TEXT NOT NULL,
  category         VARCHAR(24),
  due_date         DATE NOT NULL,
  status           VARCHAR(16) NOT NULL DEFAULT 'active',
  source           VARCHAR(24) NOT NULL DEFAULT 'tool',
  chat_session_id  VARCHAR,
  followed_up_at   TIMESTAMP,
  completed_at     TIMESTAMP,
  created_at       TIMESTAMP NOT NULL DEFAULT now(),
  updated_at       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_commitments_user_status ON coach_commitments (user_id, status);
CREATE INDEX IF NOT EXISTS idx_coach_commitments_due ON coach_commitments (status, due_date);

ALTER TABLE user_coach_preferences
  ADD COLUMN IF NOT EXISTS nudge_b_followup BOOLEAN NOT NULL DEFAULT TRUE;
