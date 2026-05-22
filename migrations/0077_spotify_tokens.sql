-- Sprint Mini Player 2 (ADR-190) — refresh_token AES-256-GCM encrypted at rest.
-- Client NUNCA recebe refresh_token; cookie httpOnly liga session.

CREATE TABLE spotify_tokens (
  user_id varchar PRIMARY KEY REFERENCES users(user_platform_id) ON DELETE CASCADE,
  refresh_token_encrypted text NOT NULL,
  refresh_token_iv varchar(32) NOT NULL,
  refresh_token_auth_tag varchar(32) NOT NULL,
  access_token_hash varchar(64),
  expires_at timestamp,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_name varchar,
  display_name_hash varchar(64),
  spotify_user_id varchar,
  connected_at timestamp DEFAULT NOW() NOT NULL,
  disconnected_at timestamp,
  last_refresh_at timestamp,
  refresh_failure_count integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT NOW() NOT NULL,
  updated_at timestamp DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spotify_tokens_connected
  ON spotify_tokens(connected_at DESC)
  WHERE disconnected_at IS NULL;

COMMENT ON TABLE spotify_tokens IS
  'Sprint Mini Player 2 (ADR-190) — refresh_token AES-256-GCM at rest, cookie httpOnly liga client.';
