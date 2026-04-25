/**
 * Tournament Selector — Player Bundle Hook (RF-03)
 *
 * Hook auxiliar para a feature Selector. Carrega bundle de analytics agregado
 * via GET /api/analytics/player-bundle. Usado pelo SelectorDetailsModal para
 * mostrar metricas do bundle ao lado do scoring breakdown.
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import type { PlayerAnalyticsBundle } from '../../../shared/scoring';

/**
 * Sprint 1 ressalva 4 fix (UX-2 2026-04-25): default unico de lookbackDays
 * em todos os hooks do Selector. Antes: useTournamentSelector usava 90,
 * usePlayerBundle usava 180 — divergencia podia causar bundle stale ou
 * over-fetch. Agora: 90d em ambos, alinhado com period mais comum em MTT.
 */
export const DEFAULT_LOOKBACK_DAYS = 90;

export interface UsePlayerBundleOptions {
  lookbackDays?: number;
}

export function buildPlayerBundleQueryKey(opts: UsePlayerBundleOptions) {
  return ['analytics', 'player-bundle', opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS] as const;
}

export function usePlayerBundle(
  opts: UsePlayerBundleOptions = {},
  options?: Omit<UseQueryOptions<PlayerAnalyticsBundle>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<PlayerAnalyticsBundle>({
    queryKey: buildPlayerBundleQueryKey(opts),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (opts.lookbackDays) params.set('lookbackDays', String(opts.lookbackDays));
      const url = `/api/analytics/player-bundle?${params.toString()}`;
      return apiRequest('GET', url);
    },
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}
