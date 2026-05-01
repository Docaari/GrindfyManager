/**
 * Sprint Bankroll-Reports-Detail (RF-12 + RF-15)
 * Spec: Docs/specs/sprint-bankroll-reports-detail.md
 * ADR-070
 *
 * BankrollDetailModal: tabela Plataforma | Antes | Depois | Delta nativo | Delta USD.
 * Footer agrega total USD. Empty state honesto (D6) quando snapshots ausentes.
 *
 * Lessons:
 *   #1 — hooks-first: useState/useQuery ANTES de qualquer if (!open) return.
 *   #2 — data-testid estavel.
 *   #11 — sem actions extras (export, share).
 *   #12 — queryKey estavel: ['wallet-snapshot-pair', from, to].
 */

import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { formatUsdSigned, signOf } from "@/lib/bankrollReportsFormat";

interface SnapshotEntry {
  walletId: string;
  walletName: string;
  platform: string;
  currency: string;
  balanceNative: number;
  balanceUsd: number;
  snapshotId: string | null;
  snapshotOrigin: string | null;
}

interface DeltaEntry {
  walletId: string;
  walletName: string;
  platform: string;
  currency: string;
  deltaNative: number;
  deltaUsd: number;
}

interface SnapshotPairResponse {
  before: SnapshotEntry[];
  after: SnapshotEntry[];
  delta: DeltaEntry[];
  empty: boolean;
  emptyReason?: "no_snapshot_before" | "no_snapshot_after" | "data_corrupt";
}

export interface BankrollDetailEntry {
  type: "session" | "manual_report";
  id: string;
  occurredAt: string;
  completedAt?: string;
  profitUsd?: number;
  detailsAvailable?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  entry: BankrollDetailEntry;
}

function formatNative(n: number, currency: string): string {
  const symbol = currency === "USD" ? "$" : currency === "BRL" ? "R$" : `${currency} `;
  return `${symbol}${n.toFixed(2)}`;
}

