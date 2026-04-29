// =============================================================================
// Sprint F4 W1 — usePrimedopeRuns hook
//
// useQuery -> GET /api/primedope/runs
//
// Reviewer fix HIGH #2: usar apiRequest para refresh-on-401 automatico.
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface PrimedopeRunSummary {
  id: string;
  userId: string;
  profileLetter: "A" | "B" | "C";
  dayOfWeek: number;
  pinned: boolean;
  createdAt: string | Date;
  resultJson?: any;
  histogramPath?: string | null;
  randomRunsPath?: string | null;
  source?: string;
  latencyMs?: number;
}

interface UsePrimedopeRunsOptions {
  enabled?: boolean;
  profileLetter?: "A" | "B" | "C";
  dayOfWeek?: number;
  limit?: number;
}

export function usePrimedopeRuns({
  enabled = true,
  profileLetter,
  dayOfWeek,
  limit = 20,
}: UsePrimedopeRunsOptions = {}) {
  return useQuery<PrimedopeRunSummary[], Error>({
    queryKey: ["primedope-runs", profileLetter, dayOfWeek, limit],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (profileLetter) params.set("profileLetter", profileLetter);
      if (typeof dayOfWeek === "number") params.set("dayOfWeek", String(dayOfWeek));
      if (limit) params.set("limit", String(limit));
      const body = await apiRequest(
        "GET",
        `/api/primedope/runs?${params.toString()}`,
      );
      return Array.isArray(body) ? body : body?.items ?? [];
    },
  });
}

export default usePrimedopeRuns;
