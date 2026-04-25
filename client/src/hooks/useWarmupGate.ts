/**
 * useWarmupGate — Sprint W-1 (RF-13, RF-14, T-12)
 *
 * Wrapper de GET /api/warmup-rituals/latest com React Query.
 * Retorna { canStartGrind, latestRitual, reason, isLoading }.
 *
 * canStartGrind = (latestRitual !== null) && (decisionToPlay === true)
 * reason: 'ritual_ok' | 'no_recent_warmup' | 'loading' | 'gate_no_go'
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export type WarmupGateReason =
  | "ritual_ok"
  | "no_recent_warmup"
  | "loading"
  | "gate_no_go";

export interface UseWarmupGateResult {
  canStartGrind: boolean;
  latestRitual: any | null;
  reason: WarmupGateReason;
  isLoading: boolean;
}

const QUERY_KEY = ["/api/warmup-rituals/latest"];

export function useWarmupGate(): UseWarmupGateResult {
  const query = useQuery<any | null>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/warmup-rituals/latest");
      return res ?? null;
    },
    staleTime: 30_000,
    retry: false,
  });

  const isLoading = query.isLoading;
  const latestRitual = query.data ?? null;

  let canStartGrind = false;
  let reason: WarmupGateReason = "loading";

  if (isLoading) {
    reason = "loading";
    canStartGrind = false;
  } else if (latestRitual == null) {
    reason = "no_recent_warmup";
    canStartGrind = false;
  } else if (latestRitual.decisionToPlay === true) {
    reason = "ritual_ok";
    canStartGrind = true;
  } else {
    reason = "gate_no_go";
    canStartGrind = false;
  }

  return {
    canStartGrind,
    latestRitual,
    reason,
    isLoading,
  };
}
