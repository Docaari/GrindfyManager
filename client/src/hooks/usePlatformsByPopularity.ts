/**
 * usePlatformsByPopularity — Sprint coach-page-reform-1 RF-05.2.
 * Spec: Docs/specs/sprint-coach-page-reform-1.md §RF-05.2 (Path B — hook client-side).
 *
 * Mostra apenas sites que tem torneios na biblioteca do usuario.
 * Ordenado por contagem (mais populares primeiro).
 *
 * Sites permitidos: PokerStars, GGPoker, WPN, PartyPoker, 888poker, iPoker,
 *   CoinPoker, Chico, Bodog, WPT Global
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface UsePlatformsByPopularityResult {
  sites: string[];
  isLoading: boolean;
}

/** Sites permitidos na Biblioteca. */
const ALLOWED_SITES: string[] = [
  'PokerStars',
  'GGPoker',
  'WPN',
  'PartyPoker',
  '888poker',
  'iPoker',
  'CoinPoker',
  'Chico',
  'Bodog',
  'WPT',
];

/** Conjunto de sites permitidos para filtragem. */
const ALLOWED_SET = new Set<string>(ALLOWED_SITES);

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

    // Conta distinct sites (apenas os permitidos).
    const counts = new Map<string, number>();
    for (const row of list) {
      const site = typeof row?.site === 'string' ? row.site : '';
      if (!site) continue;
      if (!ALLOWED_SET.has(site)) continue;
      counts.set(site, (counts.get(site) ?? 0) + 1);
    }

    // Ordenacao: count desc, alfabetico tiebreak.
    const userSorted = Array.from(counts.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      })
      .map(([site]) => site);

    return userSorted;
  }, [query.data]);

  return { sites, isLoading: query.isLoading };
}
