/**
 * Tournament Selector — Frontend Hook (RF-04)
 *
 * Wrap o GET /api/tournament-selector com TanStack Query. Cada filtro entra
 * na queryKey para que mudanca de filtro dispare refetch automatico.
 *
 * staleTime 5min (matching server-side TTL do selectorCache=30min — usamos
 * staleTime menor para revalidar mais rapido quando o usuario abre/fecha
 * o widget; o cache do servidor evita custo no DB).
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import type {
  SelectorTournament,
  SelectorPlayerProfile,
} from '../../../shared/scoring';

export interface TournamentSelectorResponse {
  date: string;
  playerProfile: SelectorPlayerProfile;
  tournaments: SelectorTournament[];
  totalAvailable: number;
  totalReturned: number;
  generatedAt: string;
  cacheHit: boolean;
  bankrollConfigured: boolean;
  warnings: string[];
}

export interface TournamentSelectorFilters {
  date?: string;
  sources?: string;
  minScore?: number;
  minSample?: number;
  /** @deprecated Sprint TS-3 RF-04 — use `bankrollMode`. Mantido p/ back-compat. */
  bankrollFilter?: boolean;
  /** Sprint TS-3 RF-04 (ADR-178): tristate `all` | `hide` | `warn`. */
  bankrollMode?: 'all' | 'hide' | 'warn';
  lookbackDays?: number;
}

// Sprint 1 ressalva 4 fix (UX-2 2026-04-25): re-export do default unico
// definido em usePlayerBundle. Garante que ambos os hooks usem o mesmo
// numero por padrao (era 90 vs 180).
export { DEFAULT_LOOKBACK_DAYS } from './usePlayerBundle';
import { DEFAULT_LOOKBACK_DAYS as DEFAULT_LB } from './usePlayerBundle';

export function buildSelectorQueryKey(filters: TournamentSelectorFilters) {
  return [
    'selector',
    filters.date ?? null,
    filters.sources ?? 'suprema,library',
    filters.minScore ?? 0,
    filters.minSample ?? 0,
    // Sprint TS-3 RF-04: bankrollMode > bankrollFilter (alias).
    filters.bankrollMode ?? (filters.bankrollFilter ? 'hide' : 'all'),
    filters.lookbackDays ?? DEFAULT_LB,
  ] as const;
}

export function useTournamentSelector(
  filters: TournamentSelectorFilters,
  options?: Omit<UseQueryOptions<TournamentSelectorResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<TournamentSelectorResponse>({
    queryKey: buildSelectorQueryKey(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.date) params.set('date', filters.date);
      if (filters.sources) params.set('sources', filters.sources);
      if (filters.minScore != null) params.set('minScore', String(filters.minScore));
      if (filters.minSample != null) params.set('minSample', String(filters.minSample));
      // Sprint TS-3 RF-04 (ADR-178): bankrollMode primario, bankrollFilter alias.
      if (filters.bankrollMode) {
        params.set('bankrollMode', filters.bankrollMode);
      } else if (filters.bankrollFilter) {
        params.set('bankrollFilter', 'true');
      }
      if (filters.lookbackDays) params.set('lookbackDays', String(filters.lookbackDays));
      const url = `/api/tournament-selector?${params.toString()}`;
      return apiRequest('GET', url);
    },
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}
