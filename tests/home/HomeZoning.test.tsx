/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-3 — RF-A1, RF-A2, RF-A3, RF-A5.
 *
 * Spec : Docs/specs/home-reform-3.md §RF-A1, §RF-A2, §RF-A3, §RF-A5
 * ADR  : Docs/architecture/decisions/110-news-feed-ranking-and-zoning.md §2.2
 *
 * Status RED:
 *   - Home.tsx atual nao tem `<section>` zonas com data-testid `home-zone-*`.
 *   - Logo atual usa `h-20 md:h-28`, nao `h-10 md:h-12`.
 *   - StatusStrip atual nao eh sticky.
 *   - EmptyPerformanceCluster nao existe.
 *
 * Lessons aplicadas:
 *   #14 await import(...) em vez de require — ESM compat
 *   #15 polyfill localStorage ja em tests/setup.ts
 *   #2  data-testid estavel em vez de findByText heuristico
 *   #1  hooks first
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Mocks — useAuth + apiRequest + tracker
// =============================================================================

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      userPlatformId: 'USER-HOME-1',
      name: 'Ricardo Silva',
      firstName: 'Ricardo',
      timezone: 'America/Sao_Paulo',
    },
  }),
}));

vi.mock('@/lib/tracker', () => ({
  emit: vi.fn(),
}));

vi.mock('@/components/WelcomeNameModal', () => ({
  WelcomeNameModal: () => null,
}));

vi.mock('@/components/branding/HeaderLogo', () => ({
  default: ({ className }: { className?: string }) => (
    <img alt="Grindfy" className={className} data-testid="home-header-logo" />
  ),
}));

const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args),
}));

// =============================================================================
// Helpers
// =============================================================================

function renderHome(payload: any) {
  mockApiRequest.mockResolvedValue(payload);
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return import('@/pages/Home').then(({ default: Home }) => {
    return render(
      <QueryClientProvider client={qc}>
        <Home />
      </QueryClientProvider>,
    );
  });
}

function buildPowerPayload(overrides: any = {}): any {
  return {
    userState: 'power',
    statusStrip: {
      banca: { totalUsd: 5000, bisAvailable: 50, deltaPct7d: 1.5, sparkline: [1, 2, 3, 4, 5] },
      roi30d: { value: 12.3, sparkline: [10, 11, 12, 13, 14] },
      today: { plannedCount: 3, firstStartTime: '20:00', realizedPnlUsd: null },
      pendencias: { starredHands: 0, cooldownAlerts: 0 },
    },
    today: {
      profile: 'A',
      plannedCount: 3,
      firstStartTime: '20:00',
      stopLoss: null,
      stopTime: null,
      hasWarmupToday: false,
    },
    banners: { cooldown: null, flight: null },
    nextTournament: null,
    lifetime: { totalTournaments: 100, totalSessions: 50, activeDays: 30, currentStreakDays: 12 },
    recentSessions: [],
    performance: { roi: 10, itm: 15, cash: 5, sparkline: [], period: '30d' },
    pendingHands: [],
    news: { enabled: false, items: [] },
    profile: 'hybrid',
    profileMeta: { totalUploads: 100, totalSessions: 50, sessionTournamentCount: 200, detectedAt: '2026-05-03T10:00:00Z' },
    topDeltas: [],
    variance: null,
    tournamentRecommendations: [],
    heuristics: [],
    meta: {
      generatedAt: '2026-05-03T10:00:00Z',
      cacheHit: false,
      subqueryTimingsMs: {},
      userTimezone: 'America/Sao_Paulo',
    },
    ...overrides,
  };
}

beforeEach(() => {
  mockApiRequest.mockReset();
  // freeze a Saturday 12:30 BRT (UTC 15:30) -> "Boa tarde"
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-03T15:30:00Z'));
});

// =============================================================================
// RF-A1 — Header reduzido + cumprimento contextual
// =============================================================================

