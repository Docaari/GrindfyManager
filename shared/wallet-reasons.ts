// Multi-wallet transaction reasons. See Docs/specs/bankroll-v2-multi-wallet-foundation.md (RF-05).
// Schema base aceita TODOS os reasons (forward-compat); endpoint POST filtra para WALLET_TX_REASONS_P0.

import { z } from "zod";

export const WALLET_TX_REASONS = [
  // P0 — Sprint Bankroll-2 escopo
  "deposit",
  "withdrawal",
  "session_result",
  "manual_adjustment",
  // P1 — Sprint Bankroll-2 (transferencia, fees) — reservados schema-only
  "transfer_in",
  "transfer_out",
  "fee",
  "fx_adjustment",
  // Sprint Bankroll-3 (staking) — reservados schema-only
  "staking_payout",
  "staking_buyin",
  "makeup_clear",
] as const;

export type WalletTxReason = typeof WALLET_TX_REASONS[number];

export const WALLET_TX_REASONS_P0 = [
  "deposit",
  "withdrawal",
  "session_result",
  "manual_adjustment",
] as const;

export type WalletTxReasonP0 = typeof WALLET_TX_REASONS_P0[number];

export const WalletTxReasonSchema = z.enum(WALLET_TX_REASONS);
export const WalletTxReasonP0Schema = z.enum(WALLET_TX_REASONS_P0);

export const WALLET_TX_DIRECTIONS = ["in", "out"] as const;
export type WalletTxDirection = typeof WALLET_TX_DIRECTIONS[number];
export const WalletTxDirectionSchema = z.enum(WALLET_TX_DIRECTIONS);

export const WALLET_TX_SOURCES = ["manual", "auto_session", "migration_v1", "auto_import_csv"] as const;
export type WalletTxSource = typeof WALLET_TX_SOURCES[number];
export const WalletTxSourceSchema = z.enum(WALLET_TX_SOURCES);
