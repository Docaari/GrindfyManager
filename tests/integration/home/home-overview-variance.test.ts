/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-2 — RF-30 (B8 Variance Check PrimeDope backend).
 *
 * Spec : Docs/specs/home-reform-2.md §3 B8, §5 RF-30, §RF-35
 *
 * Backend extensao: /api/home/overview retorna `variance: {...} | null`.
 *
 * Status RED:
 *   - storage.getVarianceVsExpected NAO existe
 *   - handler nao retorna variance no body
 *
 * Lessons aplicadas:
 *   #3   shape REAL — mocks refletem retorno de storage.ts
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

import {
  handleHomeOverview,
  clearHomeOverviewCache,
} from '../../../server/routes/home';
import { storage } from '../../../server/storage';
import { fetchNewsItems } from '../../../server/routes/news';

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: `USER-VAR-${Math.random().toString(36).slice(2, 8)}` },
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
}

beforeEach(() => {
  vi.clearAllMocks();
  if (typeof clearHomeOverviewCache === 'function') clearHomeOverviewCache();
  defaultMocks();
});

describe('GET /api/home/overview — variance (RF-30)', () => {
  it('inclui campo variance no body (default null)', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('variance');
    expect(res.body.variance).toBeNull();
  });

  it('storage retorna null (< 20 sessoes) => variance: null', async () => {
    (storage.getVarianceVsExpected as any).mockResolvedValue(null);
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.variance).toBeNull();
  });

  it('storage retorna variance valida => repassa shape inteiro', async () => {
    const sample = {
      sessionsCount: 25,
      actualUsd: 800,
      expectedUsd: 200,
      expectedSource: 'primedope-cache',
      deviationUsd: 600,
      sigmaUsd: 350,
      sigmaMultiple: 1.71,
      status: 'lucky',
      period: '90d',
    };
    (storage.getVarianceVsExpected as any).mockResolvedValue(sample);
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    const v = res.body.variance;
    expect(v).not.toBeNull();
    expect(v.sessionsCount).toBe(25);
    expect(v.actualUsd).toBe(800);
    expect(v.expectedUsd).toBe(200);
    expect(v.expectedSource).toBe('primedope-cache');
    expect(v.sigmaMultiple).toBeCloseTo(1.71, 2);
    expect(v.status).toBe('lucky');
    expect(v.period).toBe('90d');
  });

  it('subquery throw => variance: null (graceful degradation), response 200', async () => {
    (storage.getVarianceVsExpected as any).mockRejectedValue(new Error('boom'));
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.variance).toBeNull();
  });

  it('expectedSource pode ser primedope-cache OR fallback-zero', async () => {
    const fallbackSample = {
      sessionsCount: 22,
      actualUsd: 50,
      expectedUsd: 0,
      expectedSource: 'fallback-zero',
      deviationUsd: 50,
      sigmaUsd: 200,
      sigmaMultiple: 0.25,
      status: 'normal',
      period: '90d',
    };
    (storage.getVarianceVsExpected as any).mockResolvedValue(fallbackSample);
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.variance.expectedSource).toBe('fallback-zero');
    expect(res.body.variance.expectedUsd).toBe(0);
  });
});
