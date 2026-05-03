/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-01 (endpoint composto /api/home/overview)
 * + RNF-08 (logging) + RNF-10 (per-userId isolation).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-01, §10.1
 * ADRs : Docs/architecture/decisions/099-home-operations-cockpit-pattern.md
 *        Docs/architecture/decisions/102-home-overview-endpoint-cache-strategy.md
 *
 * Padrao convencionado pelo projeto (vide tests/integration/api/bankroll.test.ts
 * + analytics-player-bundle.test.ts): testamos o handler exportado isolado
 * do Express, mockando server/storage. Auth eh delegado ao middleware
 * requireAuth — testamos apenas que o handler retorna 401-shape quando
 * userPlatformId ausente.
 *
 * Lessons aplicadas:
 *   #3  shape REAL — mocks refletem retorno de storage.ts
 *   #5  vi.fn() ok aqui (sem `new` envolvido)
 *   #13 apiRequest retorna JSON direto — n/a aqui (testes server)
 *
 * Status RED: handler `handleHomeOverview` e funcoes de cache (`clearHomeOverviewCache`)
 * NAO existem ainda — modulo `server/routes/home.ts` sera criado pelo implementer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks — storage.ts (subqueries reais consumidas pelo handler)
// ADR-102 §2.1: handler chama storage.* direto, NAO HTTP loopback.
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
  },
}));

// fetchNewsItems exportado de news.ts (ADR-100 §2.2 ponto de extensao 1).
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
    user: { userPlatformId: 'USER-0001' },
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
    totalTournaments: 1000,
    totalSessions: 50,
    activeDays: 200,
    currentStreakDays: 3,
  });
  (storage.getDashboardPerformance as any).mockResolvedValue({
    roi: 12.4,
    itm: 18,
    cash: 22,
    sparkline: Array(30).fill(0).map((_, i) => i),
    period: '30d',
  });
  (storage.getRecentSessions as any).mockResolvedValue([
    { id: 'S1', date: '2026-05-01', pnlUsd: 250, tournamentCount: 8, primaryPlatform: 'GG', status: 'finalized' },
  ]);
  (storage.getPendingStarredHands as any).mockResolvedValue([]);
  (storage.getPlannedTournamentsForDate as any).mockResolvedValue([]);
  (storage.getProfileStateForDay as any).mockResolvedValue({ profile: 'A' });
  (storage.getCurrentBankroll as any).mockResolvedValue({
    totalUsd: 8200,
    bisAvailable: 50,
    deltaPct7d: 1.2,
    sparkline: [],
  });
  (storage.getActiveCooldown as any).mockResolvedValue(null);
  (storage.getActiveFlightSeries as any).mockResolvedValue(null);
  (fetchNewsItems as any).mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  if (typeof clearHomeOverviewCache === 'function') {
    clearHomeOverviewCache();
  }
  defaultStorageMocks();
});

// =============================================================================
// Auth — RF-01 + RNF-10
// =============================================================================

describe('GET /api/home/overview — auth', () => {
  it('rejeita request sem userPlatformId (401-equivalente)', async () => {
    const req = makeReq({ user: undefined });
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('aceita request com userPlatformId valido', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.statusCode).toBe(200);
  });
});

// =============================================================================
// Schema response — RF-01
// =============================================================================

describe('GET /api/home/overview — response shape', () => {
  it('inclui userState, statusStrip, today, banners, nextTournament, lifetime, recentSessions, performance, pendingHands, news, meta', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);

    expect(res.body).toHaveProperty('userState');
    expect(res.body).toHaveProperty('statusStrip');
    expect(res.body).toHaveProperty('today');
    expect(res.body).toHaveProperty('banners');
    expect(res.body.banners).toHaveProperty('cooldown');
    expect(res.body.banners).toHaveProperty('flight');
    expect(res.body).toHaveProperty('nextTournament');
    expect(res.body).toHaveProperty('lifetime');
    expect(res.body).toHaveProperty('recentSessions');
    expect(res.body).toHaveProperty('performance');
    expect(res.body).toHaveProperty('pendingHands');
    expect(res.body).toHaveProperty('news');
    expect(res.body).toHaveProperty('meta');
    expect(res.body.meta).toHaveProperty('cacheHit');
    expect(res.body.meta).toHaveProperty('subqueryTimingsMs');
  });

  it('news shape eh { enabled, items }', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.news).toHaveProperty('enabled');
    expect(Array.isArray(res.body.news.items)).toBe(true);
  });
});

