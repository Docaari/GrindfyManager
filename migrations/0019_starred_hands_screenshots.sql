-- Sprint Spot-Screenshots — Migration 0019
-- Spec: Docs/specs/spot-screenshots.md
-- ADR : Docs/architecture/decisions/057-spot-image-storage-abstraction.md
-- Decisao founder D5: 0019 (0017/0018 reservados Bankroll-3).

ALTER TABLE starred_hands
  ADD COLUMN IF NOT EXISTS image_key       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS image_mime      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS image_size      INTEGER,
  ADD COLUMN IF NOT EXISTS image_width     INTEGER,
  ADD COLUMN IF NOT EXISTS image_height    INTEGER,
  ADD COLUMN IF NOT EXISTS captured_during VARCHAR(20) NOT NULL DEFAULT 'cooldown';

-- Backfill explicito (D4 founder): rows existentes vieram do Cooldown Bloco 1.
UPDATE starred_hands
SET captured_during = 'cooldown'
WHERE captured_during IS NULL;

-- CHECK constraint para captured_during enum (kebab-case).
DO $$ BEGIN
  ALTER TABLE starred_hands
    ADD CONSTRAINT chk_starred_captured_during
    CHECK (captured_during IN ('grind-live', 'cooldown'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Index para query de cap 10/sessao cross-tournament.
CREATE INDEX IF NOT EXISTS idx_starred_user_session_captured
  ON starred_hands (user_id, session_id, captured_during);
