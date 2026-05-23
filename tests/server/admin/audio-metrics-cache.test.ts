// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-03 — cache 5min in-memory
//
// Spec: Docs/specs/sprint-mp-validation.md RF-03 §regras de negocio
//        "Endpoint cache server-side 5min (key = range)"
//
// Cobertura:
//   - Segunda chamada com mesmo range dentro 5min retorna cached (storage
//     chamado 1x apenas).
//   - Apos > 5min: cache miss → storage chamado de novo.
//   - Range diferente NAO compartilha cache (key per range).
//   - _resetCacheForTests() limpa cache.
//
// Lessons: #34 (handler injectedStorage), Date.now mock.
// =============================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const { storageMock } = vi.hoisted(() => ({
  storageMock: { getAudioMetrics: vi.fn() },
}));

vi.mock('../../../server/storage/audioMetricsStorage', () => storageMock);

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.getAudioMetrics.mockResolvedValue({
    range: '7d',
    generatedAt: new Date().toISOString(),
    kpis: {
      mpDau: 1, mpWau: 1, avgListeningTimePerSessionSec: 1,
      queueDepthMedian: 1, queueDepthP95: 1, spotifyToInternalFallbackRate: 0,
      totalPlays: 1, totalLessonCompletions: 1,
    },
    topLessonsCompletion: [],
    topLessonsPlays: [],
  });
});

afterEach(() => vi.useRealTimers());

function makeReq(range = '7d') {
  return {
    user: { userPlatformId: 'USER-ADM', subscriptionPlan: 'admin' },
    query: { range },
    headers: {},
  };
}
function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  return res;
}

describe('RF-03 cache 5min in-memory', () => {
  it('segunda chamada mesmo range dentro 5min usa cache', async () => {
    const mod: any = await import('../../../server/routes/adminAudioMetrics');
    const handler = mod.handleGetAudioMetrics;
    if (typeof mod._resetCacheForTests === 'function') mod._resetCacheForTests();

    await handler(makeReq('7d'), makeRes(), storageMock);
    await handler(makeReq('7d'), makeRes(), storageMock);

    expect(storageMock.getAudioMetrics).toHaveBeenCalledTimes(1);
  });

  it('apos >5min cache expira', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T10:00:00Z'));

    const mod: any = await import('../../../server/routes/adminAudioMetrics');
    const handler = mod.handleGetAudioMetrics;
    if (typeof mod._resetCacheForTests === 'function') mod._resetCacheForTests();

    await handler(makeReq('7d'), makeRes(), storageMock);

    vi.setSystemTime(new Date('2026-05-22T10:06:00Z')); // +6min

    await handler(makeReq('7d'), makeRes(), storageMock);

    expect(storageMock.getAudioMetrics).toHaveBeenCalledTimes(2);
  });

  it('range diferente NAO compartilha cache', async () => {
    const mod: any = await import('../../../server/routes/adminAudioMetrics');
    const handler = mod.handleGetAudioMetrics;
    if (typeof mod._resetCacheForTests === 'function') mod._resetCacheForTests();

    await handler(makeReq('7d'), makeRes(), storageMock);
    await handler(makeReq('30d'), makeRes(), storageMock);

    expect(storageMock.getAudioMetrics).toHaveBeenCalledTimes(2);
  });
});
