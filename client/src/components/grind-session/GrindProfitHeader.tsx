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

type Filter = "all" | "sessions" | "reports";

const STORAGE_KEY = "grind-history-filter";

interface HistoryEntry {
  type: "session" | "manual_report";
  id: string;
  occurredAt: string;
  profitUsd: number;
}

function loadFilter(): Filter {
  try {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (v === "sessions" || v === "reports" || v === "all") return v;
  } catch {
    // ignore
  }
  return "all";
}

function formatUsd(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function GrindProfitHeader() {
  // Hooks-first (#1)
  const [filter, setFilter] = useState<Filter>(() => loadFilter());

  useEffect(() => {
    setFilter(loadFilter());
    // Listen para storage changes para reagir a filter toggle no SessionHistoryUnified
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setFilter(loadFilter());
    };
    if (typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
      // Tambem reage a click direto no chip (mesma janela): poll leve via interval.
      const interval = window.setInterval(() => {
        const cur = loadFilter();
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

  const sign: "positive" | "negative" | "zero" = total > 0 ? "positive" : total < 0 ? "negative" : "zero";

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
        {formatUsd(total)}
      </span>
    </div>
  );
}

export default GrindProfitHeader;
