-- Hotfix 2026-04-26: alinha bankroll_snapshots com shared/schema.ts (Sprint Bankroll-2 RF-04).
-- Sem essas colunas, GET /api/bankroll falha com 500 ("coluna wallet_id nao existe")
-- porque storage.getBankrollSnapshots faz select() sobre todas as colunas declaradas.
-- Idempotente (IF NOT EXISTS).

ALTER TABLE "bankroll_snapshots" ADD COLUMN IF NOT EXISTS "wallet_id" varchar;
ALTER TABLE "bankroll_snapshots" ADD COLUMN IF NOT EXISTS "native_amount" decimal;
ALTER TABLE "bankroll_snapshots" ADD COLUMN IF NOT EXISTS "native_currency" varchar(8);
ALTER TABLE "bankroll_snapshots" ADD COLUMN IF NOT EXISTS "fx_rate_usd_per_native" decimal;

CREATE INDEX IF NOT EXISTS "idx_bankroll_snapshots_wallet"
  ON "bankroll_snapshots" ("wallet_id");
