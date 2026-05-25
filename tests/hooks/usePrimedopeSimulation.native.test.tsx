/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint VR-1 — RF-04: Updated usePrimedopeSimulation hook
 *
 * Spec  : Docs/specs/sprint-variance-reform.md (RF-04)
 * ADR   : 211 (variance native monte carlo engine)
 *
 * Hook : client/src/hooks/usePrimedopeSimulation.ts (WILL BE MODIFIED)
 *
 * Changes from current:
 *   - Calls /api/variance/simulate (not /api/primedope/simulate)
 *   - No AbortController ref / cleanup
 *   - No rate limit check client-side
 *   - Invalidates 'home-overview' on success
 *   - Toast shows profitablePct + ev formatted
 *   - Simplified error handling (no 429/502 special treatment)
 *
 * Coverage:
 *   - Hook calls /api/variance/simulate endpoint
 *   - Success invalidates home-overview query
 *   - Success shows toast with profitablePct and ev
 *   - No AbortController (abort function removed from return)
 *   - Error handling simplified (generic toast)
 *   - Return shape: { mutate, mutateAsync, isPending, data, error }
 *   - No abort in return type
 *
 * Lessons applied:
 *   #14 vi.hoisted for mock spies in vi.mock factory
 *   #26 use import() not require() in .tsx test files
 *   #29 QueryClientProvider required for useQuery/useMutation
 *
 * Status RED: hook still calls /api/primedope/simulate with AbortController.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Mocks
// =============================================================================

const { trackerEmitMock, toastMock } = vi.hoisted(() => ({
  trackerEmitMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('@/lib/tracker', () => ({
  emit: (e: string, p: any) => trackerEmitMock(e, p),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (a: any) => toastMock(a),
}));

vi.mock('@/lib/queryClient', () => ({
  getCsrfToken: () => 'test-csrf-token',
  apiRequest: vi.fn(),
}));

const fetchSpy = vi.spyOn(globalThis, 'fetch');

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy.mockReset();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
  };
}

/** Native result payload (VarianceSimulationResult) */
const nativePayload = {
  source: 'native',
  ev: 10798,
  stdDev: 7200,
  profitablePct: 93.2,
  totalTournaments: 1440,
  totalInvested: 71988,
  percentiles: {
    p0_15: -12000, p2_5: -3171, p15: 3627, p30: 6927,
    p50: 10327, p70: 13727, p85: 17627, p97_5: 25227, p99_85: 33000,
  },
  drawdown: { mean: 4200, median: 2787, p95: 6737, p99: 12000, worst: 18273 },
  groupContributions: [],
  histogram: [],
  simulationsRun: 10000,
  elapsedMs: 310,
};

const validInput = {
  groups: [
    {
      name: 'G1',
      buyIn: 50,
      field: 1000,
      roi: 0.10,
      count: 100,
      isPKO: false,
    },
  ],
  weeks: 12 as const,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePrimedopeSimulation — native endpoint (RF-04)', () => {
  it('calls /api/variance/simulate (not /api/primedope/simulate)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(nativePayload), { status: 200 })
    );

    // Dynamic import to get the latest version
    const { usePrimedopeSimulation } = await import(
      '../../client/src/hooks/usePrimedopeSimulation'
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => usePrimedopeSimulation(), { wrapper });

    await act(async () => {
      result.current.mutate(validInput as any);
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    // Verify the URL is the new canonical endpoint
    const fetchUrl = fetchSpy.mock.calls[0][0];
    expect(fetchUrl).toContain('/api/variance/simulate');
    expect(fetchUrl).not.toContain('/api/primedope/simulate');
  });

  it('does NOT have abort function in return value', async () => {
    const { usePrimedopeSimulation } = await import(
      '../../client/src/hooks/usePrimedopeSimulation'
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => usePrimedopeSimulation(), { wrapper });

    // The refactored hook should not expose abort
    expect(result.current).not.toHaveProperty('abort');
    // But should still expose mutate and isPending
    expect(typeof result.current.mutate).toBe('function');
    expect(typeof result.current.isPending).toBe('boolean');
  });

  it('invalidates home-overview query on success', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(nativePayload), { status: 200 })
    );

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );
    }

    const { usePrimedopeSimulation } = await import(
      '../../client/src/hooks/usePrimedopeSimulation'
    );
    const { result } = renderHook(() => usePrimedopeSimulation(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate(validInput as any);
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: expect.arrayContaining(['home-overview']),
        })
      );
    });
  });

  it('shows toast with profitablePct and ev on success', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(nativePayload), { status: 200 })
    );

    const { usePrimedopeSimulation } = await import(
      '../../client/src/hooks/usePrimedopeSimulation'
    );
    const wrapper = createWrapper();
    const { result } = renderHook(() => usePrimedopeSimulation(), { wrapper });

    await act(async () => {
      result.current.mutate(validInput as any);
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });

    const toastCall = toastMock.mock.calls[0][0];
    // Toast should mention profitablePct or ev
    const toastText = JSON.stringify(toastCall).toLowerCase();
    expect(
      toastText.includes('93') || toastText.includes('lucro') || toastText.includes('10798')
    ).toBe(true);
  });

  it('shows generic error toast on failure (no 429/502 special handling)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Internal error' }), { status: 500 })
    );

    const { usePrimedopeSimulation } = await import(
      '../../client/src/hooks/usePrimedopeSimulation'
    );
    const wrapper = createWrapper();
    const { result } = renderHook(() => usePrimedopeSimulation(), { wrapper });

    await act(async () => {
      result.current.mutate(validInput as any);
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });

    const toastCall = toastMock.mock.calls[0][0];
    expect(toastCall.variant).toBe('destructive');
  });

  it('returns { mutate, mutateAsync, isPending, data, error } without abort', async () => {
    const { usePrimedopeSimulation } = await import(
      '../../client/src/hooks/usePrimedopeSimulation'
    );
    const wrapper = createWrapper();
    const { result } = renderHook(() => usePrimedopeSimulation(), { wrapper });

    expect(result.current).toHaveProperty('mutate');
    expect(result.current).toHaveProperty('mutateAsync');
    expect(result.current).toHaveProperty('isPending');
    expect(result.current).toHaveProperty('data');
    expect(result.current).toHaveProperty('error');
  });
});
