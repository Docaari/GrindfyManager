/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Coach-Biblio-2 — RF-4 Routes Coach Session Insights.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-4.5 (endpoints)
 *        - GET   /api/coach/session-insights/:sessionId
 *        - POST  /api/coach/session-insights/:sessionId/regenerate
 * ADRs : 133 (cache em tabela), 134 (service orquestrador)
 *
 * Cobertura:
 *   - 401 sem auth
 *   - 403 cross-user (nao-owner)
 *   - 400 sessao NAO finalizada
 *   - 200 cache hit retorna sem chamar Coach (cached: true)
 *   - 200 cache miss chama Coach e persiste (cached: false)
 *   - 429 quando regenerate excede rate limit 3/sessao
 *   - quota Coach=0 retorna erro estruturado (429 ou 200 com flag)
 *
 * Lessons aplicadas: #14 vi.hoisted, #5 vi.fn ok
 *
 * Status RED: server/routes/coach-session-insights.ts NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getOrGenerateMock,
  regenerateMock,
  isRegenerateRateLimitedMock,
  recordRegenerateMock,
} = vi.hoisted(() => ({
  getOrGenerateMock: vi.fn(),
  regenerateMock: vi.fn(),
  isRegenerateRateLimitedMock: vi.fn(),
  recordRegenerateMock: vi.fn(),
}));

vi.mock('../../server/services/coachSessionInsightsService', () => ({
  getOrGenerateCoachSessionInsights: getOrGenerateMock,
  regenerateCoachSessionInsights: regenerateMock,
  isCoachInsightsRateLimited: isRegenerateRateLimitedMock,
  recordCoachInsightsRegenerate: recordRegenerateMock,
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
  return await import('../../server/routes/coach-session-insights');
}

beforeEach(() => {
  vi.clearAllMocks();
  isRegenerateRateLimitedMock.mockResolvedValue(false);
});

// =============================================================================
// GET /api/coach/session-insights/:sessionId
// =============================================================================
describe('GET /api/coach/session-insights/:sessionId', () => {
  it('401 sem auth', async () => {
    const route: any = await loadRoute();
    const handler = route.handleGetCoachSessionInsights;
    const { req, res } = makeReqRes({ userId: null, params: { sessionId: 'gs-1' } });
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('403 quando user nao eh owner da sessao (NOT_OWNER)', async () => {
    getOrGenerateMock.mockRejectedValue(
      Object.assign(new Error('not owner'), { code: 'NOT_OWNER' }),
    );

    const route: any = await loadRoute();
    const handler = route.handleGetCoachSessionInsights;
    const { req, res } = makeReqRes({
      userId: 'USER-INTRUDER',
      params: { sessionId: 'gs-1' },
    });
    await handler(req, res);

    expect(res.statusCode).toBe(403);
  });

  it('400 quando sessao NAO finalizada (SESSION_NOT_FINALIZED)', async () => {
    getOrGenerateMock.mockRejectedValue(
      Object.assign(new Error('not finalized'), { code: 'SESSION_NOT_FINALIZED' }),
    );

    const route: any = await loadRoute();
    const handler = route.handleGetCoachSessionInsights;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { sessionId: 'gs-running' },
    });
    await handler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('200 cache hit retorna {cached: true, ...} (sem chamar Coach)', async () => {
    getOrGenerateMock.mockResolvedValue({
      cached: true,
      generatedAt: '2026-05-08T20:00:00Z',
      expiresAt: '2026-05-09T20:00:00Z',
      insights: {
        summary: 'cached',
        topHands: [],
        suggestedLessons: [],
        spotsToReview: [],
        focusStatsHighlight: [],
      },
    });

    const route: any = await loadRoute();
    const handler = route.handleGetCoachSessionInsights;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { sessionId: 'gs-1' },
    });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(res.body.insights.summary).toBe('cached');
  });

  it('200 cache miss chama Coach e retorna {cached: false}', async () => {
    getOrGenerateMock.mockResolvedValue({
      cached: false,
      generatedAt: '2026-05-08T20:00:00Z',
      expiresAt: '2026-05-09T20:00:00Z',
      insights: {
        summary: 'fresh',
        topHands: [],
        suggestedLessons: [],
        spotsToReview: [],
        focusStatsHighlight: [],
      },
    });

    const route: any = await loadRoute();
    const handler = route.handleGetCoachSessionInsights;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { sessionId: 'gs-1' },
    });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.cached).toBe(false);
  });

  it('429 quando coach quota esgotada (QUOTA_EXCEEDED)', async () => {
    getOrGenerateMock.mockRejectedValue(
      Object.assign(new Error('quota'), { code: 'QUOTA_EXCEEDED' }),
    );

    const route: any = await loadRoute();
    const handler = route.handleGetCoachSessionInsights;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { sessionId: 'gs-1' },
    });
    await handler(req, res);

    expect(res.statusCode).toBe(429);
  });
});

// =============================================================================
// POST /api/coach/session-insights/:sessionId/regenerate
// =============================================================================
describe('POST /api/coach/session-insights/:sessionId/regenerate — rate limit 3/sessao', () => {
  it('401 sem auth', async () => {
    const route: any = await loadRoute();
    const handler = route.handlePostCoachSessionInsightsRegenerate;
    const { req, res } = makeReqRes({ userId: null, params: { sessionId: 'gs-1' } });
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('429 quando rate limit 3/sessao excedido', async () => {
    isRegenerateRateLimitedMock.mockResolvedValue(true);

    const route: any = await loadRoute();
    const handler = route.handlePostCoachSessionInsightsRegenerate;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { sessionId: 'gs-1' },
    });
    await handler(req, res);

    expect(res.statusCode).toBe(429);
  });

  it('200 forca regenerate (cached:false sempre) e chama service', async () => {
    regenerateMock.mockResolvedValue({
      cached: false,
      generatedAt: '2026-05-08T21:00:00Z',
      expiresAt: '2026-05-09T21:00:00Z',
      insights: { summary: 'redo', topHands: [], suggestedLessons: [], spotsToReview: [], focusStatsHighlight: [] },
    });

    const route: any = await loadRoute();
    const handler = route.handlePostCoachSessionInsightsRegenerate;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { sessionId: 'gs-1' },
    });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.cached).toBe(false);
    expect(regenerateMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'USER-0001', sessionId: 'gs-1' }),
    );
  });
});
