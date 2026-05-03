/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RNF-01 (performance budget /api/home/overview).
 *
 * Spec : Docs/specs/home-reform-1.md §RNF-01, §3 D6
 * ADR  : Docs/architecture/decisions/102-home-overview-endpoint-cache-strategy.md §2.4
 *
 * Budget:
 *   - Cold cache:  < 500ms p95
 *   - Cache hit:   <  50ms p95
 *   - Concurrent (5 users cold): < 700ms p95
 *
 * NOTA: testes de perf rodam em ambiente node (sem jsdom). Mocks de storage
 * simulam latencia tipica (~30-80ms cada subquery). Implementer pode tunar
 * timeouts conforme realidade da maquina dev — values na spec sao guidelines.
 *
 * Status RED: handler NAO existe ainda.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/storage', () => ({
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

vi.mock('../../server/routes/news', () => ({
  fetchNewsItems: vi.fn().mockResolvedValue([]),
  handleGetNews: vi.fn(),
  registerNewsRoutes: vi.fn(),
}));

import {
  handleHomeOverview,
  clearHomeOverviewCache,
} from '../../server/routes/home';
import { storage } from '../../server/storage';

function makeReq(userPlatformId = 'USER-PERF-1') {
  return { user: { userPlatformId }, body: {}, query: {}, params: {}, headers: {} };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {} as Record<string, string> };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.setHeader = (k: string, v: string) => { res.headers[k.toLowerCase()] = v; return res; };
  res.set = res.setHeader;
  return res;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockSubqueriesWithLatency(ms = 50) {
  (storage.getQuickStats as any).mockImplementation(async () => {
    await delay(ms);
    return { totalTournaments: 1000, totalSessions: 50, activeDays: 200, currentStreakDays: 3 };
  });
  (storage.getDashboardPerformance as any).mockImplementation(async () => {
    await delay(ms);
    return { roi: 12, itm: 18, cash: 22, sparkline: [], period: '30d' };
  });
  (storage.getRecentSessions as any).mockImplementation(async () => {
    await delay(ms);
    return [];
  });
  (storage.getPendingStarredHands as any).mockImplementation(async () => {
    await delay(ms);
    return [];
  });
  (storage.getPlannedTournamentsForDate as any).mockImplementation(async () => {
    await delay(ms);
    return [];
  });
  (storage.getProfileStateForDay as any).mockImplementation(async () => {
    await delay(ms);
    return { profile: 'A' };
  });
  (storage.getCurrentBankroll as any).mockImplementation(async () => {
    await delay(ms);
    return { totalUsd: 8200, bisAvailable: 50, deltaPct7d: 1.2, sparkline: [] };
  });
  (storage.getActiveCooldown as any).mockImplementation(async () => {
    await delay(ms);
    return null;
  });
  (storage.getActiveFlightSeries as any).mockImplementation(async () => {
    await delay(ms);
    return null;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  if (typeof clearHomeOverviewCache === 'function') {
    clearHomeOverviewCache();
  }
});

// =============================================================================
// Cold cache budget — RNF-01 §1
// =============================================================================

describe('Performance: /api/home/overview cold (RNF-01)', () => {
  it('cold cache < 500ms (mock subqueries 50ms cada, paralelo)', async () => {
    mockSubqueriesWithLatency(50);
    const req = makeReq('USER-PERF-COLD');
    const res = makeRes();

    const t0 = Date.now();
    await handleHomeOverview(req, res);
    const elapsed = Date.now() - t0;

    expect(res.statusCode).toBe(200);
    // 9 subqueries em paralelo @ 50ms cada => ~50-80ms
    // Budget conservador: 500ms
    expect(elapsed).toBeLessThan(500);
  });
});

// =============================================================================
// Cache hit budget — RNF-01 §2
// =============================================================================

describe('Performance: /api/home/overview cache hit (RNF-01)', () => {
  it('2a chamada (cache hit) < 50ms', async () => {
    mockSubqueriesWithLatency(50);
    const userId = 'USER-PERF-HIT';

    // Cold call para popular cache
    const req1 = makeReq(userId);
    const res1 = makeRes();
    await handleHomeOverview(req1, res1);
    expect(res1.body.meta.cacheHit).toBe(false);

    // Hit call
    const req2 = makeReq(userId);
    const res2 = makeRes();
    const t0 = Date.now();
    await handleHomeOverview(req2, res2);
    const elapsed = Date.now() - t0;

    expect(res2.body.meta.cacheHit).toBe(true);
    expect(elapsed).toBeLessThan(50);
  });
});

// =============================================================================
// Concurrent budget — RNF-01 §4
// =============================================================================

describe('Performance: /api/home/overview concurrent (RNF-01)', () => {
  it('5 users diferentes em paralelo todos < 700ms p95', async () => {
    mockSubqueriesWithLatency(50);
    const users = ['USER-A', 'USER-B', 'USER-C', 'USER-D', 'USER-E'];

    const t0 = Date.now();
    const promises = users.map((u) => {
      const req = makeReq(u);
      const res = makeRes();
      return handleHomeOverview(req, res).then(() => res);
    });
    const results = await Promise.all(promises);
    const total = Date.now() - t0;

    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    // 5 users em paralelo, sem cache compartilhado => ~50ms cada subquery
    // mas todos rodam concorrente => total deve ser proximo do tempo de 1 user
    expect(total).toBeLessThan(700);
  });
});

// =============================================================================
// Subquery timeout 800ms — D5 / ADR-102 §2.1.4
// =============================================================================

describe('Performance: subquery timeout 800ms (D5)', () => {
  it('subquery > 800ms => null no campo, mas response total nao espera 5s', async () => {
    mockSubqueriesWithLatency(20);
    // Forca uma subquery a travar 5s
    (storage.getActiveCooldown as any).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ active: true }), 5000)),
    );

    const req = makeReq('USER-TIMEOUT');
    const res = makeRes();

    const t0 = Date.now();
    await handleHomeOverview(req, res);
    const elapsed = Date.now() - t0;

    expect(res.statusCode).toBe(200);
    // O timeout 800ms deve impedir a chamada de durar 5s
    expect(elapsed).toBeLessThan(2000);
    expect(res.body.banners.cooldown).toBeNull();
  }, 10_000);
});
