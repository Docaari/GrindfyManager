/**
 * useSrsStats — Sprint Spot-Anki-Reentry-3 / RF-5.
 *
 * Hook TanStack Query que carrega estatisticas SRS para o widget /estudos:
 *   GET /api/reentry/stats -> { pendingToday, reviewedLast7Days, accuracyLast7Days, streakDays }
 *
 * staleTime 60s + refetchOnWindowFocus=true (revalida quando user volta para tab).
 *
 * Lessons:
 *   #13 apiRequest retorna JSON parseado direto
 *   #29 consumer (SrsStatsCard) deve ErrorBoundary local para fallback silencioso
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface SrsStats {
  pendingToday: number;
  reviewedLast7Days: number;
  accuracyLast7Days: number; // 0..1
  streakDays: number;
}

export const SRS_STATS_KEY = ["/api/reentry/stats"];

export function useSrsStats() {
  const query = useQuery<SrsStats>({
    queryKey: SRS_STATS_KEY,
    queryFn: async () => await apiRequest("GET", "/api/reentry/stats"),
    retry: false,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  return {
    stats: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export default useSrsStats;
