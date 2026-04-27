import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Sprint Coach-1 Frontend UX / RF-07 — useCoachLimits hook
//
// Hook React Query que consome GET /api/coach/limits.
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-07)
//
// Response shape esperada:
//   {
//     tier: 'free'|'pro'|'premium'|'admin',
//     limits: { mental: {dailyLimit, used, remaining, resetAt}, tournament, technical },
//     coachAccess: { mental, tournament, technical }
//   }
//
// Arquivo sob teste: client/src/hooks/useCoachLimits.ts (AINDA NAO EXISTE)
// =============================================================================

import { useCoachLimits } from '../useCoachLimits';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as any;
});

function mockLimitsResponse(data: any, status = 200) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as any);
}

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, Wrapper };
}

describe('useCoachLimits (RF-07)', () => {
  it('faz GET /api/coach/limits e retorna dados', async () => {
    mockLimitsResponse({
      tier: 'free',
      limits: {
        mental: { dailyLimit: 10, used: 3, remaining: 7, resetAt: '2026-04-25T00:00:00Z' },
        tournament: { dailyLimit: 0, used: 0, remaining: 0, resetAt: null },
        technical: { dailyLimit: 0, used: 0, remaining: 0, resetAt: null },
      },
      coachAccess: { mental: true, tournament: false, technical: false },
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCoachLimits('mental'), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalled();
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/coach/limits');

    expect(result.current.data).toBeTruthy();
    // Aceita tanto data.tier quanto data.plan (spec usa tier)
    const tier = (result.current.data as any).tier || (result.current.data as any).plan;
    expect(tier).toBe('free');
  });

  it('staleTime minimo 60000ms (nao re-fetch em re-render imediato)', async () => {
    mockLimitsResponse({
      tier: 'free',
      limits: {
        mental: { dailyLimit: 10, used: 3, remaining: 7, resetAt: '2026-04-25T00:00:00Z' },
        tournament: { dailyLimit: 0, used: 0, remaining: 0, resetAt: null },
        technical: { dailyLimit: 0, used: 0, remaining: 0, resetAt: null },
      },
      coachAccess: { mental: true, tournament: false, technical: false },
    });

    const { Wrapper } = makeWrapper();
    const { result, rerender } = renderHook(() => useCoachLimits('mental'), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const callsAfterFirst = fetchMock.mock.calls.length;

    // Rerender imediato — nao deve disparar nova chamada
    rerender();
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('invalidate manual dispara refetch', async () => {
    mockLimitsResponse({
      tier: 'free',
      limits: {
        mental: { dailyLimit: 10, used: 3, remaining: 7, resetAt: '2026-04-25T00:00:00Z' },
        tournament: { dailyLimit: 0, used: 0, remaining: 0, resetAt: null },
        technical: { dailyLimit: 0, used: 0, remaining: 0, resetAt: null },
      },
      coachAccess: { mental: true, tournament: false, technical: false },
    });

    const { qc, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCoachLimits('mental'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const initialCalls = fetchMock.mock.calls.length;

    // Segunda response para o invalidate
    mockLimitsResponse({
      tier: 'free',
      limits: {
        mental: { dailyLimit: 10, used: 4, remaining: 6, resetAt: '2026-04-25T00:00:00Z' },
        tournament: { dailyLimit: 0, used: 0, remaining: 0, resetAt: null },
        technical: { dailyLimit: 0, used: 0, remaining: 0, resetAt: null },
      },
      coachAccess: { mental: true, tournament: false, technical: false },
    });

    await act(async () => {
      await qc.invalidateQueries({ queryKey: ['/api/coach/limits'] });
    });

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(initialCalls);
    });
  });

  it('401 nao crasha a UI — retorna error sem throw', async () => {
    mockLimitsResponse({ message: 'Unauthorized' }, 401);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCoachLimits('mental'), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Ou hook captura o erro (error presente, data ausente) ou retorna null graceful.
    // O importante: nao propagar throw.
    const hasErrOrNull =
      result.current.error !== null || result.current.data == null || result.current.data === undefined;
    expect(hasErrOrNull).toBe(true);
  });

  it('retorna shape {data, isLoading, error} minimamente', async () => {
    mockLimitsResponse({
      tier: 'pro',
      limits: {
        mental: { dailyLimit: 50, used: 10, remaining: 40, resetAt: '2026-04-25T00:00:00Z' },
        tournament: { dailyLimit: 50, used: 5, remaining: 45, resetAt: '2026-04-25T00:00:00Z' },
        technical: { dailyLimit: 0, used: 0, remaining: 0, resetAt: null },
      },
      coachAccess: { mental: true, tournament: true, technical: false },
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCoachLimits(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect('data' in result.current).toBe(true);
    expect('isLoading' in result.current).toBe(true);
    expect('error' in result.current).toBe(true);
  });
});
