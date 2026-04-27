import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint Coach-1 Frontend UX / RF-08 — LimitCounter no header do coach
//
// Contador "X/Y hoje" (ou "Ilimitado") integrado em CoachAI.tsx.
// Cores:
//   - remaining/dailyLimit > 0.4: verde
//   - entre 0.1 e 0.4: ambar
//   - <= 0.1: vermelho
// Premium/admin/dailyLimit>=1000 → "Ilimitado"
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-08)
//
// MEDIUM-9 fix: testes usam data-testid="limit-counter" (estavel) ao inves de
// heuristica DOM via findCounterByText + parentElement.className. Isso permite
// remover o LimitCounterWrapper / spacers / rootColorClass de producao.
// =============================================================================

const fetchMock = vi.fn();

function defaultSessions() {
  return [];
}

function mountLimitsResponse(tier: string, mentalLimit: number, mentalUsed: number) {
  const remaining = Math.max(0, mentalLimit - mentalUsed);
  return {
    tier,
    limits: {
      mental: {
        dailyLimit: mentalLimit,
        used: mentalUsed,
        remaining,
        resetAt: '2026-04-25T03:00:00Z',
      },
      tournament: {
        dailyLimit: tier === 'free' ? 0 : mentalLimit,
        used: 0,
        remaining: tier === 'free' ? 0 : mentalLimit,
        resetAt: '2026-04-25T03:00:00Z',
      },
      technical: {
        dailyLimit: tier === 'premium' || tier === 'admin' ? mentalLimit : 0,
        used: 0,
        remaining: tier === 'premium' || tier === 'admin' ? mentalLimit : 0,
        resetAt: '2026-04-25T03:00:00Z',
      },
    },
    coachAccess: {
      mental: true,
      tournament: tier !== 'free',
      technical: tier === 'premium' || tier === 'admin',
    },
  };
}

function setupFetch(tier: string, mentalLimit: number, mentalUsed: number) {
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes('/api/coach/limits')) {
      return {
        ok: true,
        status: 200,
        json: async () => mountLimitsResponse(tier, mentalLimit, mentalUsed),
        text: async () => 'ok',
      } as any;
    }
    if (String(url).includes('/api/coach/sessions') && !String(url).includes('/messages')) {
      return {
        ok: true,
        status: 200,
        json: async () => defaultSessions(),
        text: async () => '[]',
      } as any;
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' } as any;
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as any;
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/coach', vi.fn()],
}));

import CoachAI from '../CoachAI';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('CoachAI — LimitCounter (RF-08)', () => {
  it('free com used=3/10 mostra "3/10 hoje" em verde', async () => {
    setupFetch('free', 10, 3);
    render(wrap(<CoachAI />));

    await waitFor(() => {
      expect(screen.getByTestId('limit-counter')).toBeTruthy();
    });

    const el = screen.getByTestId('limit-counter');
    expect(el.textContent || '').toMatch(/3\s*\/\s*10\s*hoje/);
    expect(el.className).toMatch(/green/);
  });

  it('free com used=8/10 mostra "8/10 hoje" em ambar', async () => {
    setupFetch('free', 10, 8);
    render(wrap(<CoachAI />));

    await waitFor(() => {
      expect(screen.getByTestId('limit-counter')).toBeTruthy();
    });
    const el = screen.getByTestId('limit-counter');
    expect(el.textContent || '').toMatch(/8\s*\/\s*10\s*hoje/);
    expect(el.className).toMatch(/amber|yellow/);
  });

  it('free com used=10/10 mostra "10/10 hoje" em vermelho', async () => {
    setupFetch('free', 10, 10);
    render(wrap(<CoachAI />));

    await waitFor(() => {
      expect(screen.getByTestId('limit-counter')).toBeTruthy();
    });
    const el = screen.getByTestId('limit-counter');
    expect(el.textContent || '').toMatch(/10\s*\/\s*10\s*hoje/);
    expect(el.className).toMatch(/red/);
  });

  it('pro com used=43/50 mostra "43/50 hoje" (cor por ratio)', async () => {
    setupFetch('pro', 50, 43);
    render(wrap(<CoachAI />));

    await waitFor(() => {
      expect(screen.getByTestId('limit-counter')).toBeTruthy();
    });
    const el = screen.getByTestId('limit-counter');
    expect(el.textContent || '').toMatch(/43\s*\/\s*50\s*hoje/);
  });

  it('premium mostra "Ilimitado" sem contador numerico', async () => {
    // Premium = dailyLimit 1000+ → "Ilimitado"
    setupFetch('premium', 1000, 50);
    render(wrap(<CoachAI />));

    await waitFor(() => {
      expect(screen.getByTestId('limit-counter')).toBeTruthy();
    });

    const el = screen.getByTestId('limit-counter');
    expect(el.textContent || '').toMatch(/Ilimitado/);
    // Nao deve ter "50/1000 hoje" visivel
    expect(el.textContent || '').not.toMatch(/50\s*\/\s*1000\s*hoje/);
  });

  it('admin mostra "Ilimitado"', async () => {
    setupFetch('admin', 999, 300);
    render(wrap(<CoachAI />));

    await waitFor(() => {
      expect(screen.getByTestId('limit-counter')).toBeTruthy();
    });
    const el = screen.getByTestId('limit-counter');
    expect(el.textContent || '').toMatch(/Ilimitado/);
  });

  it('hover no contador abre tooltip mencionando reset', async () => {
    setupFetch('free', 10, 7);
    const user = userEvent.setup();
    render(wrap(<CoachAI />));

    await waitFor(() => {
      expect(screen.getByTestId('limit-counter')).toBeTruthy();
    });

    const el = screen.getByTestId('limit-counter');
    await user.hover(el);

    // Aceita title attribute OU elemento tooltip com texto de reset
    await waitFor(() => {
      const title = el.getAttribute('title') || '';
      const body = document.body.textContent || '';
      const hasReset =
        /Reseta|reseta|em \d+h|horas|ilimitado/i.test(title) ||
        /Reseta|reseta\s+em/i.test(body);
      expect(hasReset).toBe(true);
    });
  });
});
