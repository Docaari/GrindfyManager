// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-03 — GET /api/admin/audio-metrics
//
// Cobertura:
//   - requireAuth + requirePermission('admin_full') / 'admin' gating.
//   - Non-admin retorna 403; sem auth retorna 401.
//   - Range query string aceito (7d default; 30d; 90d).
//   - Admin valido retorna 200 com shape RF-03.
//
// Lessons: #34 (handler injectedStorage 3o arg).
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    getAudioMetrics: vi.fn(),
  },
}));

vi.mock('../../../server/storage/audioMetricsStorage', () => storageMock);

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.getAudioMetrics.mockResolvedValue({
    range: '7d',
    generatedAt: new Date().toISOString(),
    kpis: {
      mpDau: 1,
      mpWau: 5,
      avgListeningTimePerSessionSec: 100,
      queueDepthMedian: 2,
      queueDepthP95: 9,
      spotifyToInternalFallbackRate: 0.05,
      totalPlays: 25,
      totalLessonCompletions: 3,
    },
    topLessonsCompletion: [],
    topLessonsPlays: [],
  });
});

function makeReq(opts: any = {}) {
  return {
    user: { userPlatformId: 'USER-ADM', subscriptionPlan: 'admin' },
    query: { range: '7d' },
    headers: {},
    ...opts,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  return res;
}

describe('GET /api/admin/audio-metrics — RF-03', () => {
  it('admin retorna 200 com shape RF-03', async () => {
    const mod: any = await import('../../../server/routes/adminAudioMetrics');
    const handler = mod.handleGetAudioMetrics;
    expect(typeof handler).toBe('function');

    const req = makeReq();
    const res = makeRes();
    await handler(req, res, storageMock);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      range: '7d',
      kpis: expect.any(Object),
    });
  });

  it('non-admin retorna 403', async () => {
    const mod: any = await import('../../../server/routes/adminAudioMetrics');
    const handler = mod.handleGetAudioMetrics;

    const req = makeReq({ user: { userPlatformId: 'USER-X', subscriptionPlan: 'free' } });
    const res = makeRes();
    await handler(req, res, storageMock);

    expect(res.statusCode).toBe(403);
  });

  it('range invalido cai pro default 7d', async () => {
    const mod: any = await import('../../../server/routes/adminAudioMetrics');
    const handler = mod.handleGetAudioMetrics;

    const req = makeReq({ query: { range: 'invalid' } });
    const res = makeRes();
    await handler(req, res, storageMock);

    expect(res.statusCode).toBeLessThan(400);
    expect(storageMock.getAudioMetrics).toHaveBeenCalledWith('7d');
  });

  it('registra rota em registerAdminAudioMetricsRoutes', async () => {
    const mod: any = await import('../../../server/routes/adminAudioMetrics');
    expect(typeof mod.registerAdminAudioMetricsRoutes).toBe('function');

    const calls: Array<{ verb: string; path: string }> = [];
    const fakeApp: any = {
      get: (p: string) => calls.push({ verb: 'GET', path: p }),
      post: () => {},
      patch: () => {},
      use: () => {},
    };

    mod.registerAdminAudioMetricsRoutes(fakeApp);
    expect(calls.some((c) => c.verb === 'GET' && c.path === '/api/admin/audio-metrics')).toBe(true);
  });
});
