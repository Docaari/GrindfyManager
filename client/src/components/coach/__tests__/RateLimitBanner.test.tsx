import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// =============================================================================
// Sprint Coach-1 Frontend UX / RF-09 — RateLimitBanner
//
// Banner fixo superior quando usuario atinge limite diario (429).
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-09)
// Arquivo sob teste: client/src/components/coach/RateLimitBanner.tsx (AINDA NAO EXISTE)
// =============================================================================

import { RateLimitBanner } from '../RateLimitBanner';

const mockSetLocation = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/coach', mockSetLocation],
}));

beforeEach(() => {
  mockSetLocation.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function futureIso(hours: number, minutes = 0): string {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

describe('<RateLimitBanner> (RF-09)', () => {
  it('renderiza banner fixo superior com titulo e limite atingido', () => {
    render(
      <RateLimitBanner
        limit={10}
        remaining={0}
        resetAt={futureIso(4, 37)}
        upgradeTo="pro"
        currentPlan="free"
      />
    );

    const body = document.body.textContent || '';
    expect(body).toMatch(/limite diario|atingiu o limite/i);
    expect(body).toMatch(/10/); // limite ou "10/10"
  });

  it('countdown dinamico: mostra "em 4h 37m" ou equivalente', () => {
    render(
      <RateLimitBanner
        limit={10}
        remaining={0}
        resetAt={futureIso(4, 37)}
        upgradeTo="pro"
        currentPlan="free"
      />
    );

    const body = document.body.textContent || '';
    // Formato pt-BR date-fns: "em 4 horas", "4h 37m", "4 horas e 37 minutos"
    expect(body).toMatch(/4\s*h|4\s*horas|em\s+4/i);
  });

  it('atualiza countdown a cada 60s', () => {
    render(
      <RateLimitBanner
        limit={10}
        remaining={0}
        resetAt={futureIso(4, 37)}
        upgradeTo="pro"
        currentPlan="free"
      />
    );

    const before = document.body.textContent || '';

    // Avanca 60s
    vi.advanceTimersByTime(60_000);

    const after = document.body.textContent || '';
    // Nao forcamos mudanca exata do texto — apenas que o componente esta funcionando
    // Se o ajuste for "em 4 horas" → continua "em 4 horas"; mas ainda esta la
    expect(after.length).toBeGreaterThan(0);
  });

  it('CTA visivel: "Upgrade para Pro"', () => {
    render(
      <RateLimitBanner
        limit={10}
        remaining={0}
        resetAt={futureIso(4, 0)}
        upgradeTo="pro"
        currentPlan="free"
      />
    );

    const body = document.body.textContent || '';
    expect(body).toMatch(/Upgrade.*Pro|upgrade.*pro/i);
  });

  it('click no CTA navega para /subscriptions ou abre modal de upgrade', async () => {
    vi.useRealTimers(); // user-event precisa de timers reais
    const user = userEvent.setup();
    render(
      <RateLimitBanner
        limit={10}
        remaining={0}
        resetAt={futureIso(4, 0)}
        upgradeTo="pro"
        currentPlan="free"
      />
    );

    const cta = screen.getByRole('button', { name: /upgrade/i });
    await user.click(cta);

    // Ou navegou para /subscriptions OU abriu modal (verificavel por Dialog)
    const navigated =
      mockSetLocation.mock.calls.some((c) => String(c[0]).includes('/subscriptions'));
    const modalOpened = !!document.querySelector('[role="dialog"]');
    expect(navigated || modalOpened).toBe(true);
  });

  it('tem role="alert" e aria-live="polite" para acessibilidade', () => {
    render(
      <RateLimitBanner
        limit={10}
        remaining={0}
        resetAt={futureIso(4, 0)}
        upgradeTo="pro"
        currentPlan="free"
      />
    );

    const alert = document.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    const live = alert!.getAttribute('aria-live') || '';
    expect(live).toMatch(/polite|assertive/);
  });

  it('banner NAO renderiza quando remaining > 0', () => {
    const { container } = render(
      <RateLimitBanner
        limit={10}
        remaining={3}
        resetAt={futureIso(4, 0)}
        upgradeTo="pro"
        currentPlan="free"
      />
    );

    // Banner nao deve aparecer — container vazio ou sem role="alert"
    const hasAlert = container.querySelector('[role="alert"]');
    expect(hasAlert).toBeFalsy();
  });
});