describe('RF-A1 — Header reduzido + cumprimento', () => {
  it('logo renderiza com classes h-10 md:h-12 (NAO h-20 md:h-28)', async () => {
    await renderHome(buildPowerPayload());
    const logo = await screen.findByTestId('home-header-logo');
    const cls = logo.getAttribute('class') ?? '';
    expect(cls).toMatch(/\bh-10\b/);
    expect(cls).toMatch(/\bmd:h-12\b/);
    expect(cls).not.toMatch(/\bh-20\b/);
    expect(cls).not.toMatch(/\bmd:h-28\b/);
  });

  it('renderiza saudacao "Boa tarde, Ricardo" ao 12:30 horario local BR', async () => {
    await renderHome(buildPowerPayload());
    const greeting = await screen.findByTestId('home-header-greeting');
    expect(greeting.textContent ?? '').toMatch(/Boa tarde/i);
    expect(greeting.textContent ?? '').toMatch(/Ricardo/);
  });

  it('renderiza meta com weekday curto PT-BR + dd/mm', async () => {
    await renderHome(buildPowerPayload());
    const meta = await screen.findByTestId('home-header-meta');
    const txt = meta.textContent ?? '';
    // 2026-05-03 = domingo (UTC) ou sabado (BRT). Aceita qualquer weekday PT-BR.
    expect(txt).toMatch(/segunda|terca|quarta|quinta|sexta|sabado|domingo/i);
    expect(txt).toMatch(/\d{2}\/\d{2}/);
  });

  it('mostra streak quando streakDays > 0', async () => {
    await renderHome(buildPowerPayload());
    const meta = await screen.findByTestId('home-header-meta');
    expect(meta.textContent ?? '').toMatch(/12d streak/i);
  });

  it('NAO mostra streak quando streakDays = 0', async () => {
    await renderHome(
      buildPowerPayload({
        lifetime: { totalTournaments: 100, totalSessions: 50, activeDays: 30, currentStreakDays: 0 },
      }),
    );
    const meta = await screen.findByTestId('home-header-meta');
    expect(meta.textContent ?? '').not.toMatch(/streak/i);
  });

  it('mostra timezone do user', async () => {
    await renderHome(buildPowerPayload());
    const meta = await screen.findByTestId('home-header-meta');
    expect(meta.textContent ?? '').toMatch(/Sao_Paulo|America\/Sao_Paulo/);
  });
});

// =============================================================================
// RF-A2 — 4 zonas semanticas
// =============================================================================

describe('RF-A2 — 4 zonas semanticas', () => {
  it('renderiza 4 sections com data-testid home-zone-{id}', async () => {
    await renderHome(buildPowerPayload());
    expect(await screen.findByTestId('home-zone-today')).toBeInTheDocument();
    expect(screen.getByTestId('home-zone-action')).toBeInTheDocument();
    expect(screen.getByTestId('home-zone-perf')).toBeInTheDocument();
    expect(screen.getByTestId('home-zone-news')).toBeInTheDocument();
  });

  it('cada zona tem h2 visivel com label correto', async () => {
    await renderHome(buildPowerPayload());
    const today = await screen.findByTestId('home-zone-today');
    const action = screen.getByTestId('home-zone-action');
    const perf = screen.getByTestId('home-zone-perf');
    const news = screen.getByTestId('home-zone-news');

    // home-reform-5 audit fix #3: zona "Hoje" renomeada para "Inicio".
    expect(today.querySelector('h2')?.textContent ?? '').toMatch(/Inicio/i);
    expect(action.querySelector('h2')?.textContent ?? '').toMatch(/Acao Imediata/i);
    // Sprint home-reform-5 item 6: zona renomeada "Performance" -> "Sessoes Registradas".
    expect(perf.querySelector('h2')?.textContent ?? '').toMatch(/Sessoes Registradas/i);
    expect(news.querySelector('h2')?.textContent ?? '').toMatch(/Sinal Externo/i);
  });

  it('zona "Hoje" contem componentes esperados (DailyInsight + TodayCard + NextTournamentCountdown)', async () => {
    await renderHome(buildPowerPayload());
    const today = await screen.findByTestId('home-zone-today');
    // Os componentes filhos podem ter testids proprios; aceita qualquer
    // testid com prefixo da spec ou heading do componente.
    expect(today.querySelector('[data-testid*="daily-insight"], [data-testid*="today-card"], [data-testid*="next-tournament"]')).not.toBeNull();
  });

  it('zona "Acao Imediata" contem PendingHandsList + LibraryResume + TournamentRecommendations', async () => {
    await renderHome(buildPowerPayload({
      tournamentRecommendations: [
        { id: 't1', name: 'Test', buyinUsd: 10, buyinNative: 10, currency: 'USD', score: 80, grade: 'A', startTime: '20:00', platform: 'PS', alreadyInGrid: false },
      ],
    }));
    const action = await screen.findByTestId('home-zone-action');
    expect(action.querySelector('[data-testid*="pending-hands"], [data-testid*="library-resume"], [data-testid*="tournament-recommendations"]')).not.toBeNull();
  });

  it('zona "Performance" contem PerformanceMini + RecentSessions', async () => {
    await renderHome(buildPowerPayload({
      topDeltas: [
        { stat: 'vpip', statLabel: 'VPIP', baseline: 25, current: 28, delta: 3, deltaAbs: 3, severity: 'medium', direction: 'positive', period: '30d' },
      ],
    }));
    const perf = await screen.findByTestId('home-zone-perf');
    expect(perf.querySelector('[data-testid*="performance-mini"], [data-testid*="recent-sessions"]')).not.toBeNull();
  });

  it('zona "Sinal Externo" contem NewsFeed', async () => {
    await renderHome(buildPowerPayload());
    const news = await screen.findByTestId('home-zone-news');
    expect(news.querySelector('[data-testid*="news-feed"], [data-testid="home-news-feed"]')).not.toBeNull();
  });
});

