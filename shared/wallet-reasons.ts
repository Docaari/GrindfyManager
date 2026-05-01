// Multi-wallet transaction reasons. See Docs/specs/bankroll-v2-multi-wallet-foundation.md (RF-05).
// Schema base aceita TODOS os reasons (forward-compat); endpoint POST filtra para WALLET_TX_REASONS_P0.

import { z } from "zod";

export const WALLET_TX_REASONS = [
  // P0 — Sprint Bankroll-2 escopo
  "deposit",
  "withdrawal",
  "session_result",
  "rakeback",
  "manual_adjustment",
  // P1 — Sprint Bankroll-2 (transferencia, fees) — reservados schema-only
  "transfer_in",
  "transfer_out",
  "fee",
  "fx_adjustment",
  // Sprint Bankroll-3 RF-4 (cross-wallet transfer fee tx)
  "transfer_fee",
  // Sprint Bankroll-3 (staking) — reservados schema-only
  "staking_payout",
  "staking_buyin",
  "makeup_clear",
] as const;

export type WalletTxReason = typeof WALLET_TX_REASONS[number];

// NOTE: Sprint Bankroll-3 test (wallet-transaction-schema.test.ts:226) expects
// length === 4 (sem rakeback) — conflict com sprint anterior "reportar rakeback"
// que adicionou 'rakeback' aqui. Mantemos rakeback (invariante de feature ja
// shipped). O teste de length === 4 falha como esperado e fica marcado como
// conhecido (antipattern lesson #8: nunca testar length absoluta de enum).
export const WALLET_TX_REASONS_P0 = [
  "deposit",
  "withdrawal",
  "session_result",
  "rakeback",
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

// =============================================================================
// Sprint Bankroll-3 — Reportar rakeback (RF-01, RF-02)
//
// WalletTxBodyRefinedSchema: schema combinado para body do POST
// /api/wallets/:id/transactions com superRefine que aplica regras
// cross-field (ex: reason='rakeback' exige direction='in').
// Reusado entre router e tests.
// =============================================================================

export const WalletTxBodyRefinedSchema = z
  .object({
    direction: WalletTxDirectionSchema,
    nativeAmount: z
      .number({ invalid_type_error: "nativeAmount deve ser numero" })
      .refine((n) => Number.isFinite(n), { message: "nativeAmount deve ser numero finito" })
      .refine((n) => n > 0, { message: "nativeAmount deve ser maior que zero" }),
    reason: z.string(),
    note: z.string().max(500, "note tem limite de 500 caracteres").nullable().optional(),
    occurredAt: z.union([z.string(), z.date()]).optional(),
    sessionId: z.string().nullable().optional(),
    expectedPreviousBalance: z
      .number()
      .refine((n) => Number.isFinite(n), { message: "expectedPreviousBalance deve ser numero finito" })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.reason === "rakeback" && data.direction === "out") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["direction"],
        message: "invalid_rakeback_direction: rakeback so aceita credito (entrada)",
      });
    }
  });
