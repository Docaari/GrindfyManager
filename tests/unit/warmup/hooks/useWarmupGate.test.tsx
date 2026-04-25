import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD (Sprint W-1): hooks/useWarmupGate (RF-13, RF-14, T-12)
//
// Contrato:
//   const { canStartGrind, latestRitual, reason, isLoading } = useWarmupGate();
//
//   - Faz GET /api/warmup-rituals/latest via React Query.
//   - latestRitual = WarmupRitual | null
//   - canStartGrind = (latestRitual !== null) && (decisionToPlay === true)
//   - reason: 'ritual_ok' | 'no_recent_warmup' | 'loading' | 'gate_no_go'
//
// Status: red phase.
// =============================================================================

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/queryClient';
import { useWarmupGate } from '@/hooks/useWarmupGate';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const wrapper = ({ children }: { children: React.ReactNode }) =>
  withClient(children) as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useWarmupGate', () => {
  it('canStartGrind=true quando ritual recente com decisionToPlay=true', async () => {
    const ritual = {
      id: 'r-1',
      version: 'full',
      decisionToPlay: true,
      overrideUsed: false,
      emotionalCheckScore: 8,
      completedAt: new Date().toISOString(),
    };
    (apiRequest as any).mockResolvedValue(ritual);

    const { result } = renderHook(() => useWarmupGate(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.canStartGrind).toBe(true);
    expect(result.current.latestRitual).toEqual(ritual);
    expect(result.current.reason).toBe('ritual_ok');
  });

  it('canStartGrind=false e reason=no_recent_warmup quando server retorna null', async () => {
    (apiRequest as any).mockResolvedValue(null);

    const { result } = renderHook(() => useWarmupGate(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.canStartGrind).toBe(false);
    expect(result.current.latestRitual).toBeNull();
    expect(result.current.reason).toBe('no_recent_warmup');
  });

  it('canStartGrind=true mesmo com overrideUsed=true (override valido)', async () => {
    const overrideRitual = {
      id: 'r-2',
      version: 'full',
      decisionToPlay: true,
      overrideUsed: true,
      emotionalCheckScore: 4,
      completedAt: new Date().toISOString(),
    };
    (apiRequest as any).mockResolvedValue(overrideRitual);

    const { result } = renderHook(() => useWarmupGate(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.canStartGrind).toBe(true);
  });

  it('canStartGrind=false quando ritual existe mas decisionToPlay=false', async () => {
    // (caso teorico: server geralmente filtra; mas hook deve ser defensivo)
    const decidedNot = {
      id: 'r-3',
      version: 'full',
      decisionToPlay: false,
      overrideUsed: false,
      emotionalCheckScore: 4,
      completedAt: new Date().toISOString(),
    };
    (apiRequest as any).mockResolvedValue(decidedNot);

    const { result } = renderHook(() => useWarmupGate(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.canStartGrind).toBe(false);
  });

  it('chama GET /api/warmup-rituals/latest', async () => {
    (apiRequest as any).mockResolvedValue(null);
    renderHook(() => useWarmupGate(), { wrapper });

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalled();
    });

    const calls = (apiRequest as any).mock.calls;
    const matched = calls.some((args: any[]) =>
      JSON.stringify(args).includes('/api/warmup-rituals/latest'),
    );
    expect(matched).toBe(true);
  });

  it('isLoading=true durante fetch', () => {
    (apiRequest as any).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useWarmupGate(), { wrapper });
    expect(result.current.isLoading).toBe(true);
  });
});
