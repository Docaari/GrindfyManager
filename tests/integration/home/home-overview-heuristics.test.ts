/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-2 — RF-34 (B12 Heuristicas server-side, payload integration).
 *
 * Spec : Docs/specs/home-reform-2.md §3 B12, §5 RF-34, §RF-35
 * ADR  : Docs/architecture/decisions/108-home-heuristics-server-side-rules.md
 *
 * Backend extensao: /api/home/overview retorna `heuristics: Array<{...}>` (max 3).
 * Handler invoca homeHeuristics.computeHeuristics com inputs ja agregados
 * (quickStats, perf30d, perf60d, recentSessions, variance, todayDayOfWeek, lifetime).
 *
 * Status RED:
 *   - service homeHeuristics NAO existe
 *   - handler nao retorna heuristics no body
 *   - handler nao chama getDashboardPerformance(userId, '60d')
 *
 * Lessons aplicadas:
 *   #3   shape REAL — service retorna array de Heuristic
 *   #5   vi.fn() OK aqui (sem `new` envolvido)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: {
    getQuickStats: vi.fn(),
    getDashboardPerformance: vi.fn(),
    getRecentSessions: vi.fn(),
    getPendingStarredHands: vi.fn(),
    getPlannedTournamentsForDate: vi.fn(),
    getProfileStateForDay: vi.fn(),
    getCurrentBankroll: vi.fn(),
    getActiveCooldown: vi.fn(),
    getActiveFlightSeries: vi.fn(),
    detectPlayerProfile: vi.fn(),
    getUserTimezone: vi.fn(),
    getStatsTopDeltas: vi.fn(),
    getVarianceVsExpected: vi.fn(),
  },
}));

vi.mock('../../../server/routes/news', () => ({
  fetchNewsItems: vi.fn().mockResolvedValue([]),
  handleGetNews: vi.fn(),
  registerNewsRoutes: vi.fn(),
}));

vi.mock('../../../server/routes/tournament-selector', () => ({
  handleTournamentSelector: vi.fn().mockResolvedValue({ tournaments: [] }),
  registerTournamentSelectorRoutes: vi.fn(),
}));

const computeHeuristicsMock = vi.fn();
vi.mock('../../../server/services/homeHeuristics', () => ({
  computeHeuristics: (...args: any[]) => computeHeuristicsMock(...args),
}));

import {
  handleHomeOverview,
  clearHomeOverviewCache,
} from '../../../server/routes/home';
import { storage } from '../../../server/storage';
import { fetchNewsItems } from '../../../server/routes/news';

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: `USER-HE-${Math.random().toString(36).slice(2, 8)}` },
    body: {},
    query: {},
    params: {},
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {} };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.setHeader = (k: string, v: string) => { res.headers[k.toLowerCase()] = v; return res; };
  res.set = res.setHeader;
  return res;
}

function defaultMocks() {
  (storage.getQuickStats as any).mockResolvedValue({
    totalTournaments: 1000, totalSessions: 100, activeDays: 200, currentStreakDays: 3,
  });
  // Default: 30d retornado para chamadas (qualquer period). Handler pode pedir 30d e 60d.
  (storage.getDashboardPerformance as any).mockImplementation(async (_uid: string, period: string = '30d') => ({
    roi: period === '60d' ? 20 : 12.4,
    itm: 18,
    cash: period === '60d' ? 2200 : 1100,
    sparkline: [],
    period,
  }));
  (storage.getRecentSessions as any).mockResolvedValue([]);
  (storage.getPendingStarredHands as any).mockResolvedValue([]);
  (storage.getPlannedTournamentsForDate as any).mockResolvedValue([]);
  (storage.getProfileStateForDay as any).mockResolvedValue(null);
  (storage.getCurrentBankroll as any).mockResolvedValue(null);
  (storage.getActiveCooldown as any).mockResolvedValue(null);
  (storage.getActiveFlightSeries as any).mockResolvedValue(null);
  (storage.detectPlayerProfile as any).mockResolvedValue({
    profile: 'hybrid', totalUploads: 1000, totalSessions: 100,
    sessionTournamentCount: 100, detectedAt: new Date().toISOString(),
  });
  (storage.getUserTimezone as any).mockResolvedValue('America/Sao_Paulo');
  (storage.getStatsTopDeltas as any).mockResolvedValue([]);
  (storage.getVarianceVsExpected as any).mockResolvedValue(null);
  (fetchNewsItems as any).mockResolvedValue([]);
  computeHeuristicsMock.mockReset();
  computeHeuristicsMock.mockReturnValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  if (typeof clearHomeOverviewCache === 'function') clearHomeOverviewCache();
  defaultMocks();
});

describe('GET /api/home/overview — heuristics (RF-34)', () => {
  it('inclui campo heuristics no body (array)', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('heuristics');
    expect(Array.isArray(res.body.heuristics)).toBe(true);
  });

  it('handler chama getDashboardPerformance com period=60d (input p/ regra 1)', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    const calls = (storage.getDashboardPerformance as any).mock.calls;
    const has60d = calls.some((c: any[]) => c[1] === '60d');
    expect(has60d).toBe(true);
  });

  it('handler chama computeHeuristics com inputs corretos', async () => {
    computeHeuristicsMock.mockReturnValue([]);
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(computeHeuristicsMock).toHaveBeenCalled();
    const arg = computeHeuristicsMock.mock.calls[0]?.[0] ?? {};
    expect(arg).toHaveProperty('quickStats');
    expect(arg).toHaveProperty('performance30d');
    expect(arg).toHaveProperty('performance60d');
    expect(arg).toHaveProperty('recentSessions');
    // variance pode ser null
    expect(arg).toHaveProperty('variance');
    expect(arg).toHaveProperty('todayDayOfWeek');
  });

  it('service retorna 3 heuristicas => body.heuristics tem 3 itens', async () => {
    const sample = [
      { id: 'roi-30d-vs-60d-drop', message: 'ROI 30d caiu 7.6 pp vs 60d. Revisar selecao de torneios.', severity: 'caution', ctaHref: '/tournament-selector' },
      { id: 'best-day-of-week', message: 'Dom costuma ser seu melhor dia (ROI 18.2%).', severity: 'positive', ctaHref: '/dashboard?period=60d' },
      { id: 'cash-pace-vs-baseline', message: 'Pace de cash 23%+ acima da media.', severity: 'positive', ctaHref: '/dashboard' },
    ];
    computeHeuristicsMock.mockReturnValue(sample);
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.heuristics.length).toBe(3);
    expect(res.body.heuristics[0]).toMatchObject({
      id: 'roi-30d-vs-60d-drop',
      severity: 'caution',
    });
  });

  it('shape de cada item: { id, message, severity, ctaHref }', async () => {
    computeHeuristicsMock.mockReturnValue([
      { id: 'best-day-of-week', message: 'X', severity: 'positive', ctaHref: '/dashboard' },
    ]);
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    const h = res.body.heuristics[0];
    expect(h).toHaveProperty('id');
    expect(h).toHaveProperty('message');
    expect(h).toHaveProperty('severity');
    expect(h).toHaveProperty('ctaHref');
  });

  it('computeHeuristics throw => heuristics: [] (graceful degradation), 200', async () => {
    computeHeuristicsMock.mockImplementation(() => { throw new Error('boom'); });
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.heuristics).toEqual([]);
  });
});
