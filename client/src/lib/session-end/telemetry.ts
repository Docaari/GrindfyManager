/**
 * Session-End Telemetry Helpers — RF-11 (12 eventos).
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *
 * Cada helper emite track(event, payload) com payload tipado.
 * Sem PII: apenas IDs + flags + counts + currencies.
 */

import { track } from "../telemetry";

export interface SessionFinalizeClickedPayload {
  sessionId: string;
  origin: "confirmation_modal" | "direct";
}
export function emitSessionFinalizeClicked(p: SessionFinalizeClickedPayload): void {
  track("session_finalize_clicked", { ...p });
}

export interface ConfirmationModalSkippedPayload {
  sessionId: string;
  pendingCount: number;
}
export function emitConfirmationModalSkipped(p: ConfirmationModalSkippedPayload): void {
  track("confirmation_modal_skipped", { ...p });
}

export interface SessionCompletedPayload {
  sessionId: string;
  durationMinutes: number;
  profit: number;
  volume: number;
}
export function emitSessionCompleted(p: SessionCompletedPayload): void {
  track("session_completed", { ...p });
}

export interface ReconcileDisambiguationChoicePayload {
  sessionId: string;
  site: string;
  choice: "single" | "proportional" | "custom";
  walletId?: string;
}
export function emitReconcileDisambiguationChoice(
  p: ReconcileDisambiguationChoicePayload,
): void {
  // Inclui walletId apenas quando definido para preservar shape esperado pelo
  // teste (`expect.objectContaining({choice})` + `expect(walletId).toBeUndefined()`).
  const payload: Record<string, unknown> = {
    sessionId: p.sessionId,
    site: p.site,
    choice: p.choice,
  };
  if (p.walletId !== undefined) payload.walletId = p.walletId;
  track("reconcile_disambiguation_choice", payload);
}

export interface ReconcileDialogOpenedPayload {
  sessionId: string;
  walletsCount: number;
  hadActivityCount: number;
  orphanCurrencies: string[];
}
export function emitReconcileDialogOpened(p: ReconcileDialogOpenedPayload): void {
  track("reconcile_dialog_opened", { ...p });
}

export interface ReconcileSkippedNoWalletsPayload {
  sessionId: string;
}
export function emitReconcileSkippedNoWallets(p: ReconcileSkippedNoWalletsPayload): void {
  track("reconcile_skipped_no_wallets", { ...p });
}

export interface ReconcileSkippedUserPayload {
  sessionId: string;
  walletsCount: number;
  via: "button" | "x" | "esc" | "overlay";
}
export function emitReconcileSkippedUser(p: ReconcileSkippedUserPayload): void {
  track("reconcile_skipped_user", { ...p });
}

export interface ReconcileSubmittedPayload {
  sessionId: string;
  snapshotsCreated: number;
  txCreated: number;
  skipped: number;
  totalManualAdjustmentUsdEstimate?: number;
}
export function emitReconcileSubmitted(p: ReconcileSubmittedPayload): void {
  const payload: Record<string, unknown> = {
    sessionId: p.sessionId,
    snapshotsCreated: p.snapshotsCreated,
    txCreated: p.txCreated,
    skipped: p.skipped,
  };
  if (p.totalManualAdjustmentUsdEstimate !== undefined) {
    payload.totalManualAdjustmentUsdEstimate = p.totalManualAdjustmentUsdEstimate;
  }
  track("reconcile_submitted", payload);
}

export interface ReconcileFailedPayload {
  sessionId: string;
  errorCode: string;
  httpStatus: number;
  failedAtWalletId?: string;
}
export function emitReconcileFailed(p: ReconcileFailedPayload): void {
  const payload: Record<string, unknown> = {
    sessionId: p.sessionId,
    errorCode: p.errorCode,
    httpStatus: p.httpStatus,
  };
  if (p.failedAtWalletId !== undefined) {
    payload.failedAtWalletId = p.failedAtWalletId;
  }
  track("reconcile_failed", payload);
}

export interface CooldownStartedFromSummaryPayload {
  sessionId: string;
  mode: "full" | "quick";
}
export function emitCooldownStartedFromSummary(
  p: CooldownStartedFromSummaryPayload,
): void {
  track("cooldown_started_from_summary", { ...p });
}

export interface CooldownCreateFailedPayload {
  sessionId: string;
  httpStatus: number;
  errorMessage: string;
}
export function emitCooldownCreateFailed(p: CooldownCreateFailedPayload): void {
  track("cooldown_create_failed", { ...p });
}

export interface SummaryFinalizeClickedPayload {
  sessionId: string;
}
export function emitSummaryFinalizeClicked(p: SummaryFinalizeClickedPayload): void {
  track("summary_finalize_clicked", { ...p });
}
