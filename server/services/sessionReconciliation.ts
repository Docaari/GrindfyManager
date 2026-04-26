/**
 * Session Reconciliation Service — Sprint Session-End Reconciliation
 *
 * Spec: Docs/specs/session-end-wallet-reconciliation.md
 *  - RF-04: itera fail-fast por wallet, calcula delta, chama walletService
 *  - RF-08: idempotencia preflight via storage.findReconciliationMarker
 * ADR : Docs/architecture/decisions/040-session-end-wallet-reconciliation.md
 *
 * Public API:
 *   computeAdjustment(wallet, reportedBalance, expectedPreviousBalance)
 *     -> { delta, direction, nativeAmount } | null
 *     null se |delta| < 0.01 (skip silencioso, RF-04 epsilon).
 *
 *   runReconciliation(userId, sessionId, adjustments)
 *     -> { created, skipped, failed?, alreadyReconciled?, existingCount? }
 *
 * Reuso integral de walletService.recordWalletTransaction (ADR-034 + ADR-038).
 */

import { walletService } from "./walletService";
import { storage } from "../storage";

const EPSILON = 0.01;
const RECONCILE_NOTE = "Reconciliacao automatica fim de sessao";

export interface AdjustmentInput {
  walletId: string;
  reportedBalance: number;
  expectedPreviousBalance: number;
}

export interface ComputedAdjustment {
  delta: number;
  direction: "in" | "out";
  nativeAmount: number;
}

export interface ReconciliationFailure {
  walletId: string;
  code: string;
  message: string;
  currentBalance?: number;
}

export interface ReconciliationResult {
  created: any[];
  skipped: number;
  failed?: ReconciliationFailure;
  alreadyReconciled?: boolean;
  existingCount?: number;
}

/**
 * computeAdjustment — calcula delta entre saldo reportado e saldo esperado.
 * Retorna null quando |delta| < 0.01 (skip silencioso, RF-04 epsilon).
 */
export function computeAdjustment(
  _wallet: { id: string; balance?: string | number; nativeCurrency?: string },
  reportedBalance: number,
  expectedPreviousBalance: number,
): ComputedAdjustment | null {
  const delta = reportedBalance - expectedPreviousBalance;
  if (!Number.isFinite(delta)) {
    return null;
  }
  // Boundary 0.01 inclusivo: usar centavos arredondados elimina ruido fp
  // (alinhado com pattern de ADR-038 em walletService).
  const diffCents = Math.round(Math.abs(delta) * 100);
  if (diffCents < 1) {
    return null;
  }
  return {
    delta,
    direction: delta > 0 ? "in" : "out",
    nativeAmount: Math.abs(delta),
  };
}

/**
 * runReconciliation — orquestra batch fail-fast por wallet.
 *
 * 1. Preflight idempotencia (RF-08): se storage.findReconciliationMarker
 *    reporta count > 0, retorna { alreadyReconciled, existingCount } sem
 *    chamar service.
 * 2. Itera adjustments:
 *    - calcula delta via computeAdjustment; null -> skipped++.
 *    - direction='in' (delta>0) ou 'out' (delta<0); nativeAmount=|delta|.
 *    - chama walletService.recordWalletTransaction com:
 *        reason='session_result', source='auto_session', sessionId,
 *        expectedPreviousBalance, note RECONCILE_NOTE, occurredAt=now.
 *    - sucesso -> push em created.
 *    - erro -> popula failed e BREAK (fail-fast).
 */
export async function runReconciliation(
  userId: string,
  sessionId: string,
  adjustments: AdjustmentInput[],
): Promise<ReconciliationResult> {
  // 1. Preflight idempotencia
  const marker = await storage.findReconciliationMarker(sessionId, userId);
  const existingCount = marker?.count ?? 0;
  if (existingCount > 0) {
    return {
      alreadyReconciled: true,
      existingCount,
      created: [],
      skipped: 0,
    };
  }

  const created: any[] = [];
  let skipped = 0;

  for (const adj of adjustments) {
    const computed = computeAdjustment(
      { id: adj.walletId },
      adj.reportedBalance,
      adj.expectedPreviousBalance,
    );

    if (computed === null) {
      skipped++;
      continue;
    }

    try {
      const result = await walletService.recordWalletTransaction(userId, adj.walletId, {
        direction: computed.direction,
        nativeAmount: computed.nativeAmount,
        reason: "session_result",
        source: "auto_session",
        sessionId,
        expectedPreviousBalance: adj.expectedPreviousBalance,
        note: RECONCILE_NOTE,
        occurredAt: new Date(),
      } as any);
      created.push(result.transaction);
    } catch (err: any) {
      const code = err?.code ?? "unknown";
      const message = err?.message ?? "Erro ao reconciliar";
      const failure: ReconciliationFailure = {
        walletId: adj.walletId,
        code,
        message,
      };
      if (typeof err?.currentBalance === "number") {
        failure.currentBalance = err.currentBalance;
      }
      return {
        created,
        skipped,
        failed: failure,
      };
    }
  }

  return { created, skipped };
}
