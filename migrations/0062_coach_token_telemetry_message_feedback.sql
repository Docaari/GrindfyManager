-- Migration 0062: coach token telemetry cols + message_feedback table
-- Coach-1 RF-01 (token telemetry) + RF-02 (message feedback) schema additions were
-- merged to shared/schema.ts (2026-04-24) but never pushed to DB. Surfaced during
-- launch Fase 1 coach rewrite when Drizzle started emitting the full column list:
--   error: coluna "input_tokens" da relação "chat_messages" não existe
-- Applied to local dev 2026-05-11. Idempotent (IF NOT EXISTS).

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS input_tokens integer;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS output_tokens integer;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS cache_creation_input_tokens integer;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS cache_read_input_tokens integer;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS model varchar(100);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS latency_ms integer;
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON chat_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_role_created ON chat_messages (role, created_at);

CREATE TABLE IF NOT EXISTS message_feedback (
  id varchar PRIMARY KEY NOT NULL,
  message_id varchar NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  feedback varchar(10) NOT NULL,
  comment text,
  created_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_message_feedback_user_message ON message_feedback (message_id, user_id);
CREATE INDEX IF NOT EXISTS idx_message_feedback_message ON message_feedback (message_id);
CREATE INDEX IF NOT EXISTS idx_message_feedback_user_created ON message_feedback (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_message_feedback_feedback_created ON message_feedback (feedback, created_at);
