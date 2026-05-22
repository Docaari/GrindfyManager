-- Rollback Sprint Mini Player 2 (ADR-190).

DROP INDEX IF EXISTS idx_spotify_tokens_connected;
DROP TABLE IF EXISTS spotify_tokens;
