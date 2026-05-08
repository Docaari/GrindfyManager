/**
 * useFocusStatsBar — Sprint Estudos-Habito-1 (RF-4).
 *
 * Hook canonico para renderizar `<FocusStatsBar />` em qualquer pagina.
 * Combina:
 *   - GET /api/home/focus-stats?month=YYYY-MM (3 stats foco do mes corrente)
 *   - GET /api/home/settings (visibility per-placement granular)
 *
 * Retorna { data, loading, error, visible }.
 *
 * Lessons:
 *   #1  hooks first
 *   #13 apiRequest retorna JSON parseado direto
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_FOCUS_STATS_VISIBILITY,
  type FocusStatsVisibility,
} from "@shared/types/homeSettings";
import { apiRequest } from "@/lib/queryClient";
import type { FocusStatsBarChipData, FocusStatsBarPlacement } from "@/components/study/FocusStatsBar";

interface FocusStatItemRaw {
  id: string;
  statId: string;
  statLabel: string;
  statUnit?: string | null;
  currentValue: number | null;
  delta?: number | null;
  deltaDirection?: "improving" | "degrading" | "neutral" | null;
}

interface FocusStatsResponse {
  month?: string;
  items?: FocusStatItemRaw[];
}

interface SettingsResponse {
  focusStatsVisibility?: Partial<FocusStatsVisibility>;
}

export interface UseFocusStatsBarReturn {
  data: FocusStatsBarChipData[];
  loading: boolean;
  error: boolean;
  visible: boolean;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// P1 #14: usa apiRequest (lesson #13) que ja retorna JSON parseado direto.
// Mantemos compat com tests que mocham fetch diretamente — apiRequest interno
// chama fetch entao tests com global.fetch mock continuam funcionando.

export function useFocusStatsBar(
  placement: FocusStatsBarPlacement,
): UseFocusStatsBarReturn {
  const month = React.useMemo(() => currentMonth(), []);

  const statsQ = useQuery<FocusStatsResponse>({
    queryKey: ["/api/home/focus-stats", month],
    queryFn: () => apiRequest("GET", `/api/home/focus-stats?month=${month}`) as Promise<FocusStatsResponse>,
    staleTime: 60_000,
    retry: false,
  });

  const settingsQ = useQuery<SettingsResponse>({
    queryKey: ["/api/home/settings"],
    queryFn: () => apiRequest("GET", "/api/home/settings") as Promise<SettingsResponse>,
    staleTime: 60_000,
    retry: false,
  });

  const visibility: FocusStatsVisibility = React.useMemo(() => {
    const stored = settingsQ.data?.focusStatsVisibility ?? {};
    return { ...DEFAULT_FOCUS_STATS_VISIBILITY, ...stored };
  }, [settingsQ.data]);

  const visible = visibility[placement] !== false;

  const data: FocusStatsBarChipData[] = React.useMemo(() => {
    const items = Array.isArray(statsQ.data?.items) ? statsQ.data!.items! : [];
    return items.map((it) => ({
      id: it.id,
      statId: it.statId,
      statLabel: it.statLabel,
      statUnit: it.statUnit ?? "",
      currentValue: it.currentValue,
      delta: it.delta ?? null,
      deltaDirection: (it.deltaDirection ?? "neutral") as
        | "improving"
        | "degrading"
        | "neutral",
    }));
  }, [statsQ.data]);

  return {
    data,
    loading: statsQ.isLoading,
    error: statsQ.isError,
    visible,
  };
}

export default useFocusStatsBar;
