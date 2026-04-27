/**
 * ResponsiveSnapshotRow — RF-09 (P10/F-10).
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *
 * Componente reutilizavel que renderiza UMA wallet snapshot:
 *   - Em viewport >=640px: <tr> de tabela com 6 colunas.
 *   - Em viewport <640px:  card vertical (header + 2x2 grid + reason).
 *
 * O wrapper escolhe o modo via media query no parent (SessionWalletSnapshotsTable).
 * Aqui apenas exportamos as duas variantes para reuso.
 */
import React from "react";
import { formatCurrency } from "@/lib/format";
import { transactionSourceLabel } from "@/lib/bankrollHelpers";

export interface SnapshotRowData {
  walletId: string;
  walletName?: string | null;
  platform?: string | null;
  nativeCurrency: string;
  openingBalance: number | null;
  closingBalance: number | null;
  expectedDelta: number;
  manualAdjustment: number | null;
  reason: string;
}

function formatNullableCurrency(v: number | null, currency: string): string {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return "—";
  return formatCurrency(v, currency);
}

function formatDeltaWithSign(v: number, currency: string): string {
  if (v > 0) return `+${formatCurrency(v, currency)}`;
  return formatCurrency(v, currency);
}

function reasonLabel(reason: string, skipped: boolean): string {
  if (skipped) return "Reconciliacao pulada";
  // session_result snapshot equivale a wallet_transactions.source='auto_session'
  // (mesma string PT-BR; reuso garante consistencia com BankrollHistoryTable).
  if (reason === "session_result") return transactionSourceLabel("auto_session");
  return reason;
}

export function ResponsiveSnapshotTableRow({ snap }: { snap: SnapshotRowData }) {
  const skipped = snap.closingBalance === null;
  return (
    <tr data-testid={`session-snapshot-row-${snap.walletId}`}>
      <td className="px-3 py-2">
        <div className="text-sm font-medium">{snap.walletName ?? snap.walletId}</div>
        <div className="text-xs text-muted-foreground">
          {snap.platform ?? ""} {snap.nativeCurrency}
        </div>
      </td>
      <td className="px-3 py-2 text-sm">
        {formatNullableCurrency(snap.openingBalance, snap.nativeCurrency)}
      </td>
      <td className="px-3 py-2 text-sm">
        {skipped ? (
          <span data-testid={`session-snapshot-skipped-badge-${snap.walletId}`}>
            — Pulada
          </span>
        ) : (
          formatNullableCurrency(snap.closingBalance, snap.nativeCurrency)
        )}
      </td>
      <td
        className={`px-3 py-2 text-sm ${
          snap.expectedDelta > 0
            ? "text-green-700"
            : snap.expectedDelta < 0
              ? "text-red-700"
              : "text-muted-foreground"
        }`}
      >
        {formatDeltaWithSign(snap.expectedDelta, snap.nativeCurrency)}
      </td>
      <td className="px-3 py-2 text-sm">
        {snap.manualAdjustment === null
          ? "—"
          : formatDeltaWithSign(snap.manualAdjustment, snap.nativeCurrency)}
      </td>
      <td className="px-3 py-2 text-sm text-muted-foreground">
        {reasonLabel(snap.reason, skipped)}
      </td>
    </tr>
  );
}

export function ResponsiveSnapshotCard({ snap }: { snap: SnapshotRowData }) {
  const skipped = snap.closingBalance === null;
  return (
    <div
      data-testid={`session-snapshot-card-${snap.walletId}`}
      className="border rounded p-3 space-y-2"
    >
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium">{snap.walletName ?? snap.walletId}</div>
        <div className="text-xs text-muted-foreground">
          {snap.platform ?? ""} {snap.nativeCurrency}
          {skipped && (
            <span
              data-testid={`session-snapshot-skipped-badge-${snap.walletId}`}
              className="ml-2 px-2 py-0.5 rounded bg-muted text-xs"
            >
              Pulada
            </span>
          )}
        </div>
      </div>
      <div
        data-testid={`session-snapshot-row-${snap.walletId}`}
        className="grid grid-cols-2 gap-2 text-sm"
      >
        <div>
          <div className="text-xs text-muted-foreground">Inicial</div>
          <div>{formatNullableCurrency(snap.openingBalance, snap.nativeCurrency)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Final</div>
          <div>
            {skipped
              ? "—"
              : formatNullableCurrency(snap.closingBalance, snap.nativeCurrency)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Delta esperado</div>
          <div
            className={
              snap.expectedDelta > 0
                ? "text-green-700"
                : snap.expectedDelta < 0
                  ? "text-red-700"
                  : "text-muted-foreground"
            }
          >
            {formatDeltaWithSign(snap.expectedDelta, snap.nativeCurrency)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Ajuste manual</div>
          <div>
            {snap.manualAdjustment === null
              ? "—"
              : formatDeltaWithSign(snap.manualAdjustment, snap.nativeCurrency)}
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        {reasonLabel(snap.reason, skipped)}
      </div>
    </div>
  );
}

export default ResponsiveSnapshotTableRow;
