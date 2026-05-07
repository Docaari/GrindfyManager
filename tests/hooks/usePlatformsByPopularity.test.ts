/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint coach-page-reform-1 — RF-05.2: usePlatformsByPopularity hook.
 * Spec: Docs/specs/sprint-coach-page-reform-1.md §RF-05.2.
 * UX audit: Docs/ux-audit-2026-05-07/biblioteca-quick-filters.md §2.5.
 *
 * Path B (recomendado pelo PM): hook client-side que consome
 * /api/tournament-library existente e calcula ordem desc por count distinto
 * de tournaments.site (filtrado por grind_session_id IS NULL — backend ja faz).
 *
 * Saida: { sites: string[] } ordenado por:
 *   1. Sites do user, descendente por count.
 *   2. Sites do enum global fallback que ainda nao apareceram.
 *   3. Sites do enum oficial restantes em ordem alfabetica.
 *
 * Fallback global (founder confirmou):
 *   PokerStars, GGPoker, WPN, PartyPoker, 888poker, iPoker, CoinPoker,
 *   Chico, Bodog, Suprema, Revolution.
 *
 * Lessons:
 *   #3 — mock shape REAL do storage; library response e array de tournament
 *        objects com `site: string`.
 *   #14 — usar await import(); RED phase tolerante.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock apiRequest.
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { apiRequest } from '@/lib/queryClient';

async function loadHook() {
  // @ts-expect-error - red phase: arquivo ainda nao implementado
  const mod: any = await import('@/hooks/usePlatformsByPopularity');
  return mod.usePlatformsByPopularity as () => { sites: string[]; isLoading: boolean };
}

function withClient(): React.FC<{ children: React.ReactNode }> {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }) => React.createElement(QueryClientProvider, { client: qc }, children);
}

const FALLBACK_GLOBAL = [
  'PokerStars', 'GGPoker', 'WPN', 'PartyPoker', '888poker',
  'iPoker', 'CoinPoker', 'Chico', 'Bodog', 'Suprema', 'Revolution',
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePlatformsByPopularity — happy path', () => {
  it('retorna ordem desc por count quando user tem historico', async () => {
    // Mock 10 PokerStars + 5 GGPoker + 1 WPN.
    const tournaments = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `ps-${i}`, site: 'PokerStars' })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `gg-${i}`, site: 'GGPoker' })),
      ...Array.from({ length: 1 }, (_, i) => ({ id: `wpn-${i}`, site: 'WPN' })),
    ];
    (apiRequest as any).mockResolvedValue(tournaments);

    const usePlatformsByPopularity = await loadHook();
    const wrapper = withClient();
    const { result } = renderHook(() => usePlatformsByPopularity(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Os 3 primeiros devem estar ordenados por popularidade.
    expect(result.current.sites.slice(0, 3)).toEqual(['PokerStars', 'GGPoker', 'WPN']);
  });
});

describe('usePlatformsByPopularity — fallback global', () => {
  it('user com zero historico retorna fallback exato', async () => {
    (apiRequest as any).mockResolvedValue([]);

    const usePlatformsByPopularity = await loadHook();
    const wrapper = withClient();
    const { result } = renderHook(() => usePlatformsByPopularity(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Os 11 primeiros devem ser exatamente o fallback global na ordem.
    expect(result.current.sites.slice(0, 11)).toEqual(FALLBACK_GLOBAL);
  });
});

describe('usePlatformsByPopularity — historico parcial', () => {
  it('historico parcial: chips do user vem primeiro, depois fallback sem duplicar', async () => {
    // User jogou apenas WPN (3x) e GGPoker (10x).
    const tournaments = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `gg-${i}`, site: 'GGPoker' })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `wpn-${i}`, site: 'WPN' })),
    ];
    (apiRequest as any).mockResolvedValue(tournaments);

    const usePlatformsByPopularity = await loadHook();
    const wrapper = withClient();
    const { result } = renderHook(() => usePlatformsByPopularity(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // GGPoker > WPN (por count). Depois, fallback global na ordem,
    // PULANDO GGPoker e WPN (ja listados).
    expect(result.current.sites[0]).toBe('GGPoker');
    expect(result.current.sites[1]).toBe('WPN');

    // Nao deve ter duplicatas.
    const unique = new Set(result.current.sites);
    expect(unique.size).toBe(result.current.sites.length);

    // PokerStars deve aparecer (em algum lugar apos GGPoker e WPN).
    expect(result.current.sites).toContain('PokerStars');
  });
});

describe('usePlatformsByPopularity — sites fora do enum', () => {
  it('ignora sites que nao estao no enum oficial nem no historico esperado', async () => {
    // Edge: import legado pode ter site "FooBarPoker".
    const tournaments = [
      { id: '1', site: 'FooBarPoker' },
      { id: '2', site: 'PokerStars' },
    ];
    (apiRequest as any).mockResolvedValue(tournaments);

    const usePlatformsByPopularity = await loadHook();
    const wrapper = withClient();
    const { result } = renderHook(() => usePlatformsByPopularity(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // FooBarPoker deve ser omitido (nao esta no enum oficial).
    expect(result.current.sites).not.toContain('FooBarPoker');
    // PokerStars deve aparecer.
    expect(result.current.sites).toContain('PokerStars');
  });
});

describe('usePlatformsByPopularity — memoizacao / referencia estavel', () => {
  it('retorna mesma referencia de array quando lib nao muda', async () => {
    const tournaments = [{ id: '1', site: 'PokerStars' }];
    (apiRequest as any).mockResolvedValue(tournaments);

    const usePlatformsByPopularity = await loadHook();
    const wrapper = withClient();
    const { result, rerender } = renderHook(() => usePlatformsByPopularity(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const firstSites = result.current.sites;
    rerender();
    const secondSites = result.current.sites;

    expect(secondSites).toBe(firstSites);
  });
});
