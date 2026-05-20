-- Migration 0069 — wallet_transactions indexes
-- Sprint UX-QW-2 RF-06 follow-up (efficiency review).
--
-- Os indexes declarados em shared/schema.ts (idx_wtx_wallet_occurred,
-- idx_wtx_user_reason, idx_wtx_user_occurred, idx_wtx_transfer_group) existem
-- via drizzle-kit push em DBs locais mas nao estavam versionados em migration.
-- Sem indice dedicado (user_id, wallet_id, occurred_at DESC), o enrichment de
-- listWalletsByUser (MAX(occurred_at) GROUP BY wallet_id WHERE user_id=$1 AND
-- wallet_id = ANY($2)) faz seq scan da tabela. Volume cresce linear com
-- transacoes do user.
--
-- IF NOT EXISTS para idempotencia (DBs que ja receberam via drizzle push).
-- CONCURRENTLY evita lock exclusivo (ACCESS EXCLUSIVE) na tabela em prod. EXIGE
-- rodar fora de transaction — drizzle-kit push aplica cada statement em sua
-- propria conexao sem BEGIN/COMMIT wrapper, entao OK. Se aplicado via psql
-- manual, garantir que nao esteja dentro de \begin.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wtx_wallet_occurred
  ON wallet_transactions (wallet_id, occurred_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wtx_user_occurred
  ON wallet_transactions (user_id, occurred_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wtx_user_reason
  ON wallet_transactions (user_id, reason);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wtx_transfer_group
  ON wallet_transactions (transfer_group_id);

-- Index composto dedicado ao hot path do enrichment de wallets (user + wallet
-- + occurred_at). Permite index-only-scan no aggregate MAX por wallet.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wtx_user_wallet_occurred
  ON wallet_transactions (user_id, wallet_id, occurred_at DESC);
