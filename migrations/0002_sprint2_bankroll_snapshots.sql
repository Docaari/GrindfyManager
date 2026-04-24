-- Sprint 2 — Bankroll Snapshots (RF-05, RF-11)
-- ADR-017: snapshot table + user_settings.bankroll_amount como cache autoritativo.
-- Idempotente (IF NOT EXISTS) — safe to re-run.

CREATE TABLE IF NOT EXISTS bankroll_snapshots (
  id              VARCHAR PRIMARY KEY NOT NULL,
  user_id         VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  occurred_at     TIMESTAMP NOT NULL DEFAULT now(),
  delta           DECIMAL NOT NULL,
  previous_amount DECIMAL NOT NULL,
  new_amount      DECIMAL NOT NULL,
  reason          VARCHAR NOT NULL,
  note            TEXT,
  source          VARCHAR NOT NULL DEFAULT 'manual',
  session_id      VARCHAR,
  created_at      TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bankroll_snapshots_user_occurred
  ON bankroll_snapshots (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_bankroll_snapshots_user_reason
  ON bankroll_snapshots (user_id, reason);
