/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1-5 — RF-22.1 + RF-22.6 (B1 DailyInsight componente UI).
 *
 * Spec : Docs/specs/home-reform-1-5.md §RF-22.1, §RF-22.6, §RNF-1.5-6
 * ADR  : Docs/architecture/decisions/106-home-daily-insight-rule-engine.md
 *
 * Status RED: componente NAO existe em
 * `client/src/components/home/DailyInsight.tsx`.
 *
 * Lessons aplicadas:
 *   #14  await import(...) em vez de require — ESM compat
 *   #15  vi.mock no top-level (sem nested vi.unmock)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock wouter Link p/ assertion de navigation
// ---------------------------------------------------------------------------
const mockNavigate = vi.fn();
vi.mock('wouter', () => ({
  Link: ({ href, children, onClick, ...rest }: any) => (
    <a
      href={href}
      onClick={(e: any) => {
        mockNavigate(href);
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
  useLocation: () => ['/', vi.fn()],
}));

// ---------------------------------------------------------------------------
// Mock tracker — RNF-1.5-6
// ---------------------------------------------------------------------------
const mockEmit = vi.fn();
vi.mock('@/lib/tracker', () => ({
  emit: (...args: any[]) => mockEmit(...args),
}));

beforeEach(() => {
  mockNavigate.mockReset();
  mockEmit.mockReset();
});

// ---------------------------------------------------------------------------
// Fixture base
// ---------------------------------------------------------------------------
function baseData(overrides: Record<string, any> = {}) {
  return {
    statusStrip: {
      banca: null,
      roi30d: { value: 5, sparkline: [] },
      today: null,
      pendencias: null,
    },
    today: null,
    banners: { cooldown: null, flight: null },
    nextTournament: null,
    lifetime: { totalTournaments: 100, totalSessions: 30, activeDays: 50, currentStreakDays: 0 },
    recentSessions: [
      { id: 'S1', date: new Date().toISOString().slice(0, 10), pnlUsd: 0, tournamentCount: 0, primaryPlatform: 'GG', status: 'finalized' },
    ],
    performance: { roi: 5, itm: 18, cash: 22, sparkline: [], period: '30d' },
    pendingHands: [],
    news: { enabled: false, items: [] },
    profile: 'hybrid',
    profileMeta: { totalUploads: 100, totalSessions: 30, sessionTournamentCount: 30, detectedAt: '' },
    meta: { generatedAt: '2026-05-03T12:00:00Z', cacheHit: false, subqueryTimingsMs: {} },
    userState: 'power',
    ...overrides,
  };
}

// =============================================================================
// Renderizacao base — RF-22.1 + RF-22.6
// =============================================================================

describe('<DailyInsight /> — render base', () => {
  it('renderiza container com data-testid="home-daily-insight"', async () => {
    const { default: DailyInsight } = await import('../DailyInsight');
    render(<DailyInsight data={baseData() as any} />);
    expect(screen.getByTestId('home-daily-insight')).toBeInTheDocument();
  });

  it('renderiza CTA com data-testid="home-daily-insight-cta"', async () => {
    const { default: DailyInsight } = await import('../DailyInsight');
    render(<DailyInsight data={baseData() as any} />);
    expect(screen.getByTestId('home-daily-insight-cta')).toBeInTheDocument();
  });

  it('CTA tem atributo href para SEO/a11y', async () => {
    const { default: DailyInsight } = await import('../DailyInsight');
    render(<DailyInsight data={baseData() as any} />);
    const cta = screen.getByTestId('home-daily-insight-cta');
    expect(cta.getAttribute('href')).toBeTruthy();
  });
});

// =============================================================================
// Severity colors via tokens — RF-22.6
// =============================================================================

describe('<DailyInsight /> — severity styling', () => {
  it('severity critical (cooldown ativo) aplica classe de aviso', async () => {
    const { default: DailyInsight } = await import('../DailyInsight');
    const data = baseData({
      banners: { cooldown: { active: true, until: '2026-05-04T00:00:00Z', type: 'stop-loss' }, flight: null },
    });
    const { container } = render(<DailyInsight data={data as any} />);
    const card = screen.getByTestId('home-daily-insight');
    // Aceita warning/danger/amber ou um data-severity="critical"
    const sevAttr = card.getAttribute('data-severity');
    expect(
      sevAttr === 'critical' || /warning|amber|danger/.test(card.className) || /warning|amber|danger/.test(container.innerHTML),
    ).toBe(true);
  });

  it('severity neutral (fallback) aplica visual neutro (sem amber/danger)', async () => {
    const { default: DailyInsight } = await import('../DailyInsight');
    const data = baseData(); // fallback
    render(<DailyInsight data={data as any} />);
    const card = screen.getByTestId('home-daily-insight');
    const sevAttr = card.getAttribute('data-severity');
    expect(sevAttr === 'neutral' || sevAttr === undefined || sevAttr === null || sevAttr === '').toBeTruthy();
  });
});

// =============================================================================
// Tracker — emit('home_insight_view') no mount
// =============================================================================

describe('<DailyInsight /> — tracker home_insight_view', () => {
  it('emit("home_insight_view") 1x no mount com type+severity no payload', async () => {
    const { default: DailyInsight } = await import('../DailyInsight');
    const data = baseData({
      banners: { cooldown: { active: true, until: '2026-05-04T00:00:00Z', type: 'stop-loss' }, flight: null },
    });
    render(<DailyInsight data={data as any} />);
    const calls = mockEmit.mock.calls.filter((c) => c[0] === 'home_insight_view');
    expect(calls.length).toBe(1);
    const payload = calls[0][1] || {};
    expect(payload).toHaveProperty('insightType');
    // severity opcional — ADR-106 exporta InsightSeverity
    expect(payload).toHaveProperty('severity');
  });

  it('emit("home_insight_click") quando CTA eh clicado', async () => {
    const { default: DailyInsight } = await import('../DailyInsight');
    render(<DailyInsight data={baseData() as any} />);
    const cta = screen.getByTestId('home-daily-insight-cta');
    fireEvent.click(cta);
    const calls = mockEmit.mock.calls.filter((c) => c[0] === 'home_insight_click');
    expect(calls.length).toBe(1);
  });
});

// =============================================================================
// Click navega para insight.cta.href
// =============================================================================

describe('<DailyInsight /> — navegacao CTA', () => {
  it('cooldown ativo => CTA navega para /estudos', async () => {
    const { default: DailyInsight } = await import('../DailyInsight');
    const data = baseData({
      banners: { cooldown: { active: true, until: '2026-05-04T00:00:00Z', type: 'stop-loss' }, flight: null },
    });
    render(<DailyInsight data={data as any} />);
    const cta = screen.getByTestId('home-daily-insight-cta');
    fireEvent.click(cta);
    expect(mockNavigate).toHaveBeenCalledWith('/estudos');
  });

  it('fallback => CTA navega para /coach-ai', async () => {
    const { default: DailyInsight } = await import('../DailyInsight');
    render(<DailyInsight data={baseData() as any} />);
    const cta = screen.getByTestId('home-daily-insight-cta');
    fireEvent.click(cta);
    expect(mockNavigate).toHaveBeenCalledWith('/coach-ai');
  });
});

// =============================================================================
// Engine garante nunca-vazio: componente nunca retorna null
// =============================================================================

describe('<DailyInsight /> — sempre renderiza algo (engine fallback)', () => {
  it('mesmo com data=null/undefined => renderiza fallback (sem throw)', async () => {
    const { default: DailyInsight } = await import('../DailyInsight');
    expect(() => render(<DailyInsight data={null as any} />)).not.toThrow();
    expect(screen.getByTestId('home-daily-insight')).toBeInTheDocument();
  });
});
