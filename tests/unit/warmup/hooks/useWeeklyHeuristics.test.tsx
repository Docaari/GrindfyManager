import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD (Sprint W-1): hooks/useWeeklyHeuristics (RF-22)
//
// API:
//   const { heuristics, isLoading, save, isSaving } = useWeeklyHeuristics();
//   - GET /api/user-settings (busca weeklyHeuristics atual)
//   - save(heuristics: [string,string,string]) -> PUT /api/user-settings/weekly-heuristics
//
// Status: red phase.
// =============================================================================

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/queryClient';
import { useWeeklyHeuristics } from '@/hooks/useWeeklyHeuristics';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const wrapper = ({ children }: { children: React.ReactNode }) =>
  withClient(children) as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useWeeklyHeuristics', () => {
  it('busca heuristicas iniciais via /api/user-settings', async () => {
    (apiRequest as any).mockResolvedValue({
      weeklyHeuristics: ['h1', 'h2', 'h3'],
    });

    const { result } = renderHook(() => useWeeklyHeuristics(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.heuristics).toEqual(['h1', 'h2', 'h3']);
  });

  it('heuristicas=null quando user-settings ainda nao tem', async () => {
    (apiRequest as any).mockResolvedValue({ weeklyHeuristics: null });

    const { result } = renderHook(() => useWeeklyHeuristics(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.heuristics).toBeNull();
  });

  it('save() faz PUT /api/user-settings/weekly-heuristics', async () => {
    (apiRequest as any)
      .mockResolvedValueOnce({ weeklyHeuristics: null })
      .mockResolvedValueOnce({ heuristics: ['n1', 'n2', 'n3'] });

    const { result } = renderHook(() => useWeeklyHeuristics(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.save(['n1', 'n2', 'n3']);
    });

    const calls = (apiRequest as any).mock.calls;
    const putCall = calls.find((args: any[]) =>
      JSON.stringify(args).includes('weekly-heuristics'),
    );
    expect(putCall).toBeTruthy();
  });
});