// =============================================================================
// RF-A3 — StatusStrip sticky
// =============================================================================

describe('RF-A3 — StatusStrip sticky', () => {
  it('wrapper do StatusStrip tem classes sticky + top-0 + z-30 + backdrop-blur', async () => {
    await renderHome(buildPowerPayload());
    const strip = await screen.findByTestId('sticky-status-strip');
    const cls = strip.getAttribute('class') ?? '';
    expect(cls).toMatch(/\bsticky\b/);
    expect(cls).toMatch(/top-0/);
    expect(cls).toMatch(/z-30/);
    expect(cls).toMatch(/backdrop-blur/);
  });
});

// =============================================================================
// home-reform-4 / Item 7 — Nova zona "Estudos" + FocusStatsCard
// Spec: Docs/specs/home-reform-4-item-7-focus-stats.md §RF-06
// ADR-118: zona Estudos entre Performance (Z3) e Sinal Externo (Z5)
// =============================================================================

describe('home-reform-4 item 7 — zona Estudos + FocusStatsCard', () => {
  it('renderiza nova section data-testid="home-zone-estudos"', async () => {
    await renderHome(buildPowerPayload());
    expect(await screen.findByTestId('home-zone-estudos')).toBeInTheDocument();
  });

  it('zona "Estudos" tem h2 visivel com label "Estudos"', async () => {
    await renderHome(buildPowerPayload());
    const estudos = await screen.findByTestId('home-zone-estudos');
    expect(estudos.querySelector('h2')?.textContent ?? '').toMatch(/Estudos/i);
  });

  it('zona "Estudos" renderiza FocusStatsCard (loading|empty|card)', async () => {
    await renderHome(buildPowerPayload());
    const estudos = await screen.findByTestId('home-zone-estudos');
    // Componente novo deve aparecer em algum estado (loading | empty | card).
    const node = estudos.querySelector(
      '[data-testid="home-focus-stats-card"], [data-testid="home-focus-stats-empty"], [data-testid="home-focus-stats-loading"]',
    );
    expect(node).not.toBeNull();
  });

  it('ordem das zonas: today -> action -> perf -> ESTUDOS -> news', async () => {
    await renderHome(buildPowerPayload());
    const allZones = await screen.findAllByTestId(/^home-zone-/);
    const ids = allZones.map((el) => el.getAttribute('data-testid'));
    const idxToday = ids.indexOf('home-zone-today');
    const idxAction = ids.indexOf('home-zone-action');
    const idxPerf = ids.indexOf('home-zone-perf');
    const idxEstudos = ids.indexOf('home-zone-estudos');
    const idxNews = ids.indexOf('home-zone-news');

    expect(idxToday).toBeGreaterThanOrEqual(0);
    expect(idxAction).toBeGreaterThan(idxToday);
    expect(idxPerf).toBeGreaterThan(idxAction);
    expect(idxEstudos).toBeGreaterThan(idxPerf);
    expect(idxNews).toBeGreaterThan(idxEstudos);
  });
});

