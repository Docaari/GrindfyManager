/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-12: StudyStreakBadge + bumpStudyStreak hook
 *
 * Spec:    Docs/specs/sprint-studies-reform.md (RF-12, D3, D10)
 * ADR-068: streak persistencia (db ou localStorage fallback)
 *
 * Lessons:
 *   #1 hooks first
 *   #3 mocks shape REAL — payload {days, last_activity_at, heatmap_last_7_days}
 *  #12 estado persistente via TanStack Query cache
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: any[]) => apiRequestMock(...a),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
  getCsrfToken: () => null,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userPlatformId: 'USER-0001' } }),
}));

// @ts-expect-error - red phase
import { StudyStreakBadge } from '../StudyStreakBadge';
// @ts-expect-error - red phase
import { useBumpStudyStreak } from '@/hooks/useBumpStudyStreak';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const todayIso = new Date().toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  apiRequestMock.mockImplementation(async (url: string, opts: any = {}) => {
    if (url.includes('/api/study/streak/bump')) {
      return { days: 1, last_activity_at: todayIso, bumped: true };
    }
    if (url.includes('/api/study/streak')) {
      return {
        days: 5,
        last_activity_at: todayIso,
        heatmap_last_7_days: [
          { date: '2026-04-25', active: true },
          { date: '2026-04-26', active: true },
          { date: '2026-04-27', active: false },
          { date: '2026-04-28', active: true },
          { date: '2026-04-29', active: true },
          { date: '2026-04-30', active: true },
          { date: '2026-05-01', active: true },
        ],
      };
    }
    return null;
  });
  global.fetch = vi.fn(async (url: any, opts: any) => {
    const data = await apiRequestMock(String(url), opts);
    return new Response(JSON.stringify(data), { status: 200 });
  }) as any;
});

describe('RF-12 StudyStreakBadge — render', () => {
  it('renderiza data-testid="study-streak-badge"', async () => {
    render(withClient(<StudyStreakBadge />));
    await waitFor(() => {
      expect(screen.getByTestId('study-streak-badge')).toBeInTheDocument();
    });
  });

  it('exibe numero de dias (5)', async () => {
    render(withClient(<StudyStreakBadge />));
    await waitFor(() => {
      expect(screen.getByTestId('study-streak-badge').textContent).toMatch(/5/);
    });
  });

  it('estado visual 1-2 dias: cor azul (data-state="starting")', async () => {
    apiRequestMock.mockImplementation(async () => ({
      days: 2, last_activity_at: todayIso, heatmap_last_7_days: [],
    }));
    render(withClient(<StudyStreakBadge />));
    await waitFor(() => {
      expect(screen.getByTestId('study-streak-badge').getAttribute('data-state')).toBe('starting');
    });
  });

  it('estado 3-6 dias: data-state="building"', async () => {
    apiRequestMock.mockImplementation(async () => ({
      days: 5, last_activity_at: todayIso, heatmap_last_7_days: [],
    }));
    render(withClient(<StudyStreakBadge />));
    await waitFor(() => {
      expect(screen.getByTestId('study-streak-badge').getAttribute('data-state')).toBe('building');
    });
  });

  it('estado 7-29 dias: data-state="fire"', async () => {
    apiRequestMock.mockImplementation(async () => ({
      days: 15, last_activity_at: todayIso, heatmap_last_7_days: [],
    }));
    render(withClient(<StudyStreakBadge />));
    await waitFor(() => {
      expect(screen.getByTestId('study-streak-badge').getAttribute('data-state')).toBe('fire');
    });
  });

  it('estado 30+ dias: data-state="freeze"', async () => {
    apiRequestMock.mockImplementation(async () => ({
      days: 35, last_activity_at: todayIso, heatmap_last_7_days: [],
    }));
    render(withClient(<StudyStreakBadge />));
    await waitFor(() => {
      expect(screen.getByTestId('study-streak-badge').getAttribute('data-state')).toBe('freeze');
    });
  });

  it('estado 0 dias: data-state="inactive"', async () => {
    apiRequestMock.mockImplementation(async () => ({
      days: 0, last_activity_at: null, heatmap_last_7_days: [],
    }));
    render(withClient(<StudyStreakBadge />));
    await waitFor(() => {
      expect(screen.getByTestId('study-streak-badge').getAttribute('data-state')).toBe('inactive');
    });
  });
});

describe('RF-12 useBumpStudyStreak hook', () => {
  it('hook chama POST /api/study/streak/bump', async () => {
    const wrapper = ({ children }: any) => withClient(children) as any;
    const { result } = renderHook(() => useBumpStudyStreak(), { wrapper });
    await act(async () => {
      await result.current.bump();
    });
    const calls = apiRequestMock.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('/api/study/streak/bump'))).toBe(true);
  });

  it('idempotente: bump no mesmo dia retorna mesmo days (mock simula noop server-side)', async () => {
    apiRequestMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/study/streak/bump')) {
        return { days: 5, last_activity_at: todayIso, bumped: false };
      }
      return null;
    });
    const wrapper = ({ children }: any) => withClient(children) as any;
    const { result } = renderHook(() => useBumpStudyStreak(), { wrapper });
    let payload: any;
    await act(async () => {
      payload = await result.current.bump();
    });
    expect(payload?.bumped).toBe(false);
  });

  it('localStorage fallback (D10): se API falha, usa localStorage', async () => {
    apiRequestMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/study/streak/bump')) {
        throw new Error('500');
      }
      if (url.includes('/api/study/streak')) {
        throw new Error('500');
      }
      return null;
    });
    const wrapper = ({ children }: any) => withClient(children) as any;
    const { result } = renderHook(() => useBumpStudyStreak(), { wrapper });
    await act(async () => {
      try { await result.current.bump(); } catch {}
    });
    // localStorage tem fallback chave
    const stored = localStorage.getItem('grindfy:studies:streak');
    expect(stored).toBeTruthy();
  });
});
