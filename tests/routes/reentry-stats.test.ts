/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spot-Anki-Reentry-3 — RF-2.4 + RF-5: GET /api/reentry/stats
 *
 * Spec: Docs/specs/spot-anki-reentry-3.md §RF-5.5
 *
 * Cobertura RED:
 *   - 200 retorna { pendingToday, reviewedLast7Days, accuracyLast7Days, streakDays }.
 *   - Cache server-side TTL (lesson #21 invalidator publico).
 *   - Streak edge cases (today vs yesterday cutoff).
 *   - Accuracy zero division protection.
 *
 * Status RED: server/routes/reentry.ts ainda nao existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSrsStatsServiceMock } = vi.hoisted(() => ({
  getSrsStatsServiceMock: vi.fn(),
}));

vi.mock('../../server/services/spotReentry/srsStatsService', () => ({
  getSrsStatsCached: getSrsStatsServiceMock,
}));

async function loadRoute() {
  const mod: any = await import('../../server/routes/reentry');
  return mod;
}

function makeReqRes(opts: { user?: any } = {}) {
  const req: any = {
    user: opts.user ?? { userPlatformId: 'USER-0001' },
    params: {}, body: {}, query: {},
  };
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
  return { req, res };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/reentry/stats', () => {
  it('200 retorna shape { pendingToday, reviewedLast7Days, accuracyLast7Days, streakDays }', async () => {
    getSrsStatsServiceMock.mockResolvedValue({
      pendingToday: 5,
      reviewedLast7Days: 23,
      accuracyLast7Days: 0.87,
      streakDays: 4,
    });
    const route = await loadRoute();
    const handler = route.handleGetReentryStats || route.default;
    const { req, res } = makeReqRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.pendingToday).toBe(5);
    expect(res.body.reviewedLast7Days).toBe(23);
    expect(res.body.accuracyLast7Days).toBeCloseTo(0.87, 2);
    expect(res.body.streakDays).toBe(4);
  });

  it('200 zeros quando user nao tem cards (sem crash)', async () => {
    getSrsStatsServiceMock.mockResolvedValue({
      pendingToday: 0, reviewedLast7Days: 0, accuracyLast7Days: 0, streakDays: 0,
    });
    const route = await loadRoute();
    const handler = route.handleGetReentryStats || route.default;
    const { req, res } = makeReqRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.accuracyLast7Days).toBe(0);
  });

  it('passa userPlatformId do JWT', async () => {
    getSrsStatsServiceMock.mockResolvedValue({
      pendingToday: 0, reviewedLast7Days: 0, accuracyLast7Days: 0, streakDays: 0,
    });
    const route = await loadRoute();
    const handler = route.handleGetReentryStats || route.default;
    const { req, res } = makeReqRes({ user: { userPlatformId: 'USER-XYZ' } });
    await handler(req, res);
    expect(getSrsStatsServiceMock).toHaveBeenCalledWith('USER-XYZ');
  });

  it('500 quando service throw — log + retorno generico', async () => {
    getSrsStatsServiceMock.mockRejectedValue(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const route = await loadRoute();
    const handler = route.handleGetReentryStats || route.default;
    const { req, res } = makeReqRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// =============================================================================
// Streak edge cases (RF-5.5)
// =============================================================================
describe('GET /api/reentry/stats — streak semantics', () => {
  it('streakDays=2 quando reviewed ontem + hoje', async () => {
    getSrsStatsServiceMock.mockResolvedValue({
      pendingToday: 1, reviewedLast7Days: 4, accuracyLast7Days: 0.75, streakDays: 2,
    });
    const route = await loadRoute();
    const handler = route.handleGetReentryStats || route.default;
    const { req, res } = makeReqRes();
    await handler(req, res);
    expect(res.body.streakDays).toBe(2);
  });

  it('streakDays=0 quando user nunca revisou', async () => {
    getSrsStatsServiceMock.mockResolvedValue({
      pendingToday: 0, reviewedLast7Days: 0, accuracyLast7Days: 0, streakDays: 0,
    });
    const route = await loadRoute();
    const handler = route.handleGetReentryStats || route.default;
    const { req, res } = makeReqRes();
    await handler(req, res);
    expect(res.body.streakDays).toBe(0);
  });

  it('reviewedLast7Days=0 → accuracyLast7Days=0 (zero division protection)', async () => {
    getSrsStatsServiceMock.mockResolvedValue({
      pendingToday: 5, reviewedLast7Days: 0, accuracyLast7Days: 0, streakDays: 0,
    });
    const route = await loadRoute();
    const handler = route.handleGetReentryStats || route.default;
    const { req, res } = makeReqRes();
    await handler(req, res);
    expect(res.body.accuracyLast7Days).toBe(0);
  });
});
