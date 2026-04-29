import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint F4 W1 — useDayDetail hook (RF-01)
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (Parte E)
//
// useQuery -> GET /api/grade/day-detail/:profile/:dayOfWeek
// queryKey: ['day-detail', profileLetter, dayOfWeek]
// staleTime: 60_000 (1min)
// enabled: open && both valid
//
// Hook export: useDayDetail({ open, profileLetter, dayOfWeek })
// Returns: { data, isLoading, isError, error, refetch }
// =============================================================================

import { useDayDetail } from '../../client/src/hooks/useDayDetail';

const fetchSpy = vi.spyOn(global, 'fetch');

beforeEach(() => {
  fetchSpy.mockReset();
});

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useDayDetail', () => {
  it('enabled=false ate open=true', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          cards: { totalTournaments: 3, abiUsd: 5, investmentUsd: 15, bankrollNeeded: 500 },
          format: { pctPKO: 100, pctTurbo: 0, pctVanilla: 0 },
          volume: [],
          bankroll: [],
          list: [],
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(
      () => useDayDetail({ open: false, profileLetter: 'A', dayOfWeek: 2 }),
      { wrapper }
    );
    // Com open=false, o fetch nao deveria ser disparado
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it('open=true + valid params -> dispara fetch e retorna data', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          cards: { totalTournaments: 3, abiUsd: 5, investmentUsd: 15, bankrollNeeded: 500 },
          format: { pctPKO: 100, pctTurbo: 0, pctVanilla: 0 },
          volume: [],
          bankroll: [],
          list: [],
        }),
        { status: 200 }
      )
    );
    const { result } = renderHook(
      () => useDayDetail({ open: true, profileLetter: 'A', dayOfWeek: 2 }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.cards.totalTournaments).toBe(3);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('queryKey distinto por (profileLetter, dayOfWeek)', async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      const u = String(url);
      const profile = u.match(/day-detail\/([ABC])\//)?.[1];
      const day = u.match(/day-detail\/[ABC]\/(\d)/)?.[1];
      return new Response(
        JSON.stringify({
          cards: { totalTournaments: parseInt(day ?? '0'), abiUsd: 0, investmentUsd: 0, bankrollNeeded: 0 },
          format: { pctPKO: 0, pctTurbo: 0, pctVanilla: 0 },
          volume: [],
          bankroll: [],
          list: [],
          _profile: profile,
        }),
        { status: 200 }
      );
    });

    const { result, rerender } = renderHook(
      ({ profileLetter, dayOfWeek }) =>
        useDayDetail({ open: true, profileLetter, dayOfWeek }),
      {
        wrapper,
        initialProps: { profileLetter: 'A' as const, dayOfWeek: 2 },
      }
    );
    await waitFor(() => expect(result.current.data?.cards.totalTournaments).toBe(2));

    rerender({ profileLetter: 'B' as const, dayOfWeek: 5 });
    await waitFor(() =>
      expect(result.current.data?.cards.totalTournaments).toBe(5)
    );
  });
});
