/**
 * Sprint Bankroll-Reports-Detail (RF-13)
 * Spec: Docs/specs/sprint-bankroll-reports-detail.md
 *
 * GrindProfitHeader: header da pagina /grind mostrando profit total agregado
 * (sessions + manual_reports). Respeita filtro D10 via localStorage.
 *
 * Lessons:
 *   #2 — data-testid grind-profit-total estavel.
 *   #6 — soma profitUsd ja FX-aware (server normaliza).
 *   #11 — formato existente formatUsd (sem features extras).
 *   #12 — invalidacao via mesma queryKey usada por SessionHistoryUnified.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatUsdSigned, signOf } from "@/lib/bankrollReportsFormat";
import {
  type GrindHistoryFilter,
  GRIND_HISTORY_FILTER_STORAGE_KEY,
  loadGrindHistoryFilter,
} from "@/lib/grindHistoryFilter";

interface HistoryEntry {
  type: "session" | "manual_report";
  id: string;
  occurredAt: string;
  profitUsd: number;
}

export function GrindProfitHeader() {
  // Hooks-first (#1)
  const [filter, setFilter] = useState<GrindHistoryFilter>(() => loadGrindHistoryFilter());

  useEffect(() => {
    setFilter(loadGrindHistoryFilter());
    // Listen para storage changes para reagir a filter toggle no SessionHistoryUnified
    const onStorage = (e: StorageEvent) => {
      if (e.key === GRIND_HISTORY_FILTER_STORAGE_KEY) setFilter(loadGrindHistoryFilter());
    };
    if (typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
      // Tambem reage a click direto no chip (mesma janela): poll leve via interval.
      const interval = window.setInterval(() => {
        const cur = loadGrindHistoryFilter();
        setFilter((prev) => (prev !== cur ? cur : prev));
      }, 500);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.clearInterval(interval);
      };
    }
    return () => {};
  }, []);

  const { data, isLoading } = useQuery<HistoryEntry[]>({
    queryKey: ["/api/grind-sessions/history", "all"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/grind-sessions/history?filter=all`, undefined as any);
      return Array.isArray(r) ? r : [];
    },
  });

  const total = useMemo(() => {
    if (!data) return 0;
    const filtered =
      filter === "sessions"
        ? data.filter((e) => e.type === "session")
        : filter === "reports"
          ? data.filter((e) => e.type === "manual_report")
          : data;
    return filtered.reduce((acc, e) => acc + (Number(e.profitUsd) || 0), 0);
  }, [data, filter]);

  if (isLoading) {
    return (
      <div data-testid="grind-profit-total-loading" className="h-8 w-32 bg-muted rounded animate-pulse" />
    );
  }

  const sign = signOf(total);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Profit total</span>
      <span
        data-testid="grind-profit-total"
        data-sign={sign}
        className={`text-lg font-semibold ${
          sign === "positive" ? "text-green-600" : sign === "negative" ? "text-destructive" : ""
        }`}
      >
        {formatUsdSigned(total)}
      </span>
    </div>
  );
}

export default GrindProfitHeader;
