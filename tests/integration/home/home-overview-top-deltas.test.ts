/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-2 — RF-29 (B7 Stats Top Deltas backend).
 *
 * Spec : Docs/specs/home-reform-2.md §3 B7, §5 RF-29, §RF-35
 *
 * Backend extensao: /api/home/overview retorna `topDeltas: Array<{...}>` (max 3).
 *
 * Status RED:
 *   - storage.getStatsTopDeltas NAO existe
 *   - handler nao retorna topDeltas no body
 *
 * Lessons aplicadas:
 *   #3   shape REAL — mocks refletem retorno de storage.ts
 *   #5   vi.fn() OK aqui (sem `new` envolvido)
 *   #9   logar antes de fallback (Promise.allSettled)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks — storage.ts (subqueries existentes Onda 1 + nova getStatsTopDeltas)
// =============================================================================

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
    // Onda 2 NEW
    getStatsTopDeltas: vi.fn(),
    getVarianceVsExpected: vi.fn(),
  },
}));

vi.mock('../../../server/routes/news', () => ({
  fetchNewsItems: vi.fn().mockResolvedValue([]),
  handleGetNews: vi.fn(),
  registerNewsRoutes: vi.fn(),
}));

// Mock tournament selector handler para isolar B9.
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
    user: { userPlatformId: `USER-TD-${Math.random().toString(36).slice(2, 8)}` },
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

// =============================================================================
// Schema
// =============================================================================

describe('GET /api/home/overview — topDeltas (RF-29)', () => {
  it('inclui campo topDeltas no body (array)', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('topDeltas');
    expect(Array.isArray(res.body.topDeltas)).toBe(true);
  });

  it('user sem snapshots HUD => topDeltas: []', async () => {
    (storage.getStatsTopDeltas as any).mockResolvedValue([]);
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.topDeltas).toEqual([]);
  });

  it('retorna max 3 entradas mesmo se storage retornar mais', async () => {
    const overflow = [
      { stat: 'vpip', statLabel: 'VPIP', baseline: 22, current: 28, delta: 6, deltaAbs: 6, severity: 'low', direction: 'negative', period: '30d' },
      { stat: 'pfr', statLabel: 'PFR', baseline: 18, current: 30, delta: 12, deltaAbs: 12, severity: 'medium', direction: 'positive', period: '30d' },
      { stat: '3bet', statLabel: '3-Bet', baseline: 8, current: 32, delta: 24, deltaAbs: 24, severity: 'high', direction: 'negative', period: '30d' },
      { stat: 'cbet', statLabel: 'CBet', baseline: 50, current: 60, delta: 10, deltaAbs: 10, severity: 'medium', direction: 'positive', period: '30d' },
    ];
    (storage.getStatsTopDeltas as any).mockResolvedValue(overflow);
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.topDeltas.length).toBeLessThanOrEqual(3);
  });

  it('cada entrada respeita shape { stat, statLabel, baseline, current, delta, deltaAbs, severity, direction, period }', async () => {
    const sample = [
      { stat: '3bet', statLabel: '3-Bet', baseline: 8, current: 32, delta: 24, deltaAbs: 24, severity: 'high', direction: 'negative', period: '30d' },
    ];
    (storage.getStatsTopDeltas as any).mockResolvedValue(sample);
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    const td = res.body.topDeltas[0];
    expect(td).toHaveProperty('stat');
    expect(td).toHaveProperty('statLabel');
    expect(td).toHaveProperty('baseline');
    expect(td).toHaveProperty('current');
    expect(td).toHaveProperty('delta');
    expect(td).toHaveProperty('deltaAbs');
    expect(td).toHaveProperty('severity');
    expect(td).toHaveProperty('direction');
    expect(td).toHaveProperty('period');
    expect(['high', 'medium', 'low']).toContain(td.severity);
    expect(['positive', 'negative', 'neutral']).toContain(td.direction);
  });

  it('subquery falha => topDeltas: [] (graceful degradation), response 200', async () => {
    (storage.getStatsTopDeltas as any).mockRejectedValue(new Error('DB exploded'));
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.topDeltas).toEqual([]);
  });
});
