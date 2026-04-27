import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint Coach-1 Frontend UX / RF-13 — Toast "poucas mensagens restantes"
//
// Quando remaining <= 2: toast informativo dispara UMA vez por dia (sessionStorage).
// Quando remaining = 0: toast NAO dispara (RateLimitBanner cobre).
// tier=admin ou dailyLimit>=1000: nao dispara.
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-13)
// =============================================================================

const fetchMock = vi.fn();
const toastMock = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (args: any) => toastMock(args),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/coach', vi.fn()],
}));

function setupLimits(remaining: number, tier: string = 'free', dailyLimit: number = 10) {
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes('/api/coach/limits')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tier,
          limits: {
            mental: {
              dailyLimit,
              used: dailyLimit - remaining,
              remaining,
              resetAt: '2026-04-25T03:00:00Z',
            },
            tournament: { dailyLimit: 0, used: 0, remaining: 0, resetAt: null },
            technical: { dailyLimit: 0, used: 0, remaining: 0, resetAt: null },
          },
          coachAccess: { mental: true, tournament: false, technical: false },
        }),
        text: async () => 'ok',
      } as any;
    }
    if (String(url).includes('/api/coach/sessions') && !String(url).includes('/messages')) {
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' } as any;
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' } as any;
  });
}

// Mock sessionStorage
function mockSessionStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  const api = {
    getItem: vi.fn((k: string) => (k in store ? store[k] : null)),
    setItem: vi.fn((k: string, v: string) => {
      store[k] = v;
    }),
    removeItem: vi.fn((k: string) => {
      delete store[k];
    }),
    clear: vi.fn(() => {
      for (const k of Object.keys(store)) delete store[k];
    }),
    key: vi.fn((i: number) => Object.keys(store)[i] || null),
    get length() {
      return Object.keys(store).length;
    },
  };
  Object.defineProperty(window, 'sessionStorage', { value: api, writable: true, configurable: true });
  return api;
}

beforeEach(() => {
  fetchMock.mockReset();
  toastMock.mockReset();
  global.fetch = fetchMock as any;
  mockSessionStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
});

import CoachAI from '../CoachAI';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('CoachAI — Low-remaining toast (RF-13)', () => {
  it('remaining=2: toast dispara na primeira vez', async () => {
    setupLimits(2, 'free', 10);
    render(wrap(<CoachAI />));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });

    const payload = JSON.stringify(toastMock.mock.calls[0][0]);
    expect(payload).toMatch(/2\s*mensagens?|restantes|sobrando|Ver planos/i);
  });

  it('com flag em sessionStorage: toast NAO dispara', async () => {
    // Pre-setar a flag — usamos um conjunto de keys comuns para cobrir variantes:
    mockSessionStorage({
      'coach-low-warning-mental': String(Date.now()),
      'coach-low-remaining-toasted': '1',
      // Com data de hoje (spec tambem menciona essa variante)
      [`coach-low-warning-mental-${new Date().toISOString().slice(0, 10)}`]: '1',
    });

    setupLimits(2, 'free', 10);
    render(wrap(<CoachAI />));

    // Dar tempo para o effect rodar sem disparar toast
    await new Promise((r) => setTimeout(r, 50));

    // Toast nao deve ter sido chamado (ou pelo menos nao com copy de "restantes")
    const lowToastCalled = toastMock.mock.calls.some((c) => {
      const text = JSON.stringify(c[0]);
      return /restantes|sobrando|2 mensagens/i.test(text);
    });
    expect(lowToastCalled).toBe(false);
  });

  it('remaining=0: toast de "poucas mensagens" NAO dispara (banner cobre)', async () => {
    setupLimits(0, 'free', 10);
    render(wrap(<CoachAI />));

    await new Promise((r) => setTimeout(r, 50));

    // Nao deve ter sido chamado toast com copy de "poucas mensagens restantes"
    const lowToastCalled = toastMock.mock.calls.some((c) => {
      const text = JSON.stringify(c[0]);
      return /poucas.*restante|mensagens.*sobrando|Voce tem \d+ mensagem/i.test(text);
    });
    expect(lowToastCalled).toBe(false);
  });

  it('tier=admin com remaining=1: toast NAO dispara (admin ilimitado)', async () => {
    setupLimits(1, 'admin', 200);
    render(wrap(<CoachAI />));

    await new Promise((r) => setTimeout(r, 50));

    const lowToastCalled = toastMock.mock.calls.some((c) => {
      const text = JSON.stringify(c[0]);
      return /restante|sobrando|mensagens/i.test(text);
    });
    expect(lowToastCalled).toBe(false);
  });
});
