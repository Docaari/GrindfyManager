-- =============================================================================
-- Sprint Coach Sprint 0 + Coach-2B
-- ADRs: 077, 084, 085, 086, 087
--
-- Tabelas:
--   - user_coach_preferences (ADR-084)
--   - coach_nudge_log (ADR-085)
--   - coach_actions (ADR-077)
--   - coach_leak_focus (Coach-2B RF-05)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- user_coach_preferences
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_coach_preferences (
  id                       VARCHAR PRIMARY KEY,
  user_id                  VARCHAR NOT NULL UNIQUE
                             REFERENCES users(user_platform_id) ON DELETE CASCADE,

  nudge_b_snapshot         BOOLEAN NOT NULL DEFAULT TRUE,
  nudge_b_leak             BOOLEAN NOT NULL DEFAULT TRUE,
  nudge_b_study            BOOLEAN NOT NULL DEFAULT TRUE,
  nudge_b_volume           BOOLEAN NOT NULL DEFAULT TRUE,
  nudge_b_grade            BOOLEAN NOT NULL DEFAULT TRUE,
  nudge_b_downswing        BOOLEAN NOT NULL DEFAULT TRUE,
  nudge_b_life             BOOLEAN NOT NULL DEFAULT FALSE,
  nudge_b_mental           BOOLEAN NOT NULL DEFAULT FALSE,

  quiet_hours_start        INTEGER NOT NULL DEFAULT 21,
  quiet_hours_end          INTEGER NOT NULL DEFAULT 9,

  max_nudges_per_day       INTEGER NOT NULL DEFAULT 3,
  max_nudges_per_hour      INTEGER NOT NULL DEFAULT 1,

  channel_in_app           BOOLEAN NOT NULL DEFAULT TRUE,
  channel_email            BOOLEAN NOT NULL DEFAULT TRUE,
  channel_push             BOOLEAN NOT NULL DEFAULT FALSE,

  coach_tone               VARCHAR(20) NOT NULL DEFAULT 'balanced',

  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_coach_preferences_user
  ON user_coach_preferences(user_id);

-- -----------------------------------------------------------------------------
-- coach_nudge_log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coach_nudge_log (
  id                  VARCHAR PRIMARY KEY,
  user_id             VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,

  category            VARCHAR(32) NOT NULL,
  cycle_key           VARCHAR(16),
  status              VARCHAR(16) NOT NULL,

  title_i18n          VARCHAR(200),
  body_preview        TEXT,
  channel             VARCHAR(16) DEFAULT 'in_app',

  chat_session_id     VARCHAR,
  triggered_by_event  VARCHAR(64),

  sent_at             TIMESTAMP DEFAULT NOW(),
  engaged_at          TIMESTAMP,
  dismissed_at        TIMESTAMP,
  snooze_until        TIMESTAMP,

  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coach_nudge_log_user_sent
  ON coach_nudge_log(user_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_coach_nudge_log_user_category_cycle
  ON coach_nudge_log(user_id, category, cycle_key);
CREATE INDEX IF NOT EXISTS idx_coach_nudge_log_category_status_sent
  ON coach_nudge_log(category, status, sent_at);

-- -----------------------------------------------------------------------------
-- coach_actions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coach_actions (
  id                       VARCHAR PRIMARY KEY,
  user_id                  VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  chat_session_id          VARCHAR,
  message_id               VARCHAR,
  tool_use_id              VARCHAR(64),
  tool_name                VARCHAR(64) NOT NULL,
  status                   VARCHAR(16) NOT NULL,
  input                    JSONB,
  result                   JSONB,
  error_message            TEXT,
  payload_before           JSONB,
  payload_after            JSONB,
  affected_entity_type     VARCHAR(32),
  affected_entity_id       VARCHAR,
  requires_confirmation    BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_at             TIMESTAMP,
  undo_expires_at          TIMESTAMP,
  undone_at                TIMESTAMP,
  latency_ms               INTEGER,
  executed_at              TIMESTAMP,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coach_actions_user_status
  ON coach_actions(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_coach_actions_session
  ON coach_actions(chat_session_id);
CREATE INDEX IF NOT EXISTS idx_coach_actions_tool
  ON coach_actions(tool_name, status, created_at);
CREATE INDEX IF NOT EXISTS idx_coach_actions_undo_window
  ON coach_actions(user_id, undo_expires_at)
  WHERE status = 'completed' AND undo_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coach_actions_pending_cleanup
  ON coach_actions(status, created_at)
  WHERE status = 'pending';

-- -----------------------------------------------------------------------------
-- coach_leak_focus
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coach_leak_focus (
  id                       VARCHAR PRIMARY KEY,
  user_id                  VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  leak_code                VARCHAR(64) NOT NULL,
  description              TEXT NOT NULL,
  target_month             VARCHAR(7) NOT NULL,
  baseline_stat_key        VARCHAR(128) NOT NULL,
  baseline_value           DECIMAL NOT NULL,
  baseline_sample_size     INTEGER NOT NULL,
  study_plan_notes         TEXT,
  status                   VARCHAR(16) DEFAULT 'active',
  resolved_at              TIMESTAMP,
  created_at               TIMESTAMP DEFAULT NOW(),
  updated_at               TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coach_leak_focus_user_month
  ON coach_leak_focus(user_id, target_month);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_coach_leak_focus_user_code_month
  ON coach_leak_focus(user_id, leak_code, target_month);
