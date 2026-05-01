-- Sprint Bankroll-3 RF-6 + RF-8
-- - Adiciona stops em user_settings (RF-6).
-- - Adiciona origin/source_ref_id em bankroll_snapshots (RF-8).
-- - Unique parcial idempotencia auto-cooldown (RF-2).

-- RF-6: stops em user_settings
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS stop_loss_usd DECIMAL,
  ADD COLUMN IF NOT EXISTS stop_win_usd DECIMAL,
  ADD COLUMN IF NOT EXISTS stop_lock_until TIMESTAMP,
  ADD COLUMN IF NOT EXISTS stop_lock_duration_hours INTEGER NOT NULL DEFAULT 12;

-- RF-8: origin + source_ref_id em bankroll_snapshots
ALTER TABLE bankroll_snapshots
  ADD COLUMN IF NOT EXISTS origin VARCHAR(32) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ref_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_bankroll_snapshots_origin
  ON bankroll_snapshots (origin);

-- RF-2: idempotencia 1-snapshot-per-cooldown
CREATE UNIQUE INDEX IF NOT EXISTS uq_bankroll_snapshots_cooldown
  ON bankroll_snapshots (user_id, source_ref_id)
  WHERE origin = 'auto-cooldown';
