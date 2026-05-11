-- Migration 0063: auth_refresh_tokens — refresh token rotation + family detection.
-- ADR-143. The refresh token stays a JWT; this table is the server-side record
-- that makes it rotatable / revocable. token_hash = sha256(rawRefreshJwt) hex —
-- the raw JWT is never stored. Idempotent (IF NOT EXISTS).
-- Applied to local dev 2026-05-11.

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id varchar PRIMARY KEY NOT NULL,
  user_id varchar NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  token_hash varchar NOT NULL,
  family_id varchar NOT NULL,
  expires_at timestamp NOT NULL,
  revoked_at timestamp,
  revoked_reason varchar,        -- rotated | logout | password_change | reuse_detected | expired
  replaced_by_hash varchar,
  user_agent varchar,
  ip varchar,
  created_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_refresh_tokens_hash ON auth_refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user ON auth_refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_family ON auth_refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_expires ON auth_refresh_tokens (expires_at);
