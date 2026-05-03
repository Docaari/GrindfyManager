/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-2 — RF-31 (B9 Tournament Selector Top 3 Hoje).
 *
 * Spec : Docs/specs/home-reform-2.md §3 B9, §5 RF-31, §RF-35
 *
 * Backend extensao: /api/home/overview retorna `tournamentRecommendations: Array<{...}>` (max 3).
 * Reusa handleTournamentSelector com filtros score>=70, grade in [S,A,B], date=today.
 *
 * Status RED:
 *   - handler nao retorna tournamentRecommendations no body
 *   - handler nao chama handleTournamentSelector com filtros corretos
 *
 * Lessons aplicadas:
 *   #3   shape REAL — mocks de tournament-selector retornam shape do scoring
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

const handleTournamentSelectorMock = vi.fn();
vi.mock('../../../server/routes/tournament-selector', () => ({
  handleTournamentSelector: (...args: any[]) => handleTournamentSelectorMock(...args),
  registerTournamentSelectorRoutes: vi.fn(),
}));

import {
  handleHomeOverview,
  clearHomeOverviewCache,
} from '../../../server/routes/home';
import { storage } from '../../../server/storage';
import { fetchNewsItems } from '../../../server/routes/news';

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: `USER-TR-${Math.random().toString(36).slice(2, 8)}` },
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
  (storage.getDashboardPerformance as any).mockResolvedValue({
    roi: 12.4, itm: 18, cash: 22, sparkline: [], period: '30d',
  });
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
  handleTournamentSelectorMock.mockReset();
  handleTournamentSelectorMock.mockResolvedValue({ tournaments: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  if (typeof clearHomeOverviewCache === 'function') clearHomeOverviewCache();
  defaultMocks();
});

describe('GET /api/home/overview — tournamentRecommendations (RF-31)', () => {
  it('inclui campo tournamentRecommendations no body (array)', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('tournamentRecommendations');
    expect(Array.isArray(res.body.tournamentRecommendations)).toBe(true);
  });

  it('selector vazio => tournamentRecommendations: []', async () => {
    handleTournamentSelectorMock.mockResolvedValue({ tournaments: [] });
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.tournamentRecommendations).toEqual([]);
  });

  it('chama handleTournamentSelector com minScore=70 + filtros corretos', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(handleTournamentSelectorMock).toHaveBeenCalled();
    const callArg = handleTournamentSelectorMock.mock.calls[0]?.[0] ?? {};
    // Conforme spec: minScore 70, sources 'suprema,library', lookbackDays 180
    expect(callArg.minScore ?? callArg.scoreMin ?? 0).toBeGreaterThanOrEqual(70);
  });

  it('filtra grade in [S, A, B] (rejeita C/D)', async () => {
    handleTournamentSelectorMock.mockResolvedValue({
      tournaments: [
        { id: 'T1', name: 'A', buyinUsd: 100, buyinNative: 100, currency: 'USD', score: 92, grade: 'S', startTime: new Date(Date.now() + 3600 * 1000).toISOString(), platform: 'PS', alreadyInGrid: false },
        { id: 'T2', name: 'B', buyinUsd: 50, buyinNative: 50, currency: 'USD', score: 75, grade: 'C', startTime: new Date(Date.now() + 3600 * 2000).toISOString(), platform: 'GG', alreadyInGrid: false },
        { id: 'T3', name: 'C', buyinUsd: 33, buyinNative: 33, currency: 'USD', score: 80, grade: 'A', startTime: new Date(Date.now() + 3600 * 3000).toISOString(), platform: 'ACR', alreadyInGrid: false },
        { id: 'T4', name: 'D', buyinUsd: 22, buyinNative: 22, currency: 'USD', score: 60, grade: 'D', startTime: new Date(Date.now() + 3600 * 4000).toISOString(), platform: 'WPN', alreadyInGrid: false },
      ],
    });
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    const recs = res.body.tournamentRecommendations;
    recs.forEach((r: any) => {
      expect(['S', 'A', 'B']).toContain(r.grade);
    });
  });

  it('retorna no maximo 3 entradas mesmo recebendo mais', async () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      id: `T${i}`,
      name: `Torneio ${i}`,
      buyinUsd: 100 + i,
      buyinNative: 100 + i,
      currency: 'USD',
      score: 95 - i,
      grade: 'S',
      startTime: new Date(Date.now() + (i + 1) * 3600 * 1000).toISOString(),
      platform: 'PS',
      alreadyInGrid: false,
    }));
    handleTournamentSelectorMock.mockResolvedValue({ tournaments: many });
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.tournamentRecommendations.length).toBeLessThanOrEqual(3);
  });

  it('cada entrada tem shape {id, name, buyinUsd, buyinNative, currency, score, grade, startTime, platform, alreadyInGrid}', async () => {
    handleTournamentSelectorMock.mockResolvedValue({
      tournaments: [
        { id: 'T1', name: 'Sunday Million', buyinUsd: 109, buyinNative: 109, currency: 'USD', score: 92, grade: 'S', startTime: new Date(Date.now() + 3600 * 1000).toISOString(), platform: 'PS', alreadyInGrid: false },
      ],
    });
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    const r = res.body.tournamentRecommendations[0];
    expect(r).toHaveProperty('id');
    expect(r).toHaveProperty('name');
    expect(r).toHaveProperty('buyinUsd');
    expect(r).toHaveProperty('buyinNative');
    expect(r).toHaveProperty('currency');
    expect(r).toHaveProperty('score');
    expect(r).toHaveProperty('grade');
    expect(r).toHaveProperty('startTime');
    expect(r).toHaveProperty('platform');
    expect(r).toHaveProperty('alreadyInGrid');
  });

  it('handleTournamentSelector throw => tournamentRecommendations: [] (graceful)', async () => {
    handleTournamentSelectorMock.mockRejectedValue(new Error('selector down'));
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.tournamentRecommendations).toEqual([]);
  });
});
