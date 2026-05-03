/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1-5 — RF-22 (B1 Insight do Dia engine).
 *
 * Spec : Docs/specs/home-reform-1-5.md §RF-22, §RF-22.7
 * ADR  : Docs/architecture/decisions/106-home-daily-insight-rule-engine.md
 *
 * Funcao pura `computeDailyInsight(data: HomeOverviewResponse): DailyInsight`
 * em client/src/lib/home/dailyInsight.ts (NAO existe ainda).
 *
 * Lessons aplicadas:
 *   #14  await import(...) em vez de require — ESM compat.
 *   #1   funcao pura — sem hooks, sem side effects.
 *
 * Status RED: modulo `client/src/lib/home/dailyInsight.ts` NAO existe.
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// Fixtures — shape espelha HomeOverviewResponse (Onda 1 + Onda 1.5 profile)
// =============================================================================

type AnyData = Record<string, any>;

function baseData(overrides: AnyData = {}): AnyData {
  return {
    userState: 'power',
    statusStrip: {
      banca: { totalUsd: 8200, bisAvailable: 50, deltaPct7d: 1.2, sparkline: [] },
      roi30d: {
        value: 12.4,
        // 14 valores: prior7avg = avg(0..6) = 3, recent7avg = avg(7..13) = 10 (subiu)
        sparkline: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      },
      today: { plannedCount: 0, firstStartTime: null, realizedPnlUsd: null },
      pendencias: { starredHands: 0, cooldownAlerts: 0 },
    },
    today: {
      profile: 'A',
      plannedCount: 0,
      firstStartTime: null,
      stopLoss: null,
      stopTime: null,
      hasWarmupToday: false,
    },
    banners: { cooldown: null, flight: null },
    nextTournament: null,
    lifetime: {
      totalTournaments: 100,
      totalSessions: 30,
      activeDays: 50,
      currentStreakDays: 0,
    },
    recentSessions: [
      { id: 'S1', date: new Date().toISOString().slice(0, 10), pnlUsd: 100, tournamentCount: 5, primaryPlatform: 'GG', status: 'finalized' },
    ],
    performance: { roi: 12.4, itm: 18, cash: 22, sparkline: [], period: '30d' },
    pendingHands: [],
    news: { enabled: false, items: [] },
    profile: 'hybrid',
    profileMeta: { totalUploads: 100, totalSessions: 30, sessionTournamentCount: 30, detectedAt: '2026-05-03T12:00:00Z' },
    meta: { generatedAt: '2026-05-03T12:00:00Z', cacheHit: false, subqueryTimingsMs: {} },
    ...overrides,
  };
}

// =============================================================================
// Regra 1 — Cooldown ativo (severity critical)
// =============================================================================

describe('computeDailyInsight — Regra 1: cooldown ativo', () => {
  it('cooldown.active=true => type "cooldown" + severity critical + CTA /estudos', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    const data = baseData({
      banners: { cooldown: { active: true, until: '2026-05-04T00:00:00Z', type: 'stop-loss' }, flight: null },
    });
    const insight = computeDailyInsight(data as any);
    expect(insight.type).toBe('cooldown');
    expect(insight.severity).toBe('critical');
    expect(insight.cta.href).toBe('/estudos');
    expect(insight.title.toLowerCase()).toContain('cooldown');
  });
});

// =============================================================================
// Regra 2 — >=3 starred hands pendentes
// =============================================================================

describe('computeDailyInsight — Regra 2: pending hands >= 3', () => {
  it('3 maos pendentes => type "pending-hands" + CTA /estudos', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    const data = baseData({
      pendingHands: [
        { id: 'H1', hero: 'AQ', context: 'x', tag: '3b', ageRelative: '2d' },
        { id: 'H2', hero: 'JJ', context: 'x', tag: 'op', ageRelative: '1d' },
        { id: 'H3', hero: '99', context: 'x', tag: 'set', ageRelative: '5h' },
      ],
    });
    const insight = computeDailyInsight(data as any);
    expect(insight.type).toBe('pending-hands');
    expect(insight.cta.href).toBe('/estudos');
    expect(insight.title).toContain('3');
  });

  it('2 maos pendentes (abaixo do threshold) NAO ativa regra 2', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    const data = baseData({
      pendingHands: [
        { id: 'H1', hero: 'AQ', context: 'x', tag: '3b', ageRelative: '2d' },
        { id: 'H2', hero: 'JJ', context: 'x', tag: 'op', ageRelative: '1d' },
      ],
    });
    const insight = computeDailyInsight(data as any);
    expect(insight.type).not.toBe('pending-hands');
  });
});

// =============================================================================
// Regra 3 — ROI 30d caiu >5pp ultimos 7d vs 7d anteriores
// =============================================================================