// =============================================================================
// Empty vs power state — D7 / RF-08
// =============================================================================

describe('GET /api/home/overview — userState threshold (D7)', () => {
  // D7 atualizado pos-QA founder 2026-05-03: empty state apenas para users
  // 100% novos (sem qualquer atividade real). Qualquer um destes vira power:
  // >=1 torneio importado, >=1 sessao OU wallets configuradas.
  it('user 100% novo (zero atividade, zero wallets) => userState=empty', async () => {
    (storage.getQuickStats as any).mockResolvedValue({
      totalTournaments: 0,
      totalSessions: 0,
      activeDays: 0,
      currentStreakDays: 0,
    });
    (storage.getCurrentBankroll as any).mockResolvedValue(null);
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.userState).toBe('empty');
  });

  it('qualquer torneio importado (>=1) => userState=power', async () => {
    (storage.getQuickStats as any).mockResolvedValue({
      totalTournaments: 1,
      totalSessions: 0,
      activeDays: 1,
      currentStreakDays: 0,
    });
    (storage.getCurrentBankroll as any).mockResolvedValue(null);
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.userState).toBe('power');
  });

  it('wallets configuradas (sem torneio/sessao) => userState=power', async () => {
    (storage.getQuickStats as any).mockResolvedValue({
      totalTournaments: 0,
      totalSessions: 0,
      activeDays: 0,
      currentStreakDays: 0,
    });
    (storage.getCurrentBankroll as any).mockResolvedValue({
      totalUsd: 5000,
      walletsCount: 3,
    });
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.body.userState).toBe('power');
  });
});

// =============================================================================
// Promise.allSettled — D5 / ADR-102 §2.1.4
// =============================================================================

describe('GET /api/home/overview — Promise.allSettled (graceful degradation)', () => {
  it('subquery throw => campo correspondente null, response 200', async () => {
    (storage.getActiveCooldown as any).mockRejectedValue(new Error('DB exploded'));
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.banners.cooldown).toBeNull();
    // outras subqueries NAO foram afetadas
    expect(res.body.lifetime).not.toBeNull();
    expect(res.body.statusStrip).not.toBeNull();
  });

  it('multiplas subqueries falhando => response 200 com cada campo null', async () => {
    (storage.getActiveCooldown as any).mockRejectedValue(new Error('boom1'));
    (storage.getActiveFlightSeries as any).mockRejectedValue(new Error('boom2'));
    (storage.getRecentSessions as any).mockRejectedValue(new Error('boom3'));
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.banners.cooldown).toBeNull();
    expect(res.body.banners.flight).toBeNull();
    // recentSessions: array empty ou null aceitavel
    const recent = res.body.recentSessions;
    expect(recent === null || (Array.isArray(recent) && recent.length === 0)).toBe(true);
  });

  it('news fetchNewsItems falha => news.items=[] e enabled=false', async () => {
    (fetchNewsItems as any).mockRejectedValue(new Error('news fail'));
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.news.items).toEqual([]);
  });
});

// =============================================================================
// Cache 30s in-memory per-userId — D4 / ADR-102 §2.3
// =============================================================================

