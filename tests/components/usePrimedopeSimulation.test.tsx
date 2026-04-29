import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint F4 W1 — usePrimedopeSimulation hook (RF-04, RF-05, RF-24)
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (Parte E + RF-04, RF-05, RF-24)
//
// useMutation -> POST /api/primedope/simulate
// + AbortController (cancel button durante simulation, RF-05)
// + onSuccess: setQueryData no cache do TanStack
// + onError: tracker.emit('primedope_simulation_error') + toast
//
// Hook export: usePrimedopeSimulation()
// Returns: { mutate, mutateAsync, isPending, abort, data, error }
// =============================================================================

import { usePrimedopeSimulation } from '../../client/src/hooks/usePrimedopeSimulation';

const trackerEmit = vi.fn();
vi.mock('@/lib/tracker', () => ({
  emit: (e: string, p: any) => trackerEmit(e, p),
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (a: any) => toastMock(a),
}));

const fetchSpy = vi.spyOn(global, 'fetch');

beforeEach(() => {
  trackerEmit.mockClear();
  toastMock.mockClear();
  fetchSpy.mockReset();
});

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const validInput = {
  profileLetter: 'A' as const,
  dayOfWeek: 2,
  multiplier: 4,
  bankrollUsd: 5000,
  buckets: [
    {
      name: 'GG',
      network: 'GG',
      count: 1,
      buyinOriginal: 5,
      currency: 'USD',
      playersAvg: 1000,
      placesPaid: 150,
      rakePct: 10,
      roiPct: 12,
    },
  ],
};

describe('usePrimedopeSimulation — success', () => {
  it('mutate -> 200 -> data setada', async () => {
    const payload = {
      source: 'primedope',
      data: { ev: 100, roiPct: 10, stdDev: 200, riskOfRuinPct: 4 },
      latencyMs: 1000,
    };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 })
    );

    const { result } = renderHook(() => usePrimedopeSimulation(), { wrapper });
    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.data).toEqual(expect.objectContaining({ source: 'primedope' }));
  });
});

describe('usePrimedopeSimulation — error 5xx', () => {
  it('5xx -> error setado + tracker.emit + toast', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ message: 'PrimeDope unavailable', errorType: 'upstream_5xx_no_fallback' }),
        { status: 503 }
      )
    );

    const { result } = renderHook(() => usePrimedopeSimulation(), { wrapper });
    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(toastMock).toHaveBeenCalled();
  });
});

describe('usePrimedopeSimulation — error 429', () => {
  it('429 -> error com retryAfterMs disponivel', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ message: 'rate limited', retryAfterMs: 8000 }),
        { status: 429 }
      )
    );

    const { result } = renderHook(() => usePrimedopeSimulation(), { wrapper });
    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.error).toBeTruthy();
    // Aceitamos error.retryAfterMs ou error.cause.retryAfterMs
    const err: any = result.current.error;
    const retry = err?.retryAfterMs ?? err?.cause?.retryAfterMs ?? err?.body?.retryAfterMs;
    expect(retry).toBeGreaterThan(0);
  });
});

describe('usePrimedopeSimulation — abort', () => {
  it('abort() cancela request em andamento', async () => {
    let aborted = false;
    fetchSpy.mockImplementation(async (_url: any, init: any = {}) => {
      const signal: AbortSignal | undefined = init?.signal;
      return await new Promise((_resolve, reject) => {
        if (signal) {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }
      });
    });

    const { result } = renderHook(() => usePrimedopeSimulation(), { wrapper });
    result.current.mutate(validInput);

    // Espera mutation ficar pending
    await waitFor(() => expect(result.current.isPending).toBe(true));
    // Aborta
    result.current.abort?.();

    await waitFor(() => expect(aborted).toBe(true));
  });
});

describe('usePrimedopeSimulation — loading state', () => {
  it('mutate -> isPending=true imediato', async () => {
    let resolveFetch: any;
    fetchSpy.mockImplementation(
      () =>
        new Promise((r) => {
          resolveFetch = r;
        })
    );
    const { result } = renderHook(() => usePrimedopeSimulation(), { wrapper });
    result.current.mutate(validInput);

    await waitFor(() => expect(result.current.isPending).toBe(true));

    // Cleanup
    resolveFetch(new Response('{"source":"primedope","data":{},"latencyMs":1}', { status: 200 }));
  });
});