describe('computeDailyInsight — Regra 3: ROI decline', () => {
  it('queda > 5pp nos ultimos 7d vs prior 7d => type "roi-decline" critical', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    // prior 7 = avg([20,21,22,23,24,25,26]) = 23
    // recent 7 = avg([10,11,12,13,14,15,16]) = 13
    // diff = 10 (>5)
    const sparkline = [20, 21, 22, 23, 24, 25, 26, 10, 11, 12, 13, 14, 15, 16];
    const data = baseData({
      statusStrip: {
        banca: null,
        roi30d: { value: 13, sparkline },
        today: null,
        pendencias: null,
      },
    });
    const insight = computeDailyInsight(data as any);
    expect(insight.type).toBe('roi-decline');
    expect(insight.severity).toBe('critical');
  });

  it('queda < 5pp NAO ativa regra 3', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    // prior 7 = 13, recent 7 = 10, diff = 3 (<5)
    const sparkline = [13, 13, 13, 13, 13, 13, 13, 10, 10, 10, 10, 10, 10, 10];
    const data = baseData({
      statusStrip: {
        banca: null,
        roi30d: { value: 10, sparkline },
        today: null,
        pendencias: null,
      },
    });
    const insight = computeDailyInsight(data as any);
    expect(insight.type).not.toBe('roi-decline');
  });

  it('sparkline com < 14 pontos NAO ativa regra 3', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    const data = baseData({
      statusStrip: {
        banca: null,
        roi30d: { value: 10, sparkline: [20, 20, 20, 10, 10, 10, 10] },
        today: null,
        pendencias: null,
      },
    });
    const insight = computeDailyInsight(data as any);
    expect(insight.type).not.toBe('roi-decline');
  });
});

// =============================================================================
// Regra 4 — Re-engagement (>=7d sem grindar)
// =============================================================================

describe('computeDailyInsight — Regra 4: study-gap (>=7d sem grindar)', () => {
  it('ultima sessao ha 8 dias => type "study-gap" + CTA /coach-ai', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const data = baseData({
      recentSessions: [
        { id: 'S1', date: eightDaysAgo, pnlUsd: 0, tournamentCount: 0, primaryPlatform: 'GG', status: 'finalized' },
      ],
    });
    const insight = computeDailyInsight(data as any);
    expect(insight.type).toBe('study-gap');
    expect(insight.cta.href).toBe('/coach-ai');
  });

  it('ultima sessao ha 5 dias NAO ativa regra 4', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const data = baseData({
      recentSessions: [
        { id: 'S1', date: fiveDaysAgo, pnlUsd: 0, tournamentCount: 0, primaryPlatform: 'GG', status: 'finalized' },
      ],
    });
    const insight = computeDailyInsight(data as any);
    expect(insight.type).not.toBe('study-gap');
  });
});

// =============================================================================
// Regra 5 — Streak >= 7d (celebration)
// =============================================================================

describe('computeDailyInsight — Regra 5: celebration (streak>=7)', () => {
  it('currentStreakDays=7 => type "celebration" + severity celebration', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    const data = baseData({
      lifetime: {
        totalTournaments: 100,
        totalSessions: 30,
        activeDays: 50,
        currentStreakDays: 7,
      },
    });
    const insight = computeDailyInsight(data as any);
    expect(insight.type).toBe('celebration');
    expect(insight.severity).toBe('celebration');
    expect(insight.title.toLowerCase()).toContain('consist');
  });

  it('currentStreakDays=6 NAO ativa regra 5', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    const data = baseData({
      lifetime: {
        totalTournaments: 100,
        totalSessions: 30,
        activeDays: 50,
        currentStreakDays: 6,
      },
    });
    const insight = computeDailyInsight(data as any);
    expect(insight.type).not.toBe('celebration');
  });
});

// =============================================================================
// Regra 6 — Fallback (sempre garante)
// =============================================================================

describe('computeDailyInsight — Regra 6: fallback', () => {
  it('zero sinais => type "fallback" + severity neutral', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    const data = baseData({
      banners: { cooldown: null, flight: null },
      pendingHands: [],
      lifetime: { totalTournaments: 100, totalSessions: 30, activeDays: 50, currentStreakDays: 0 },
      // Sem sparkline ROI longa, sem sessao antiga, sem celebration.
      statusStrip: {
        banca: null,
        roi30d: { value: 5, sparkline: [5, 5, 5, 5, 5] },
        today: null,
        pendencias: null,
      },
      recentSessions: [
        { id: 'S1', date: new Date().toISOString().slice(0, 10), pnlUsd: 0, tournamentCount: 0, primaryPlatform: 'GG', status: 'finalized' },
      ],
    });
    const insight = computeDailyInsight(data as any);
    expect(insight.type).toBe('fallback');
    expect(insight.severity === 'neutral' || insight.severity === undefined).toBe(true);
    expect(insight.cta).toBeDefined();
    expect(insight.cta.href).toBe('/coach-ai');
  });

  it('engine retorna sempre 1 insight valido — nunca null/undefined/throw', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    const insight = computeDailyInsight({} as any);
    expect(insight).toBeTruthy();
    expect(insight.type).toBeDefined();
    expect(insight.title).toBeDefined();
    expect(insight.cta).toBeDefined();
  });
});

