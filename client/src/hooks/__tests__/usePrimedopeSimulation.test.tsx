/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Variance-1 — RF-07 (client-side invalidate /api/home/overview pos-simulacao)
 *
 * Spec : Docs/specs/sprint-variance-1.md §RF-07
 * ADR  : 164 §2.3 (client-side trigger 3 do hibrido)
 *
 * Hoje `usePrimedopeSimulation.onSuccess` (linhas 138-145) chama apenas
 * `queryClient.setQueryData(['primedope-simulation', ...])` para cache local.
 * RF-07 exige tambem invalidar `['/api/home/overview']` para que a
 * VarianceCard re-renderize com `expectedSource: 'primedope-cache'` apos
 * o user simular.
 *
 * Status RED: invalidate adicional NAO existe no hook.
 *
 * Lessons:
 *   #14 await import()
 *   #29 QueryClientProvider obrigatorio
 *   #5  vi.fn() ok (sem `new`)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as any;
});

// Mock CSRF helper.
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async () => ({})),
  getCsrfToken: () => 'csrf-token-mock',
  queryClient: { invalidateQueries: vi.fn() },
}));

// Mock toast — sem ruido.
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock tracker.
vi.mock('@/lib/tracker', () => ({
  emit: vi.fn(),
}));

// Capturar invocacoes de invalidateQueries — pega o queryClient real do
// QueryClientProvider via spy.
let invalidateSpy: any = null;

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, Wrapper };
}

// =============================================================================
// RF-07 — invalidate ['/api/home/overview'] on success
// =============================================================================

describe('usePrimedopeSimulation — RF-07 invalida home-overview no onSuccess', () => {
  it('mutation success -> queryClient.invalidateQueries(["/api/home/overview"])', async () => {
    // Mock fetch para retornar payload valido do simulate.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          source: 'primedope',
          data: { ev: 500, stdDev: 200 },
          latencyMs: 1234,
          inputHash: 'hash-1',
          runId: 'RUN-1',
          cacheHit: false,
        }),
    } as any);

    const { Wrapper } = makeWrapper();
    const { usePrimedopeSimulation } = await import('../usePrimedopeSimulation');
    const { result } = renderHook(() => usePrimedopeSimulation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({
        profileLetter: 'A',
        dayOfWeek: 1,
        multiplier: 1,
        bankrollUsd: 1000,
        buckets: [
          {
            name: 'X',
            network: 'GG',
            count: 5,
            buyinOriginal: 10,
            currency: 'USD',
            playersAvg: 100,
            placesPaid: 15,
            rakePct: 10,
            roiPct: 0,
          },
        ],
      });
    });

    // Aguarda mutation resolver.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // Verifica que invalidateQueries foi chamado com a queryKey correta.
    await waitFor(() => {
      const homeOverviewCalls = invalidateSpy.mock.calls.filter((call: any[]) => {
        const arg = call[0];
        const qk = arg?.queryKey ?? arg;
        if (Array.isArray(qk)) {
          return qk[0] === '/api/home/overview';
        }
        return false;
      });
      expect(homeOverviewCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('mutation error -> NAO invalida home-overview (so success path)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ message: 'err' }),
    } as any);

    const { Wrapper } = makeWrapper();
    const { usePrimedopeSimulation } = await import('../usePrimedopeSimulation');
    const { result } = renderHook(() => usePrimedopeSimulation(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({
        profileLetter: 'A',
        dayOfWeek: 1,
        multiplier: 1,
        bankrollUsd: 1000,
        buckets: [],
      });
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // invalidateSpy NAO deve ter sido chamado com '/api/home/overview'.
    const homeOverviewCalls = invalidateSpy.mock.calls.filter((call: any[]) => {
      const arg = call[0];
      const qk = arg?.queryKey ?? arg;
      if (Array.isArray(qk)) {
        return qk[0] === '/api/home/overview';
      }
      return false;
    });
    expect(homeOverviewCalls.length).toBe(0);
  });
});
