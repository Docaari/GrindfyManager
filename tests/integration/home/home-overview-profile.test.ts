/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1-5 — RF-25 (B4 Profile-aware Home backend).
 *
 * Spec : Docs/specs/home-reform-1-5.md §RF-25, §RF-25.1, §RF-25.2, §RF-25.4
 * ADR  : Docs/architecture/decisions/107-home-profile-detection-smart-auto-adapt.md
 *
 * Backend extensao: /api/home/overview retorna `profile` + `profileMeta`.
 * Heuristica em RF-25.4 / ADR-107 §2.2.
 *
 * Status RED:
 *   - storage.detectPlayerProfile NAO existe
 *   - handler nao retorna profile no body
 *
 * Lessons aplicadas:
 *   #3   shape REAL — mocks refletem retorno de storage.ts
 *   #5   vi.fn() OK aqui (sem `new` envolvido)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks — storage.ts (subqueries existentes Onda 1 + nova detectPlayerProfile)
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
  },
}));

vi.mock('../../../server/routes/news', () => ({
  fetchNewsItems: vi.fn().mockResolvedValue([]),
  handleGetNews: vi.fn(),
  registerNewsRoutes: vi.fn(),
}));

import {
  handleHomeOverview,
  clearHomeOverviewCache,
} from '../../../server/routes/home';
import { storage } from '../../../server/storage';
import { fetchNewsItems } from '../../../server/routes/news';

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: `USER-PROFILE-${Math.random().toString(36).slice(2, 8)}` },
    body: {},
    query: {},
    params: {},
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    headers: {} as Record<string, string>,
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.body = data;
    return res;
  };
  res.setHeader = (key: string, value: string) => {
    res.headers[key.toLowerCase()] = value;
    return res;
  };
  res.set = res.setHeader;
  return res;
}

function defaultStorageMocks() {
  (storage.getQuickStats as any).mockResolvedValue({
    totalTournaments: 100,
    totalSessions: 30,
    activeDays: 50,
    currentStreakDays: 0,
  });
  (storage.getDashboardPerformance as any).mockResolvedValue({
    roi: 12.4, itm: 18, cash: 22, sparkline: [], period: '30d',
  });
  (storage.getRecentSessions as any).mockResolvedValue([]);
  (storage.getPendingStarredHands as any).mockResolvedValue([]);
  (storage.getPlannedTournamentsForDate as any).mockResolvedValue([]);
  (storage.getProfileStateForDay as any).mockResolvedValue({ profile: 'A' });
  (storage.getCurrentBankroll as any).mockResolvedValue(null);
  (storage.getActiveCooldown as any).mockResolvedValue(null);
  (storage.getActiveFlightSeries as any).mockResolvedValue(null);
  (fetchNewsItems as any).mockResolvedValue([]);
  // Default: hybrid (mock devolve hybrid quando nao explicitado)
  (storage.detectPlayerProfile as any).mockResolvedValue({
    profile: 'hybrid',
    totalUploads: 100,
    totalSessions: 30,
    sessionTournamentCount: 30,
    detectedAt: '2026-05-03T12:00:00Z',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  if (typeof clearHomeOverviewCache === 'function') {
    clearHomeOverviewCache();
  }
  defaultStorageMocks();
});

// =============================================================================
// Schema — RF-25.1
// =============================================================================

describe('GET /api/home/overview — schema com profile (RF-25.1)', () => {
  it('response body inclui profile (PlayerProfile)', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body).toHaveProperty('profile');
    expect(['upload-only', 'session-only', 'hybrid', 'new']).toContain(res.body.profile);
  });

  it('response body inclui profileMeta com totalUploads, totalSessions, sessionTournamentCount, detectedAt', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body).toHaveProperty('profileMeta');
    expect(res.body.profileMeta).toHaveProperty('totalUploads');
    expect(res.body.profileMeta).toHaveProperty('totalSessions');
    expect(res.body.profileMeta).toHaveProperty('sessionTournamentCount');
    expect(res.body.profileMeta).toHaveProperty('detectedAt');
  });
});

