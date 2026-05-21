-- Migration 0074 — upload_history.processed_count + idx_upload_history_status
-- Sprint Backend Tech-Debt Sweep — RF-02 bulk-import progress
-- ADR-181 §2.2

ALTER TABLE upload_history
  ADD COLUMN IF NOT EXISTS processed_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_upload_history_status
  ON upload_history(status);
