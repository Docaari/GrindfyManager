/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-06: GET /api/study/recommendations
 *
 * Spec:    Docs/specs/sprint-studies-reform.md (RF-06, secao 8.4)
 * ADR-068: Cross-feature recommendations engine
 *
 * Lessons:
 *   #3 mock storage shape REAL
 *   #9 try/catch + log antes de fallback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/storage', () => ({
  storage: {
    getStatsLeaks: vi.fn(),
    getStaleSpots: vi.fn(),
    getDormantThemes: vi.fn(),
    getLinkedSpots: vi.fn(),
  },
}));

// Service handler — alguns implementers preferem mockar o service no nivel da route.
vi.mock('../../server/services/studyRecommendationsService', () => ({
  getRecommendations: vi.fn(),
}));

import { getRecommendations } from '../../server/services/studyRecommendationsService';

async function importRoute() {
  return await import('../../server/routes/study-recommendations');
}

function makeReqRes(userPlatformId: string | null) {
  const req: any = {
    user: userPlatformId ? { userPlatformId } : null,
    query: {},
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

describe('RF-06 GET /api/study/recommendations', () => {
  it('200 retorna { items, source_counts }', async () => {
    (getRecommendations as any).mockResolvedValue({
      items: [{ id: 'r1', type: 'leak', title: 'x', priority_score: 50, cta_action: 'open_theme', cta_url: '/x', metadata: {} }],
      source_counts: { leaks: 1, stale_spots: 0, dormant_themes: 0 },
      generated_at: new Date().toISOString(),
    });

    const route = await importRoute();
    const handler = route.handleGetStudyRecommendations || route.default;
    const { req, res } = makeReqRes('USER-0001');
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('source_counts');
  });

  it('chama service com userId do JWT', async () => {
    (getRecommendations as any).mockResolvedValue({
      items: [], source_counts: { leaks: 0, stale_spots: 0, dormant_themes: 0 }, generated_at: '',
    });
    const route = await importRoute();
    const handler = route.handleGetStudyRecommendations || route.default;
    const { req, res } = makeReqRes('USER-XYZ');
    await handler(req, res);
    expect((getRecommendations as any)).toHaveBeenCalledWith('USER-XYZ', expect.any(Number));
  });

  it('500 quando service throw — log + retorno generico', async () => {
    (getRecommendations as any).mockRejectedValue(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const route = await importRoute();
    const handler = route.handleGetStudyRecommendations || route.default;
    const { req, res } = makeReqRes('USER-0001');
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('limit default = 10', async () => {
    (getRecommendations as any).mockResolvedValue({
      items: [], source_counts: { leaks: 0, stale_spots: 0, dormant_themes: 0 }, generated_at: '',
    });
    const route = await importRoute();
    const handler = route.handleGetStudyRecommendations || route.default;
    const { req, res } = makeReqRes('USER-0001');
    await handler(req, res);
    const calls = (getRecommendations as any).mock.calls;
    expect(calls[0][1]).toBe(10);
  });
});