// =============================================================================
// Prioridade — primeiro match vence (cooldown > pending > decline > gap > celebration > fallback)
// =============================================================================

describe('computeDailyInsight — Prioridade entre regras', () => {
  it('cooldown ativo + pending hands + streak alto => cooldown vence (regra 1 prioridade max)', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    const data = baseData({
      banners: { cooldown: { active: true, until: '2026-05-04T00:00:00Z', type: 'stop-loss' }, flight: null },
      pendingHands: [
        { id: 'H1', hero: 'AQ', context: 'x', tag: '3b', ageRelative: '2d' },
        { id: 'H2', hero: 'JJ', context: 'x', tag: 'op', ageRelative: '1d' },
        { id: 'H3', hero: '99', context: 'x', tag: 'set', ageRelative: '5h' },
      ],
      lifetime: { totalTournaments: 100, totalSessions: 30, activeDays: 50, currentStreakDays: 10 },
    });
    const insight = computeDailyInsight(data as any);
    expect(insight.type).toBe('cooldown');
  });

  it('pending hands + ROI decline => pending vence (regra 2 > 3)', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    const sparkline = [20, 21, 22, 23, 24, 25, 26, 10, 11, 12, 13, 14, 15, 16];
    const data = baseData({
      banners: { cooldown: null, flight: null },
      statusStrip: {
        banca: null,
        roi30d: { value: 13, sparkline },
        today: null,
        pendencias: null,
      },
      pendingHands: [
        { id: 'H1', hero: 'AQ', context: 'x', tag: '3b', ageRelative: '2d' },
        { id: 'H2', hero: 'JJ', context: 'x', tag: 'op', ageRelative: '1d' },
        { id: 'H3', hero: '99', context: 'x', tag: 'set', ageRelative: '5h' },
      ],
    });
    const insight = computeDailyInsight(data as any);
    expect(insight.type).toBe('pending-hands');
  });

  it('study-gap + celebration => study-gap vence (regra 4 > 5)', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const data = baseData({
      banners: { cooldown: null, flight: null },
      pendingHands: [],
      recentSessions: [
        { id: 'S1', date: eightDaysAgo, pnlUsd: 0, tournamentCount: 0, primaryPlatform: 'GG', status: 'finalized' },
      ],
      lifetime: { totalTournaments: 100, totalSessions: 30, activeDays: 50, currentStreakDays: 10 },
    });
    const insight = computeDailyInsight(data as any);
    expect(insight.type).toBe('study-gap');
  });
});

// =============================================================================
// Determinismo — funcao pura
// =============================================================================

describe('computeDailyInsight — funcao pura (determinismo)', () => {
  it('mesmo input => mesmo output (deep equal)', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    const data = baseData({
      banners: { cooldown: { active: true, until: '2026-05-04T00:00:00Z', type: 'stop-loss' }, flight: null },
    });
    const a = computeDailyInsight(data as any);
    const b = computeDailyInsight(data as any);
    expect(a).toEqual(b);
  });

  it('multiplas chamadas com fixture diferente => outputs distintos quando regras distintas', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    const fixtureCooldown = baseData({
      banners: { cooldown: { active: true, until: '2026-05-04T00:00:00Z', type: 'stop-loss' }, flight: null },
    });
    const fixtureFallback = baseData({
      banners: { cooldown: null, flight: null },
      pendingHands: [],
      lifetime: { totalTournaments: 100, totalSessions: 30, activeDays: 50, currentStreakDays: 0 },
    });
    const a = computeDailyInsight(fixtureCooldown as any);
    const b = computeDailyInsight(fixtureFallback as any);
    expect(a.type).toBe('cooldown');
    expect(b.type).toBe('fallback');
    expect(a).not.toEqual(b);
  });
});

// =============================================================================
// Shape do retorno — RF-22.5
// =============================================================================

describe('computeDailyInsight — DailyInsight shape', () => {
  it('insight tem: type, title, body, cta {label, href}', async () => {
    const { computeDailyInsight } = await import('../dailyInsight');
    const insight = computeDailyInsight(baseData() as any);
    expect(typeof insight.type).toBe('string');
    expect(typeof insight.title).toBe('string');
    expect(typeof insight.body).toBe('string');
    expect(insight.cta).toBeDefined();
    expect(typeof insight.cta.label).toBe('string');
    expect(typeof insight.cta.href).toBe('string');
  });
});