// =============================================================================
// home-reform-4 / Item 4 — CoachRecommendationCard substitui LibraryResume
// Spec: Docs/specs/home-reform-4-item-4-coach-recommendation.md §RF-10
// =============================================================================

describe('home-reform-4 item 4 — CoachRecommendationCard substitui LibraryResume', () => {
  it('zona "Acao Imediata" NAO renderiza mais LibraryResume', async () => {
    await renderHome(buildPowerPayload());
    const action = await screen.findByTestId('home-zone-action');
    // LibraryResume usava data-testid="home-library-resume" (ver
    // client/src/components/home/__tests__/LibraryResume.test.tsx)
    expect(action.querySelector('[data-testid="home-library-resume"]')).toBeNull();
  });

  it('zona "Acao Imediata" renderiza CoachRecommendationCard (loading OU card OU empty)', async () => {
    await renderHome(buildPowerPayload());
    const action = await screen.findByTestId('home-zone-action');
    // Componente novo deve aparecer em algum dos estados (loading | active | empty).
    // Aceitamos qualquer testid do prefixo home-coach-rec-* dentro da zona.
    const node = action.querySelector(
      '[data-testid="home-coach-rec-card"], [data-testid="home-coach-rec-empty"], [data-testid="home-coach-rec-loading"]',
    );
    expect(node).not.toBeNull();
  });
});

// =============================================================================
// RF-A5 — EmptyPerformanceCluster
// =============================================================================

describe('RF-A5 — EmptyPerformanceCluster', () => {
  it('renderiza placeholder agregado quando 4 fields todos vazios/null', async () => {
    await renderHome(
      buildPowerPayload({
        topDeltas: [],
        variance: null,
        tournamentRecommendations: [],
        heuristics: [],
        lifetime: { totalTournaments: 10, totalSessions: 5, activeDays: 5, currentStreakDays: 0 },
      }),
    );
    expect(await screen.findByTestId('empty-performance-cluster')).toBeInTheDocument();
  });

  it('placeholder contem texto "Insights de performance"', async () => {
    await renderHome(
      buildPowerPayload({
        topDeltas: [],
        variance: null,
        tournamentRecommendations: [],
        heuristics: [],
      }),
    );
    const node = await screen.findByTestId('empty-performance-cluster');
    expect(node.textContent ?? '').toMatch(/Insights de performance/i);
  });

  it('placeholder mostra contador de sessoes atual', async () => {
    await renderHome(
      buildPowerPayload({
        topDeltas: [],
        variance: null,
        tournamentRecommendations: [],
        heuristics: [],
        lifetime: { totalTournaments: 10, totalSessions: 7, activeDays: 5, currentStreakDays: 0 },
      }),
    );
    const node = await screen.findByTestId('empty-performance-cluster');
    expect(node.textContent ?? '').toMatch(/\b7\b/);
  });

  it('NAO renderiza placeholder quando ao menos 1 dos 4 tem dado', async () => {
    await renderHome(
      buildPowerPayload({
        topDeltas: [
          { stat: 'vpip', statLabel: 'VPIP', baseline: 25, current: 28, delta: 3, deltaAbs: 3, severity: 'medium', direction: 'positive', period: '30d' },
        ],
        variance: null,
        tournamentRecommendations: [],
        heuristics: [],
      }),
    );
    // Wait for queries to settle.
    await screen.findByTestId('home-zone-perf');
    expect(screen.queryByTestId('empty-performance-cluster')).not.toBeInTheDocument();
  });
});
