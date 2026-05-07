/**
 * usePlatformsByPopularity — Sprint coach-page-reform-1 RF-05.2.
 * Spec: Docs/specs/sprint-coach-page-reform-1.md §RF-05.2 (Path B — hook client-side).
 * UX audit: Docs/ux-audit-2026-05-07/biblioteca-quick-filters.md §2.5.
 *
 * Calcula ordem dos chips de plataforma da Biblioteca:
 *   1. Sites do user (via /api/tournament-library) ordenados desc por count.
 *   2. Sites do enum global fallback que ainda nao apareceram.
 *   3. (Sites fora do enum oficial sao ignorados.)
 *
 * Fallback global (founder confirmou):
 *   PokerStars, GGPoker, WPN, PartyPoker, 888poker, iPoker, CoinPoker,
 *   Chico, Bodog, Suprema, Revolution.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface UsePlatformsByPopularityResult {
  sites: string[];
  isLoading: boolean;
}

/** Lista global de fallback. Ordem aprovada pelo founder. */
const FALLBACK_GLOBAL: string[] = [
  'PokerStars',
  'GGPoker',
  'WPN',
  'PartyPoker',
  '888poker',
  'iPoker',
  'CoinPoker',
  'Chico',
  'Bodog',
  'Suprema',
  'Revolution',
];

/** Conjunto oficial de sites (uniao do fallback). Sites fora desse conjunto sao ignorados. */
const ENUM_OFFICIAL = new Set<string>(FALLBACK_GLOBAL);

interface LibraryRow {
  id: string;
  site?: string;
  [k: string]: any;
}

export function usePlatformsByPopularity(): UsePlatformsByPopularityResult {
  const query = useQuery<LibraryRow[]>({
    queryKey: ['/api/tournament-library'],
    queryFn: () => apiRequest('GET', '/api/tournament-library') as any,
  });

  const sites = useMemo<string[]>(() => {
    const list = Array.isArray(query.data) ? query.data : [];

    // Conta distinct sites (apenas os do enum oficial).
    const counts = new Map<string, number>();
    for (const row of list) {
      const site = typeof row?.site === 'string' ? row.site : '';
      if (!site) continue;
      if (!ENUM_OFFICIAL.has(site)) continue;
      counts.set(site, (counts.get(site) ?? 0) + 1);
    }

    // Ordenacao: count desc, alfabetico tiebreak.
    const userSorted = Array.from(counts.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      })
      .map(([site]) => site);

    // Append fallback global pulando os ja listados.
    const seen = new Set(userSorted);
    const result = [...userSorted];
    for (const site of FALLBACK_GLOBAL) {
      if (!seen.has(site)) {
        result.push(site);
        seen.add(site);
      }
    }

    return result;
  }, [query.data]);

  return { sites, isLoading: query.isLoading };
}
