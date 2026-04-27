-- ============================================================================
-- Sprint Session-End Reconciliation V2
--
-- Spec: Docs/specs/session-end-reconciliation-v2.md (RF-07)
-- ADR : Docs/architecture/decisions/046-session-wallet-snapshots-table.md
-- ADR : Docs/architecture/decisions/045-session-end-wallet-tie-break.md
--
-- Mudancas:
--   1. Nova tabela session_wallet_snapshots (RF-07)
--   2. Indice composto idx_session_tournaments_session_user (E-09 perf review)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "session_wallet_snapshots" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("user_platform_id") ON DELETE CASCADE,
  "session_id" varchar NOT NULL REFERENCES "grind_sessions"("id") ON DELETE CASCADE,
  "wallet_id" varchar NOT NULL REFERENCES "wallets"("id") ON DELETE CASCADE,
  "native_currency" varchar(8) NOT NULL,
  "opening_balance" decimal NOT NULL,
  "closing_balance" decimal,
  "expected_delta" decimal NOT NULL,
  "manual_adjustment" decimal,
  "contributing_tournament_ids" jsonb DEFAULT '[]'::jsonb,
  "reason" varchar NOT NULL DEFAULT 'session_result',
  "wallet_transaction_id" varchar,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_session_wallet_snapshot"
  ON "session_wallet_snapshots" ("session_id", "wallet_id");

CREATE INDEX IF NOT EXISTS "idx_session_wallet_snapshots_user"
  ON "session_wallet_snapshots" ("user_id", "session_id");

-- ----------------------------------------------------------------------------
-- Performance: indice composto para queries hot-path do session-end.
-- listReconcilableWallets + listSessionTournaments filtram por (session_id, user_id).
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "idx_session_tournaments_session_user"
  ON "session_tournaments" ("session_id", "user_id");
