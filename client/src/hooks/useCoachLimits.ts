// =============================================================================
// useCoachLimits — Sprint Coach-1 Frontend UX / RF-07
// Hook React Query que consome GET /api/coach/limits.
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-07)
// =============================================================================

import { useQuery, useQueryClient } from '@tanstack/react-query';

export type CoachType = 'mental' | 'tournament' | 'technical';
export type Tier = 'free' | 'pro' | 'premium' | 'admin';

export interface CoachLimitInfo {
  dailyLimit: number;
  used: number;
  remaining: number;
  resetAt: string | null;
}

export interface CoachLimits {
  tier: Tier;
  // Alias para compat com possiveis nomes ('plan' tambem usado em algumas docs)
  plan?: Tier;
  limits: {
    mental: CoachLimitInfo;
    tournament: CoachLimitInfo;
    technical: CoachLimitInfo;
  };
  coachAccess: {
    mental: boolean;
    tournament: boolean;
    technical: boolean;
  };
}

const QUERY_KEY = ['/api/coach/limits'];

async function fetchCoachLimits(): Promise<CoachLimits> {
  const res = await fetch('/api/coach/limits', { credentials: 'include' });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
    const err: any = new Error(errorData?.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data as CoachLimits;
}

export function useCoachLimits(_coachType?: CoachType) {
  // Note: coachType e aceito para tipagem mas nao altera o queryKey (response
  // global ja inclui dados de todos os coaches). O parametro existe para
  // compatibilidade futura.
  return useQuery<CoachLimits>({
    queryKey: QUERY_KEY,
    queryFn: fetchCoachLimits,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
    // Em jsdom + react-query, sem placeholder pode ser que data fique undefined
    // por mais tempo. Com `enabled` default, dispara apos mount.
  });
}

export function useInvalidateCoachLimits() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
}
