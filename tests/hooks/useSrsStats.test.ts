/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spot-Anki-Reentry-3 — Hook useSrsStats (RF-5 SrsStatsCard)
 *
 * Cobertura RED:
 *   - useSrsStats() retorna { stats, isLoading, isError }.
 *   - GET /api/reentry/stats queryKey estavel.
 *   - Cache stale 60s + refetchOnWindowFocus=true.
 *
 * Status RED: client/src/hooks/useSrsStats.ts NAO existe.
 *
 * Lessons:
 *   #14 await import
 *   #30 hook test em .test.ts roda em jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
}));

beforeEach(() => {
  apiRequestMock.mockReset();
});

async function loadHook() {
  const mod: any = await import('../../client/src/hooks/useSrsStats');
  return mod.useSrsStats;
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useSrsStats — basic', () => {
  it('exporta useSrsStats', async () => {
    const useSrsStats = await loadHook();
    expect(typeof useSrsStats).toBe('function');
  });

  it('chama GET /api/reentry/stats', async () => {
    apiRequestMock.mockResolvedValue({
      pendingToday: 5, reviewedLast7Days: 23, accuracyLast7Days: 0.87, streakDays: 4,
    });
    const useSrsStats = await loadHook();
    renderHook(() => useSrsStats(), { wrapper });
    await waitFor(() => {
      const calls = JSON.stringify(apiRequestMock.mock.calls);
      expect(calls).toMatch(/\/api\/reentry\/stats/);
    });
  });

  it('retorna shape { stats, isLoading, isError }', async () => {
    apiRequestMock.mockResolvedValue({
      pendingToday: 5, reviewedLast7Days: 23, accuracyLast7Days: 0.87, streakDays: 4,
    });
    const useSrsStats = await loadHook();
    const { result } = renderHook(() => useSrsStats(), { wrapper });
    await waitFor(() => {
      expect(result.current).toHaveProperty('stats');
      expect(result.current).toHaveProperty('isLoading');
    });
  });

  it('apos load: stats.pendingToday=5', async () => {
    apiRequestMock.mockResolvedValue({
      pendingToday: 5, reviewedLast7Days: 23, accuracyLast7Days: 0.87, streakDays: 4,
    });
    const useSrsStats = await loadHook();
    const { result } = renderHook(() => useSrsStats(), { wrapper });
    await waitFor(() => {
      expect(result.current.stats?.pendingToday).toBe(5);
    });
  });
});

describe('useSrsStats — error tolerance (lesson #29)', () => {
  it('isError=true quando query falha (sem crash)', async () => {
    apiRequestMock.mockRejectedValue(new Error('boom'));
    const useSrsStats = await loadHook();
    const { result } = renderHook(() => useSrsStats(), { wrapper });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
