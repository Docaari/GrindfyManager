-- Rollback da Migration 0097 (ADR-243).
-- DROP das colunas novas + indices. Additive-only na ida, logo o rollback e total
-- (nenhum dado pre-existente foi alterado pela 0097).

DROP INDEX IF EXISTS idx_tournaments_user_nick;
DROP INDEX IF EXISTS idx_tournaments_upload;

ALTER TABLE tournaments
  DROP COLUMN IF EXISTS gross_prize,
  DROP COLUMN IF EXISTS bounty_prize,
  DROP COLUMN IF EXISTS player_nick,
  DROP COLUMN IF EXISTS end_date,
  DROP COLUMN IF EXISTS field_total_entries,
  DROP COLUMN IF EXISTS flags,
  DROP COLUMN IF EXISTS upload_id,
  DROP COLUMN IF EXISTS buy_in_native,
  DROP COLUMN IF EXISTS prize_native,
  DROP COLUMN IF EXISTS fx_rate_used,
  DROP COLUMN IF EXISTS fx_source,
  DROP COLUMN IF EXISTS fx_rate_date,
  DROP COLUMN IF EXISTS source_timezone;

ALTER TABLE upload_history
  DROP COLUMN IF EXISTS rows_in_file,
  DROP COLUMN IF EXISTS rejected_count,
  DROP COLUMN IF EXISTS import_summary;
