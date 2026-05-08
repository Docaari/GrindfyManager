/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Coach-Biblio-2 — RF-2 Routes Biblioteca Recommendations.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-2 (todos endpoints)
 *        - GET   /api/biblioteca/recommendations
 *        - POST  /api/biblioteca/recommendations/refresh
 * ADRs : 132/134 (services), spec §RF-2.3 (cache 60min + invalidator)
 *
 * Cobertura:
 *   - 401 sem auth
 *   - GET retorna shape RF-2.1 (recommendations array, generatedAt, cacheExpiresAt)
 *   - GET cache hit nao chama service de geracao
 *   - GET empty: user sem leaks → response.recommendations === []
 *   - POST refresh invalida cache + re-fetch
 *   - POST refresh rate limit 5/dia retorna 429
 *
 * Lessons aplicadas:
 *   #14 vi.hoisted para spies em vi.mock factory
 *   #5  vi.fn() ok
 *   #13 res.json retorna JSON parseado
 *
 * Status RED: arquivo server/routes/biblioteca-recommendations.ts NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// vi.hoisted — spies compartilhados (lesson #14)
// =============================================================================
const {
  generateRecommendationsMock,
  invalidateCacheMock,
  isRateLimitedMock,
  recordRefreshMock,
} = vi.hoisted(() => ({
  generateRecommendationsMock: vi.fn(),
  invalidateCacheMock: vi.fn(),
  isRateLimitedMock: vi.fn(),
  recordRefreshMock: vi.fn(),
}));

vi.mock('../../server/services/bibliotecaRecommendationsService', () => ({
  generateBibliotecaRecommendations: generateRecommendationsMock,
  invalidateBibliotecaRecommendationsCache: invalidateCacheMock,
  isRefreshRateLimited: isRateLimitedMock,
  recordBibliotecaRefresh: recordRefreshMock,
  _resetForTests: vi.fn(),
}));

function makeReqRes(opts: { userId?: string | null; body?: any; query?: any; params?: any }) {
  const req: any = {
    user: opts.userId ? { userPlatformId: opts.userId } : null,
    body: opts.body ?? {},
    query: opts.query ?? {},
    params: opts.params ?? {},
  };
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  return { req, res };
}

async function loadRoute() {
  return await import('../../server/routes/biblioteca-recommendations');
}

beforeEach(() => {
  vi.clearAllMocks();
  isRateLimitedMock.mockResolvedValue(false);
});

// =============================================================================
// GET /api/biblioteca/recommendations — Auth
// =============================================================================
describe('GET /api/biblioteca/recommendations — Auth', () => {
  it('401 quando sem userId', async () => {
    const route: any = await loadRoute();
    const handler = route.handleGetBibliotecaRecommendations;
    const { req, res } = makeReqRes({ userId: null });
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// GET happy path
// =============================================================================
describe('GET /api/biblioteca/recommendations — Happy path (RF-2.1)', () => {
  it('200 retorna shape com recommendations + generatedAt + cacheExpiresAt', async () => {
    generateRecommendationsMock.mockResolvedValue({
      recommendations: [
        {
          leak: {
            statId: 'cbet_flop_oop_pct',
            statName: 'C-bet flop OOP',
            value: 28,
            benchmark: 38,
            delta: -10,
            severity: 8,
          },
          theme: {
            id: 'theme_1',
            name: 'C-bet flop OOP',
            slug: 'c-bet-flop-oop',
            isCurated: true,
          },
          lessons: [
            {
              id: 'lesson_a',
              title: 'Ep 4: C-bet OOP no Flop',
              courseSlug: 'antes-das-cartas',
              lessonSlug: 'ep-4-cbet-oop-flop',
              durationSeconds: 720,
              thumbnailUrl: null,
              watchedPct: 0.45,
            },
          ],
        },
      ],
      generatedAt: '2026-05-08T14:23:11Z',
      cacheExpiresAt: '2026-05-08T15:23:11Z',
      cacheHit: false,
    });

    const route: any = await loadRoute();
    const handler = route.handleGetBibliotecaRecommendations;
    const { req, res } = makeReqRes({ userId: 'USER-0001' });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('recommendations');
    expect(res.body).toHaveProperty('generatedAt');
    expect(res.body).toHaveProperty('cacheExpiresAt');
    expect(Array.isArray(res.body.recommendations)).toBe(true);
    expect(res.body.recommendations[0].lessons[0].courseSlug).toBe('antes-das-cartas');
    expect(res.body.recommendations[0].lessons[0].lessonSlug).toBe('ep-4-cbet-oop-flop');
  });

  it('200 vazio quando user sem leaks (empty state)', async () => {
    generateRecommendationsMock.mockResolvedValue({
      recommendations: [],
      generatedAt: '2026-05-08T14:23:11Z',
      cacheExpiresAt: '2026-05-08T15:23:11Z',
      cacheHit: false,
    });

    const route: any = await loadRoute();
    const handler = route.handleGetBibliotecaRecommendations;
    const { req, res } = makeReqRes({ userId: 'USER-NEW' });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.recommendations).toEqual([]);
  });

  it('cacheHit=true quando service retorna do cache (sem chamada algoritmo)', async () => {
    generateRecommendationsMock.mockResolvedValue({
      recommendations: [],
      generatedAt: '2026-05-08T14:23:11Z',
      cacheExpiresAt: '2026-05-08T15:23:11Z',
      cacheHit: true,
    });

    const route: any = await loadRoute();
    const handler = route.handleGetBibliotecaRecommendations;
    const { req, res } = makeReqRes({ userId: 'USER-0001' });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.cacheHit).toBe(true);
  });
});

// =============================================================================
// POST /api/biblioteca/recommendations/refresh
// =============================================================================
describe('POST /api/biblioteca/recommendations/refresh — RF-2.5 + rate limit', () => {
  it('401 sem auth', async () => {
    const route: any = await loadRoute();
    const handler = route.handlePostBibliotecaRecommendationsRefresh;
    const { req, res } = makeReqRes({ userId: null });
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('200 invalida cache + re-fetch + retorna nova response', async () => {
    isRateLimitedMock.mockResolvedValue(false);
    generateRecommendationsMock.mockResolvedValue({
      recommendations: [],
      generatedAt: '2026-05-08T15:00:00Z',
      cacheExpiresAt: '2026-05-08T16:00:00Z',
      cacheHit: false,
    });

    const route: any = await loadRoute();
    const handler = route.handlePostBibliotecaRecommendationsRefresh;
    const { req, res } = makeReqRes({ userId: 'USER-0001' });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(invalidateCacheMock).toHaveBeenCalledWith('USER-0001');
    expect(generateRecommendationsMock).toHaveBeenCalled();
  });

  it('429 quando rate limit 5/dia atingido', async () => {
    isRateLimitedMock.mockResolvedValue(true);

    const route: any = await loadRoute();
    const handler = route.handlePostBibliotecaRecommendationsRefresh;
    const { req, res } = makeReqRes({ userId: 'USER-0001' });
    await handler(req, res);

    expect(res.statusCode).toBe(429);
  });
});
