/**
 * Sprint Bankroll-Reports-Detail (RF-11 + RF-14)
 * Spec: Docs/specs/sprint-bankroll-reports-detail.md
 *
 * SessionHistoryUnified — historico unificado /grind:
 *   - sessoes registradas (type=session)
 *   - manual_reports clusterizados (type=manual_report)
 *
 * Filtro toggle (D10): "Tudo" | "Apenas sessoes" | "Apenas reports".
 * Persiste em localStorage['grind-history-filter'] (RF-14).
 *
 * Botao "Ver detalhes da banca" gated por entry.detailsAvailable (#11).
 */

import React, { useEffect, useMemo, useState } from "react";
import { formatUsdSigned, signOf } from "@/lib/bankrollReportsFormat";
import {
  type GrindHistoryFilter,
  loadGrindHistoryFilter,
  persistGrindHistoryFilter,
} from "@/lib/grindHistoryFilter";

export interface SessionHistoryEntry {
  type: "session";
  id: string;
  occurredAt: string;
  completedAt: string;
  profitUsd: number;
  tournamentsCount: number;
  platformsAffected: string[];
  detailsAvailable: boolean;
}

export interface ManualReportHistoryEntry {
  type: "manual_report";
  id: string;
  occurredAt: string;
  profitUsd: number;
  transactionIds: string[];
  platformsAffected: string[];
  detailsAvailable: boolean;
}

export type HistoryEntry = SessionHistoryEntry | ManualReportHistoryEntry;

interface Props {
  entries: HistoryEntry[];
  onViewBankrollDetail: (entry: HistoryEntry) => void;
}

export function SessionHistoryUnified({ entries, onViewBankrollDetail }: Props) {
  // Hooks-first (#1): TODOS antes de qualquer early return.
  const [filter, setFilter] = useState<GrindHistoryFilter>(() => loadGrindHistoryFilter());

  // SSR-safe hydration (#12): re-aplica do localStorage no mount.
  useEffect(() => {
    setFilter(loadGrindHistoryFilter());
  }, []);

  const sorted = useMemo(() => {
    return [...(entries ?? [])].sort((a, b) => {
      const ta = new Date(a.occurredAt).getTime();
      const tb = new Date(b.occurredAt).getTime();
      return tb - ta;
    });
  }, [entries]);

  const filtered = useMemo(() => {
    if (filter === "sessions") return sorted.filter((e) => e.type === "session");
    if (filter === "reports") return sorted.filter((e) => e.type === "manual_report");
    return sorted;
  }, [sorted, filter]);

  function handleFilterChange(next: GrindHistoryFilter) {
    setFilter(next);
    persistGrindHistoryFilter(next);
  }

  const isEmpty = (entries ?? []).length === 0;

  return (
    <div data-testid="session-history-list" className="space-y-3">
      <div
        data-testid="grind-history-filter-toggle"
        className="flex gap-2 border rounded-md p-1 bg-muted"
      >
        <button
          type="button"
          data-testid="grind-history-filter-all"
          aria-pressed={filter === "all"}
          onClick={() => handleFilterChange("all")}
          className={`flex-1 px-3 py-1.5 rounded text-sm ${
            filter === "all" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"
          }`}
        >
          Tudo
        </button>
        <button
          type="button"
          data-testid="grind-history-filter-sessions"
          aria-pressed={filter === "sessions"}
          onClick={() => handleFilterChange("sessions")}
          className={`flex-1 px-3 py-1.5 rounded text-sm ${
            filter === "sessions" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"
          }`}
        >
          Apenas sessoes
        </button>
        <button
          type="button"
          data-testid="grind-history-filter-reports"
          aria-pressed={filter === "reports"}
          onClick={() => handleFilterChange("reports")}
          className={`flex-1 px-3 py-1.5 rounded text-sm ${
            filter === "reports" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"
          }`}
        >
          Apenas reports
        </button>
      </div>

      {isEmpty && (
        <div data-testid="session-history-empty" className="text-sm text-muted-foreground py-8 text-center">
          Sem entradas no historico
        </div>
      )}

      {filtered.map((entry) => {
        const isManual = entry.type === "manual_report";
        const sign = signOf(entry.profitUsd);
        return (
          <div
            key={entry.id}
            data-testid={`history-entry-${entry.type}-${entry.id}`}
            className="border rounded-md p-3 space-y-2 bg-card"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {isManual ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    Report manual
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    Sessao
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.occurredAt).toLocaleString("pt-BR")}
                </span>
              </div>
              <span
                data-testid={`history-entry-${entry.type}-${entry.id}-profit`}
                data-sign={sign}
                className={`text-sm font-medium ${
                  sign === "positive"
                    ? "text-green-600 positive"
                    : sign === "negative"
                      ? "text-destructive negative"
                      : "text-muted-foreground"
                }`}
              >
                {formatUsdSigned(entry.profitUsd)}
              </span>
            </div>

            <div className="flex flex-wrap gap-1">
              {(entry.platformsAffected ?? []).map((p) => (
                <span
                  key={p}
                  className="text-xs px-2 py-0.5 rounded border bg-background"
                >
                  {p}
                </span>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                data-testid={`history-bankroll-detail-btn-${entry.id}`}
                disabled={!entry.detailsAvailable}
                onClick={() => onViewBankrollDetail(entry)}
                className="text-xs px-3 py-1 rounded border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Ver detalhes da banca
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default SessionHistoryUnified;
