/**
 * Reconcile Schemas — Sprint Session-End Reconciliation (RF-04, RF-07)
 *
 * Spec: Docs/specs/session-end-wallet-reconciliation.md
 * ADR: Docs/architecture/decisions/040-session-end-wallet-reconciliation.md
 *
 * Schema Zod do body de POST /api/grind-sessions/:id/reconcile-wallets.
 *
 *   { adjustments: [
 *       { walletId: string(min 1),
 *         reportedBalance: number(finite),  // permite negativo (RF-03)
 *         expectedPreviousBalance: number(finite) },
 *       ...
 *     ] }   max 50 itens
 *
 * HIGH-1 reviewer fix: spec RF-03 permite saldo reportado negativo
 * (wallet pode ficar negativa apos rebuy/staking; mesmo warning do
 * WalletTransactionDialog se aplica). Schema aceita qualquer numero
 * finito; rejeita apenas NaN/Infinity.
 */

import { z } from "zod";

export const ReconcileAdjustmentSchema = z.object({
  walletId: z.string().min(1, "walletId obrigatorio"),
  reportedBalance: z
    .number({ invalid_type_error: "reportedBalance deve ser numero" })
    .refine((n) => Number.isFinite(n), { message: "reportedBalance deve ser numero finito" }),
  expectedPreviousBalance: z
    .number({ invalid_type_error: "expectedPreviousBalance deve ser numero" })
    .refine((n) => Number.isFinite(n), {
      message: "expectedPreviousBalance deve ser numero finito",
    }),
  // V2 (RF-04): expectedDelta agora pode acompanhar adjustment para snapshot.
  expectedDelta: z
    .number()
    .refine((n) => Number.isFinite(n), { message: "expectedDelta deve ser numero finito" })
    .optional(),
});

export type ReconcileAdjustment = z.infer<typeof ReconcileAdjustmentSchema>;

export const ReconcileWalletsBodySchema = z
  .object({
    // Sprint Bankroll-3 RF-9: empty adjustments == skip total (sem precisar de
    // skipReconciliation=true explicito). Compat: skipReconciliation segue valido.
    adjustments: z.array(ReconcileAdjustmentSchema).max(50, "Maximo de 50 ajustes por chamada"),
    skipReconciliation: z.boolean().optional(),
  });

export type ReconcileWalletsBody = z.infer<typeof ReconcileWalletsBodySchema>;
