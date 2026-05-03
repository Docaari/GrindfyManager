/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-2 — RF-33 (B11 D14 timezone-aware).
 *
 * Spec : Docs/specs/home-reform-2.md §3 B11, §5 RF-33, §RF-35
 *
 * Backend: handler le `users.timezone` via storage.getUserTimezone(userId), usa
 * Intl.DateTimeFormat para calcular `todayIso` + `dayOfWeek` no fuso correto.
 * Resposta inclui `meta.userTimezone`.
 *
 * Status RED:
 *   - storage.getUserTimezone JA EXISTE (ja foi consumido em outras sprints)
 *   - handler ainda usa Date local — NAO chama getUserTimezone
 *   - meta.userTimezone NAO existe no payload
 *
 * Lessons aplicadas:
 *   #3   shape REAL — storage.getUserTimezone retorna string|null
 *   #5   vi.fn() OK aqui (sem `new` envolvido)
 *   #9   logar antes de fallback (timezone invalido)
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
    user: { userPlatformId: `USER-TZ-${Math.random().toString(36).slice(2, 8)}` },
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

describe('GET /api/home/overview — timezone-aware (RF-33)', () => {
  it('handler chama storage.getUserTimezone(userId)', async () => {
    const req = makeReq({ user: { userPlatformId: 'USER-TZ-CALL' } });
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(storage.getUserTimezone).toHaveBeenCalledWith('USER-TZ-CALL');
  });

  it('meta.userTimezone presente no payload (default America/Sao_Paulo)', async () => {
    (storage.getUserTimezone as any).mockResolvedValue('America/Sao_Paulo');
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.meta).toHaveProperty('userTimezone');
    expect(res.body.meta.userTimezone).toBe('America/Sao_Paulo');
  });

  it('user com timezone=America/New_York => meta.userTimezone=America/New_York', async () => {
    (storage.getUserTimezone as any).mockResolvedValue('America/New_York');
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.meta.userTimezone).toBe('America/New_York');
  });

  it('storage.getUserTimezone retorna null => fallback America/Sao_Paulo', async () => {
    (storage.getUserTimezone as any).mockResolvedValue(null);
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.meta.userTimezone).toBe('America/Sao_Paulo');
  });

  it('timezone invalido (Foo/Bar) => fallback America/Sao_Paulo (NAO 500)', async () => {
    (storage.getUserTimezone as any).mockResolvedValue('Foo/Bar');
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.meta.userTimezone).toBe('America/Sao_Paulo');
  });

  it('chama getPlannedTournamentsForDate com todayIso (formato YYYY-MM-DD)', async () => {
    (storage.getUserTimezone as any).mockResolvedValue('America/Sao_Paulo');
    const req = makeReq({ user: { userPlatformId: 'USER-TZ-PLAN' } });
    const res = makeRes();
    await handleHomeOverview(req, res);
    const lastCall = (storage.getPlannedTournamentsForDate as any).mock.calls.slice(-1)[0] ?? [];
    const isoArg = String(lastCall[1] ?? '');
    expect(isoArg).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('chama getProfileStateForDay com dayOfWeek 0-6', async () => {
    (storage.getUserTimezone as any).mockResolvedValue('America/Sao_Paulo');
    const req = makeReq({ user: { userPlatformId: 'USER-TZ-DOW' } });
    const res = makeRes();
    await handleHomeOverview(req, res);
    const lastCall = (storage.getProfileStateForDay as any).mock.calls.slice(-1)[0] ?? [];
    const dow = lastCall[1];
    expect(typeof dow).toBe('number');
    expect(dow).toBeGreaterThanOrEqual(0);
    expect(dow).toBeLessThanOrEqual(6);
  });
});
