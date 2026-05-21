-- Rollback migration 0074
DROP INDEX IF EXISTS idx_upload_history_status;
ALTER TABLE upload_history DROP COLUMN IF EXISTS processed_count;
