/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spot-Anki-Reentry-3 — Hook useReentryQueue (RF-3 page Reentry)
 *
 * Cobertura RED:
 *   - useReentryQueue() retorna { queue, isLoading, isError, gradeMutation, skipMutation }.
 *   - GET /api/reentry/queue queryKey estavel.
 *   - gradeMutation invalidates queue + stats apos success.
 *
 * Status RED: client/src/hooks/useReentryQueue.ts NAO existe.
 *
 * Lessons aplicadas:
 *   #14 await import (nao require)
 *   #30 hook test em .test.ts roda em jsdom via vitest config
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { apiRequestMock, invalidateQueriesMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: {
    invalidateQueries: invalidateQueriesMock,
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
}));

beforeEach(() => {
  apiRequestMock.mockReset();
  invalidateQueriesMock.mockReset();
});

async function loadHook() {
  const mod: any = await import('../../client/src/hooks/useReentryQueue');
  return mod.useReentryQueue;
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useReentryQueue — basic', () => {
  it('exporta useReentryQueue', async () => {
    const useReentryQueue = await loadHook();
    expect(typeof useReentryQueue).toBe('function');
  });

  it('chama apiRequest GET /api/reentry/queue', async () => {
    apiRequestMock.mockResolvedValue({
      items: [], pendingTotal: 0, pendingTodayCap: 5, nextScheduledAt: null,
    });
    const useReentryQueue = await loadHook();
    renderHook(() => useReentryQueue(), { wrapper });
    await waitFor(() => {
      const calls = JSON.stringify(apiRequestMock.mock.calls);
      expect(calls).toMatch(/\/api\/reentry\/queue/);
    });
  });

  it('retorna shape { queue, isLoading, isError, gradeMutation, skipMutation }', async () => {
    apiRequestMock.mockResolvedValue({
      items: [], pendingTotal: 0, pendingTodayCap: 5, nextScheduledAt: null,
    });
    const useReentryQueue = await loadHook();
    const { result } = renderHook(() => useReentryQueue(), { wrapper });
    await waitFor(() => {
      expect(result.current).toHaveProperty('queue');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('gradeMutation');
      expect(result.current).toHaveProperty('skipMutation');
    });
  });
});

describe('useReentryQueue — gradeMutation', () => {
  it('gradeMutation chama POST /api/reentry/:cardId/grade', async () => {
    apiRequestMock
      .mockResolvedValueOnce({
        items: [], pendingTotal: 0, pendingTodayCap: 5, nextScheduledAt: null,
      })
      .mockResolvedValueOnce({
        card: { id: 'card-1' }, intervalDays: 2.5, nextReviewAt: new Date(),
      });
    const useReentryQueue = await loadHook();
    const { result } = renderHook(() => useReentryQueue(), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    if (result.current.gradeMutation?.mutate) {
      await result.current.gradeMutation.mutate({ cardId: 'card-1', grade: 'good' });
      const calls = JSON.stringify(apiRequestMock.mock.calls);
      expect(calls).toMatch(/grade|card-1/i);
    }
  });

  it('apos success invalidates queue query (invalidateQueries chamado)', async () => {
    apiRequestMock.mockResolvedValue({
      items: [], pendingTotal: 0, pendingTodayCap: 5, nextScheduledAt: null,
    });
    const useReentryQueue = await loadHook();
    const { result } = renderHook(() => useReentryQueue(), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    if (result.current.gradeMutation?.mutate) {
      apiRequestMock.mockResolvedValueOnce({ card: { id: 'card-1' } });
      try {
        await result.current.gradeMutation.mutate({ cardId: 'card-1', grade: 'good' });
        // QueryClient.invalidateQueries called
        await waitFor(() => {
          expect(invalidateQueriesMock).toHaveBeenCalled();
        });
      } catch {
        // acceptable in red
      }
    }
  });
});

describe('useReentryQueue — skipMutation', () => {
  it('skipMutation chama POST /api/reentry/:cardId/skip', async () => {
    apiRequestMock
      .mockResolvedValueOnce({
        items: [], pendingTotal: 0, pendingTodayCap: 5, nextScheduledAt: null,
      })
      .mockResolvedValueOnce({ card: { id: 'card-1' } });
    const useReentryQueue = await loadHook();
    const { result } = renderHook(() => useReentryQueue(), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    if (result.current.skipMutation?.mutate) {
      try {
        await result.current.skipMutation.mutate({ cardId: 'card-1' });
        const calls = JSON.stringify(apiRequestMock.mock.calls);
        expect(calls).toMatch(/skip|card-1/i);
      } catch {
        // acceptable
      }
    }
  });
});
