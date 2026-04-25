import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD (Sprint W-1): Fluxo D — /grind bloqueado sem warm-up recente
//
// Fonte: spec secao 10.4
//        RF-14: gate de "Iniciar Grind" em /grind
//
// Cenario:
//   1. Usuario tenta iniciar sessao em /grind sem ritual recente.
//   2. useWarmupGate retorna canStartGrind=false.
//   3. UI deve mostrar dialog/CTA para ir a /mental.
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

describe('Fluxo D - /grind sem warm-up recente', () => {
  it('useWarmupGate retorna canStartGrind=false quando server retorna null', async () => {
    (apiRequest as any).mockResolvedValue(null);

    const { result } = renderHook(() => useWarmupGate(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.canStartGrind).toBe(false);
    expect(result.current.reason).toBe('no_recent_warmup');
  });

  it('useWarmupGate retorna canStartGrind=false quando ritual aborted', async () => {
    // Server filtra aborted no /latest, retornando null
    (apiRequest as any).mockResolvedValue(null);

    const { result } = renderHook(() => useWarmupGate(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.canStartGrind).toBe(false);
  });

  it('useWarmupGate canStartGrind=true quando ritual recente valido', async () => {
    (apiRequest as any).mockResolvedValue({
      id: 'r-1',
      version: 'full',
      decisionToPlay: true,
      overrideUsed: false,
      completedAt: new Date().toISOString(),
    });

    const { result } = renderHook(() => useWarmupGate(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.canStartGrind).toBe(true);
  });
});
