-- Rollback 0075 — notifications.deep_link
DROP INDEX IF EXISTS idx_notifications_user_type_deep_link;
ALTER TABLE notifications DROP COLUMN IF EXISTS deep_link;