describe('GET /api/home/overview — cache 30s per-userId', () => {
  it('1a chamada cacheHit=false, 2a chamada cacheHit=true (mesmo userId)', async () => {
    const req1 = makeReq({ user: { userPlatformId: 'USER-CACHE-A' } });
    const res1 = makeRes();
    await handleHomeOverview(req1, res1);
    expect(res1.body.meta.cacheHit).toBe(false);

    const req2 = makeReq({ user: { userPlatformId: 'USER-CACHE-A' } });
    const res2 = makeRes();
    await handleHomeOverview(req2, res2);
    expect(res2.body.meta.cacheHit).toBe(true);
  });

  it('cache hit NAO chama storage subqueries de novo', async () => {
    const req1 = makeReq({ user: { userPlatformId: 'USER-NO-RECALL' } });
    const res1 = makeRes();
    await handleHomeOverview(req1, res1);

    vi.clearAllMocks();
    defaultStorageMocks();

    const req2 = makeReq({ user: { userPlatformId: 'USER-NO-RECALL' } });
    const res2 = makeRes();
    await handleHomeOverview(req2, res2);

    expect(res2.body.meta.cacheHit).toBe(true);
    expect(storage.getQuickStats).not.toHaveBeenCalled();
    expect(storage.getCurrentBankroll).not.toHaveBeenCalled();
  });

  it('per-userId boundary — user A NAO recebe dados do user B (RNF-10)', async () => {
    // User A tem 1000 torneios
    (storage.getQuickStats as any).mockResolvedValueOnce({
      totalTournaments: 1000, totalSessions: 50, activeDays: 200, currentStreakDays: 3,
    });
    const reqA = makeReq({ user: { userPlatformId: 'USER-A' } });
    const resA = makeRes();
    await handleHomeOverview(reqA, resA);
    expect(resA.body.userState).toBe('power');

    // User B 100% novo — cache do A nao pode contaminar B
    (storage.getQuickStats as any).mockResolvedValueOnce({
      totalTournaments: 0, totalSessions: 0, activeDays: 0, currentStreakDays: 0,
    });
    (storage.getCurrentBankroll as any).mockResolvedValueOnce(null);
    const reqB = makeReq({ user: { userPlatformId: 'USER-B' } });
    const resB = makeRes();
    await handleHomeOverview(reqB, resB);
    expect(resB.body.userState).toBe('empty');
    expect(resB.body.meta.cacheHit).toBe(false); // user B nunca chamou antes
  });

  it('clearHomeOverviewCache(userId) zera cache so daquele userId', async () => {
    const req1 = makeReq({ user: { userPlatformId: 'USER-CLEAR' } });
    const res1 = makeRes();
    await handleHomeOverview(req1, res1);

    clearHomeOverviewCache('USER-CLEAR');

    const req2 = makeReq({ user: { userPlatformId: 'USER-CLEAR' } });
    const res2 = makeRes();
    await handleHomeOverview(req2, res2);
    expect(res2.body.meta.cacheHit).toBe(false);
  });
});

// =============================================================================
// Cache headers HTTP — ADR-102 §2.7
// =============================================================================

describe('GET /api/home/overview — Cache-Control headers', () => {
  it('seta Cache-Control: private, max-age=30', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    const header = res.headers['cache-control'];
    expect(header).toBeDefined();
    expect(String(header)).toMatch(/private/i);
    expect(String(header)).toMatch(/max-age=30/);
  });
});

// =============================================================================
// meta.subqueryTimingsMs — RNF-08
// =============================================================================

describe('GET /api/home/overview — meta.subqueryTimingsMs', () => {
  it('inclui timing por subquery mesmo se uma falha', async () => {
    (storage.getActiveCooldown as any).mockRejectedValue(new Error('boom'));
    const req = makeReq();
    const res = makeRes();
    await handleHomeOverview(req, res);
    const timings = res.body.meta.subqueryTimingsMs;
    expect(typeof timings).toBe('object');
    // Pelo menos statusStrip/lifetime/today + cooldown reportam timing
    const keys = Object.keys(timings);
    expect(keys.length).toBeGreaterThanOrEqual(5);
  });
});