// =============================================================================
// Heuristica — RF-25.4 / ADR-107 §2.2
// =============================================================================

describe('GET /api/home/overview — profile heuristic (RF-25.4)', () => {
  it('csvCount=50 AND sessionTournamentCount=20 => "hybrid"', async () => {
    (storage.detectPlayerProfile as any).mockResolvedValue({
      profile: 'hybrid',
      totalUploads: 50,
      totalSessions: 20,
      sessionTournamentCount: 20,
      detectedAt: '2026-05-03T12:00:00Z',
    });
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.profile).toBe('hybrid');
  });

  it('csvCount=100 AND sessionTournamentCount=5 => "upload-only"', async () => {
    (storage.detectPlayerProfile as any).mockResolvedValue({
      profile: 'upload-only',
      totalUploads: 100,
      totalSessions: 5,
      sessionTournamentCount: 5,
      detectedAt: '2026-05-03T12:00:00Z',
    });
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.profile).toBe('upload-only');
  });

  it('csvCount=5 AND sessionTournamentCount=100 => "session-only"', async () => {
    (storage.detectPlayerProfile as any).mockResolvedValue({
      profile: 'session-only',
      totalUploads: 5,
      totalSessions: 100,
      sessionTournamentCount: 100,
      detectedAt: '2026-05-03T12:00:00Z',
    });
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.profile).toBe('session-only');
  });

  it('csvCount=0 AND sessionTournamentCount=0 => "new"', async () => {
    (storage.detectPlayerProfile as any).mockResolvedValue({
      profile: 'new',
      totalUploads: 0,
      totalSessions: 0,
      sessionTournamentCount: 0,
      detectedAt: '2026-05-03T12:00:00Z',
    });
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.profile).toBe('new');
  });

  it('default em ambiguidade (csv<50 AND session<20, sem dominio) => "hybrid"', async () => {
    // Caso ambiguo: csv=10 sess=10 (empate, range central) => hybrid
    (storage.detectPlayerProfile as any).mockResolvedValue({
      profile: 'hybrid',
      totalUploads: 10,
      totalSessions: 10,
      sessionTournamentCount: 10,
      detectedAt: '2026-05-03T12:00:00Z',
    });
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.profile).toBe('hybrid');
  });

  it('csv>0 AND session=0 => "upload-only"', async () => {
    (storage.detectPlayerProfile as any).mockResolvedValue({
      profile: 'upload-only',
      totalUploads: 30,
      totalSessions: 0,
      sessionTournamentCount: 0,
      detectedAt: '2026-05-03T12:00:00Z',
    });
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.profile).toBe('upload-only');
  });

  it('csv=0 AND session>0 => "session-only"', async () => {
    (storage.detectPlayerProfile as any).mockResolvedValue({
      profile: 'session-only',
      totalUploads: 0,
      totalSessions: 30,
      sessionTournamentCount: 30,
      detectedAt: '2026-05-03T12:00:00Z',
    });
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.profile).toBe('session-only');
  });

  it('csv > 2*session (range central, dominio upload) => "upload-only"', async () => {
    (storage.detectPlayerProfile as any).mockResolvedValue({
      profile: 'upload-only',
      totalUploads: 30,
      totalSessions: 5,
      sessionTournamentCount: 5,
      detectedAt: '2026-05-03T12:00:00Z',
    });
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.profile).toBe('upload-only');
  });

  it('session > 2*csv (range central, dominio session) => "session-only"', async () => {
    (storage.detectPlayerProfile as any).mockResolvedValue({
      profile: 'session-only',
      totalUploads: 5,
      totalSessions: 15,
      sessionTournamentCount: 15,
      detectedAt: '2026-05-03T12:00:00Z',
    });
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.profile).toBe('session-only');
  });
});

// =============================================================================
// Defensive fallback — subquery falha
// =============================================================================

describe('GET /api/home/overview — profile fallback defensivo (RF-25.3)', () => {
  it('detectPlayerProfile lanca erro => profile=hybrid (default seguro)', async () => {
    (storage.detectPlayerProfile as any).mockRejectedValue(new Error('DB exploded'));
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.profile).toBe('hybrid');
  });
});
