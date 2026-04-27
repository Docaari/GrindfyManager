-- ============================================================================
-- Sprint Cooldown-1 (MVP) — Cool-down pos-sessao
--
-- Spec: Docs/specs/cooldown-refactor-plan.md (RF-03)
-- ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
--
-- 2 tabelas novas:
--   cooldown_logs   — 1:1 com grind_sessions (UNIQUE userId+sessionId)
--   starred_hands   — N:1 com session_tournaments
-- ============================================================================

CREATE TABLE IF NOT EXISTS "cooldown_logs" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("user_platform_id") ON DELETE CASCADE,
  "session_id" varchar NOT NULL REFERENCES "grind_sessions"("id") ON DELETE CASCADE,
  "started_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp,
  "duration_minutes" integer,
  "mode" varchar NOT NULL DEFAULT 'full',
  "blocks_completed" jsonb DEFAULT '[]'::jsonb,
  "ab_game_answers" jsonb,
  "tilt_self_assessment" jsonb,
  "sleep_intent" boolean,
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cooldown_user_session"
  ON "cooldown_logs" ("user_id", "session_id");

CREATE INDEX IF NOT EXISTS "idx_cooldown_user_completed"
  ON "cooldown_logs" ("user_id", "completed_at");

-- ----------------------------------------------------------------------------
-- starred_hands
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "starred_hands" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("user_platform_id") ON DELETE CASCADE,
  "session_id" varchar NOT NULL REFERENCES "grind_sessions"("id") ON DELETE CASCADE,
  "session_tournament_id" varchar NOT NULL REFERENCES "session_tournaments"("id") ON DELETE CASCADE,
  "cooldown_log_id" varchar REFERENCES "cooldown_logs"("id") ON DELETE SET NULL,
  "type" varchar NOT NULL,
  "spot" varchar NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_starred_user_session"
  ON "starred_hands" ("user_id", "session_id");

CREATE INDEX IF NOT EXISTS "idx_starred_user_type"
  ON "starred_hands" ("user_id", "type");
