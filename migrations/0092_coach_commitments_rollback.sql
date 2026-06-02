-- Rollback 0092 — Coach AI UX Overhaul (#8) accountability.
ALTER TABLE user_coach_preferences DROP COLUMN IF EXISTS nudge_b_followup;
DROP TABLE IF EXISTS coach_commitments;