function buildRange(entry: BankrollDetailEntry): { from: string; to: string } {
  if (entry.type === "manual_report") {
    const occ = new Date(entry.occurredAt).getTime();
    return {
      from: new Date(occ - 1).toISOString(),
      to: new Date(occ + 1).toISOString(),
    };
  }
  return {
    from: entry.occurredAt,
    to: entry.completedAt ?? entry.occurredAt,
  };
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && window.innerWidth < 768;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const onResize = () => {
      try {
        setIsMobile(window.innerWidth < 768);
      } catch {
        // ignore
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

export function BankrollDetailModal({ open, onClose, entry }: Props) {
  // Hooks-first (#1): TODOS os hooks antes de qualquer early return.
  const range = useMemo(() => buildRange(entry), [entry]);
  const isMobile = useIsMobile();

  const { data, isLoading } = useQuery<SnapshotPairResponse>({
    queryKey: ["wallet-snapshot-pair", range.from, range.to, entry.id],
    enabled: open,
    queryFn: async () => {
      const url =
        `/api/wallets/balance-snapshot-pair` +
        `?from=${encodeURIComponent(range.from)}` +
        `&to=${encodeURIComponent(range.to)}` +
        (entry.type === "session" ? `&sessionId=${encodeURIComponent(entry.id)}` : "");
      const r = await apiRequest("GET", url, undefined as any);
      return r as any;
    },
  });

  // Lessons #1: TODOS os hooks ANTES do early return. Caso contrario,
  // alternar `open: true -> false -> true` lanca "Rendered more hooks than
  // during the previous render".
  const totalUsd = useMemo(() => {
    if (!data?.delta) return 0;
    return data.delta.reduce((acc, d) => acc + (Number(d.deltaUsd) || 0), 0);
  }, [data]);

  // Build map: walletId -> {beforeEntry, afterEntry, deltaEntry}
  const rows = useMemo(() => {
    if (!data || data.empty) return [];
    const beforeById = new Map(data.before.map((b) => [b.walletId, b]));
    const afterById = new Map(data.after.map((a) => [a.walletId, a]));
    return (data.delta ?? []).map((d) => ({
      delta: d,
      before: beforeById.get(d.walletId),
      after: afterById.get(d.walletId),
    }));
  }, [data]);

  if (!open) return null;

  return (
    <div
      data-testid="bankroll-detail-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-card rounded-lg border shadow-2xl w-full max-w-3xl p-6 space-y-4 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Detalhes da banca</h2>
          <button
            type="button"
            data-testid="bankroll-detail-close"
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            X
          </button>
        </div>

        {isLoading && (
          <div data-testid="bankroll-detail-loading" className="space-y-2 py-4">
            <div className="h-4 bg-muted rounded animate-pulse" />
            <div className="h-4 bg-muted rounded animate-pulse" />
            <div className="h-4 bg-muted rounded animate-pulse" />
          </div>
        )}

        {!isLoading && data?.empty && (
          <div
            data-testid="bankroll-detail-modal-empty"
            className="py-8 text-center space-y-3"
          >
            <p className="text-sm font-medium">Snapshot indisponivel — saldo registrado retroativamente</p>
            <p className="text-xs text-muted-foreground">Verifique extrato bancario manualmente</p>
            <div className="flex justify-center">
              <Link
                href="/bankroll"
                data-testid="bankroll-detail-modal-empty-cta"
                onClick={onClose}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded border hover:bg-accent transition-colors"
              >
                Reportar saldo agora
              </Link>
            </div>
          </div>
        )}

        {!isLoading && data && !data.empty && !isMobile && (
          <div data-testid="bankroll-detail-table-wrapper">
            <table data-testid="bankroll-detail-table" className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 px-2 font-medium">Plataforma</th>
                  <th className="py-2 px-2 font-medium">Saldo antes</th>
                  <th className="py-2 px-2 font-medium">Saldo depois</th>
                  <th className="py-2 px-2 font-medium">Delta nativo</th>
                  <th className="py-2 px-2 font-medium">Delta USD</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ delta, before, after }) => {
                  const sign = signOf(delta.deltaUsd);
                  return (
                    <tr
                      key={delta.walletId}
                      data-testid={`bankroll-detail-row-${delta.walletId}`}
                      className={`border-b ${
                        sign === "positive" ? "text-green-600" : sign === "negative" ? "text-destructive" : ""
                      }`}
                    >
                      <td className="py-2 px-2">
                        <div className="font-medium">{delta.platform}</div>
                        <div className="text-xs text-muted-foreground">{delta.walletName}</div>
                      </td>
                      <td className="py-2 px-2">
                        {before ? formatNative(before.balanceNative, before.currency) : "-"}
                      </td>
                      <td className="py-2 px-2">
                        {after ? formatNative(after.balanceNative, after.currency) : "-"}
                      </td>
                      <td className="py-2 px-2" data-sign={sign}>
                        {delta.deltaNative >= 0 ? "+" : "-"}
                        {Math.abs(delta.deltaNative).toFixed(2)} {delta.currency}
                      </td>
                      <td className="py-2 px-2 font-medium" data-sign={sign}>
                        {formatUsdSigned(delta.deltaUsd)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td colSpan={4} className="py-2 px-2 text-right font-medium">
                    Total
                  </td>
                  <td
                    data-testid="bankroll-detail-total"
                    className="py-2 px-2 font-semibold"
                    data-sign={totalUsd >= 0 ? "positive" : "negative"}
                  >
                    {formatUsdSigned(totalUsd)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {!isLoading && data && !data.empty && isMobile && (
          <div data-testid="bankroll-detail-cards" className="space-y-2">
            {rows.map(({ delta, before, after }) => {
              const sign = signOf(delta.deltaUsd);
              return (
                <div
                  key={delta.walletId}
                  data-testid={`bankroll-detail-card-${delta.walletId}`}
                  className="border rounded-md p-3 space-y-2 bg-background"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{delta.platform}</div>
                      <div className="text-xs text-muted-foreground">{delta.walletName}</div>
                    </div>
                    <div
                      className={`font-semibold ${
                        sign === "positive" ? "text-green-600" : sign === "negative" ? "text-destructive" : ""
                      }`}
                      data-sign={sign}
                    >
                      {formatUsdSigned(delta.deltaUsd)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Antes</div>
                      <div>{before ? formatNative(before.balanceNative, before.currency) : "-"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Depois</div>
                      <div>{after ? formatNative(after.balanceNative, after.currency) : "-"}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="border-t pt-2 flex items-center justify-between">
              <span className="text-sm">Total</span>
              <span
                data-testid="bankroll-detail-total"
                className={`font-semibold ${totalUsd >= 0 ? "text-green-600" : "text-destructive"}`}
                data-sign={totalUsd >= 0 ? "positive" : "negative"}
              >
                {formatUsdSigned(totalUsd)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BankrollDetailModal;
