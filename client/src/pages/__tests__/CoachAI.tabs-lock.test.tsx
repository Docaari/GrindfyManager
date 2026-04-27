import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint Coach-1 Frontend UX / RF-11 — Lock visual nas tabs
//
// User plan=free → Mental normal, Tournament com lock+badge "Pro", Technical com lock+badge "Premium"
// Click em tab bloqueada abre UpgradeCoachModal (nao muda tab ativa).
// User plan=pro → Mental + Tournament normais, Technical locked.
// User premium/admin → sem locks.
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-11)
// =============================================================================

const fetchMock = vi.fn();

function mountLimitsResponse(tier: 'free' | 'pro' | 'premium' | 'admin') {
  const access = {
    mental: true,
    tournament: tier !== 'free',
    technical: tier === 'premium' || tier === 'admin',
  };
  const limit = tier === 'free' ? 10 : tier === 'pro' ? 50 : 200;
  return {
    tier,
    limits: {
      mental: { dailyLimit: limit, used: 0, remaining: limit, resetAt: '2026-04-25T03:00:00Z' },
      tournament: {
        dailyLimit: access.tournament ? limit : 0,
        used: 0,
        remaining: access.tournament ? limit : 0,
        resetAt: '2026-04-25T03:00:00Z',
      },
      technical: {
        dailyLimit: access.technical ? limit : 0,
        used: 0,
        remaining: access.technical ? limit : 0,
        resetAt: '2026-04-25T03:00:00Z',
      },
    },
    coachAccess: access,
  };
}

function setupFetch(tier: 'free' | 'pro' | 'premium' | 'admin') {
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes('/api/coach/limits')) {
      return {
        ok: true,
        status: 200,
        json: async () => mountLimitsResponse(tier),
        text: async () => 'ok',
      } as any;
    }
    if (String(url).includes('/api/coach/sessions') && !String(url).includes('/messages')) {
      return {
        ok: true,
        status: 200,
        json: async () => [],
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

function getTab(name: RegExp): HTMLElement | null {
  const all = screen.queryAllByRole('tab');
  for (const tab of all) {
    if (name.test(tab.textContent || '')) return tab as HTMLElement;
  }
  return null;
}

// Detector mais preciso de "locked" — evita match falso com "disabled:opacity-50"
// que faz parte do style base de TabsTrigger do shadcn.
function isTabLocked(tab: HTMLElement): boolean {
  const cls = tab.className || '';
  // Match SOMENTE classes aplicadas (nao state-prefixed). Ex: "opacity-50" standalone
  // mas NAO "disabled:opacity-50" ou "data-[state=active]:opacity-50".
  const hasOpacityStandalone = /(^|\s)opacity-50(\s|$)/.test(cls);
  const hasCursorNotAllowed = /(^|\s)cursor-not-allowed(\s|$)/.test(cls);
  const ariaDisabled = tab.getAttribute('aria-disabled') === 'true';
  const dataLocked = tab.getAttribute('data-locked') === 'true';
  // Badges "Pro" ou "Premium" dentro do tab tambem indicam lock (RF-11)
  const hasLockBadge = /Pro|Premium/.test(tab.textContent || '');
  const hasLockIcon = !!tab.querySelector('svg[data-lock="true"], [data-testid="lock-icon"]');
  return (
    hasOpacityStandalone ||
    hasCursorNotAllowed ||
    ariaDisabled ||
    dataLocked ||
    hasLockBadge ||
    hasLockIcon
  );
}

describe('CoachAI — Tab locks (RF-11)', () => {
  describe('user plan=free', () => {
    it('Mental normal, Tournament com lock+badge Pro, Technical com lock+badge Premium', async () => {
      setupFetch('free');
      render(wrap(<CoachAI />));

      await waitFor(() => {
        expect(getTab(/Mental/i)).toBeTruthy();
      });

      const mental = getTab(/Mental/i)!;
      const tournament = getTab(/Torneios|Tournament/i)!;
      const technical = getTab(/Tecnico|Technical/i)!;

      // Mental nao deve estar locked
      expect(isTabLocked(mental)).toBe(false);
      // Tournament deve estar locked (badge Pro ou lock icon ou aria-disabled)
      expect(isTabLocked(tournament)).toBe(true);
      // Technical deve estar locked (badge Premium)
      expect(isTabLocked(technical)).toBe(true);
    });

    it('click em tab bloqueada abre UpgradeCoachModal e NAO muda tab ativa', async () => {
      setupFetch('free');
      const user = userEvent.setup();
      render(wrap(<CoachAI />));

      await waitFor(() => {
        expect(getTab(/Tecnico|Technical/i)).toBeTruthy();
      });

      const technical = getTab(/Tecnico|Technical/i)!;
      await user.click(technical);

      // Modal abriu
      await waitFor(() => {
        const dialog = document.querySelector('[role="dialog"]');
        expect(dialog).toBeTruthy();
      });

      // Tab ativa continua sendo a Mental (ou pelo menos NAO a Technical)
      const technicalState = technical.getAttribute('data-state');
      expect(technicalState).not.toBe('active');
    });
  });

  describe('user plan=pro', () => {
    it('Mental + Tournament normais, Technical com badge Premium', async () => {
      setupFetch('pro');
      render(wrap(<CoachAI />));

      await waitFor(() => {
        expect(getTab(/Mental/i)).toBeTruthy();
      });

      const tournament = getTab(/Torneios|Tournament/i)!;
      const technical = getTab(/Tecnico|Technical/i)!;

      expect(isTabLocked(tournament)).toBe(false);
      expect(isTabLocked(technical)).toBe(true);
    });
  });

  describe('user plan=premium', () => {
    it('nenhuma tab locked', async () => {
      setupFetch('premium');
      render(wrap(<CoachAI />));

      await waitFor(() => {
        expect(getTab(/Mental/i)).toBeTruthy();
      });

      for (const regex of [/Mental/i, /Torneios|Tournament/i, /Tecnico|Technical/i]) {
        const tab = getTab(regex)!;
        expect(isTabLocked(tab)).toBe(false);
      }
    });
  });

  describe('user plan=admin', () => {
    it('nenhuma tab locked', async () => {
      setupFetch('admin');
      render(wrap(<CoachAI />));

      await waitFor(() => {
        expect(getTab(/Mental/i)).toBeTruthy();
      });

      for (const regex of [/Mental/i, /Torneios|Tournament/i, /Tecnico|Technical/i]) {
        const tab = getTab(regex)!;
        expect(isTabLocked(tab)).toBe(false);
      }
    });
  });
});
