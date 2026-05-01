-- Sprint Bankroll-3 RF-4 + RF-5
-- Cria tabela wallet_transfers + adiciona external_reference em wallet_pending.
-- ADR-059 (transfers) + RF-5 (pending settle herda externalRef).

CREATE TABLE IF NOT EXISTS wallet_transfers (
  id VARCHAR PRIMARY KEY NOT NULL,
  user_id VARCHAR NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
  transfer_group_id VARCHAR NOT NULL UNIQUE,
  from_wallet_id VARCHAR NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  to_wallet_id VARCHAR NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  amount_from DECIMAL NOT NULL,
  amount_to DECIMAL NOT NULL,
  from_currency VARCHAR(8) NOT NULL,
  to_currency VARCHAR(8) NOT NULL,
  fx_rate DECIMAL,
  fee_amount DECIMAL,
  fee_currency VARCHAR(8),
  fee_wallet_id VARCHAR REFERENCES wallets(id) ON DELETE RESTRICT,
  reason VARCHAR NOT NULL,
  note TEXT,
  occurred_at TIMESTAMP DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_different_wallets CHECK (from_wallet_id <> to_wallet_id),
  CONSTRAINT chk_amounts_positive CHECK (amount_from > 0 AND amount_to > 0)
);

CREATE INDEX IF NOT EXISTS idx_wallet_transfers_user_occurred
  ON wallet_transfers (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transfers_from_wallet
  ON wallet_transfers (from_wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transfers_to_wallet
  ON wallet_transfers (to_wallet_id);

-- RF-5: external_reference em wallet_pending (herdado por settle).
ALTER TABLE wallet_pending
  ADD COLUMN IF NOT EXISTS external_reference VARCHAR(120);

-- RF-5: index para checagem de cap (10 pending por wallet).
CREATE INDEX IF NOT EXISTS idx_wallet_pending_active
  ON wallet_pending (wallet_id) WHERE status = 'pending';
