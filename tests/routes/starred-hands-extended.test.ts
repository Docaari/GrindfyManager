/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spot-Anki-Reentry-3 — RF-1.5: PATCH /api/starred-hands/:id (extension)
 *                                       GET  /api/starred-hands?withInsight=...
 *
 * Spec: Docs/specs/spot-anki-reentry-3.md §RF-1.5
 *
 * Cobertura RED:
 *   - Auth (401 sem JWT) — assumimos middleware ja gere; aqui testamos handler.
 *   - Ownership (404 quando user_id nao bate).
 *   - Validacao Zod: insight max 1000, tags max 10 + max 40 chars cada,
 *     confidence 1-5, decisionCorrect boolean|null.
 *   - Aceita patch parcial (apenas insight).
 *   - GET filters: withInsight, tag, decisionCorrect, minConfidence.
 *
 * Lessons aplicadas:
 *   #14 vi.hoisted spies
 *   #5 vi.fn ok
 *
 * Status RED: handlers em server/routes/starred-hands.ts ainda nao tem
 * extensoes; ou novo arquivo server/routes/starred-hands-extended.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  updateStarredHandInsightMock,
  getStarredHandsWithInsightMock,
  getStarredHandByIdMock,
} = vi.hoisted(() => ({
  updateStarredHandInsightMock: vi.fn(),
  getStarredHandsWithInsightMock: vi.fn(),
  getStarredHandByIdMock: vi.fn(),
}));

vi.mock('../../server/storage', () => ({
  storage: {
    updateStarredHandInsight: updateStarredHandInsightMock,
    getStarredHandsWithInsight: getStarredHandsWithInsightMock,
    getStarredHandById: getStarredHandByIdMock,
  },
}));

async function loadRoute() {
  const mod: any = await import('../../server/routes/starred-hands-extended');
  return mod;
}

function makeReqRes(opts: { user?: { userPlatformId: string } | null; params?: any; body?: any; query?: any } = {}) {
  const req: any = {
    user: opts.user === null ? null : (opts.user ?? { userPlatformId: 'USER-0001' }),
    params: opts.params ?? {},
    body: opts.body ?? {},
    query: opts.query ?? {},
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

// =============================================================================
// PATCH /api/starred-hands/:id — extension fields
// =============================================================================
describe('PATCH /api/starred-hands/:id (RF-1.5)', () => {
  it('200 atualiza insight + tags + decision + confidence', async () => {
    updateStarredHandInsightMock.mockResolvedValue({
      id: 'spot-1',
      userId: 'USER-0001',
      insight: 'Bluff river OOP',
      tags: ['ICM', 'river'],
      decisionCorrect: false,
      confidenceLevel: 3,
    });
    const route = await loadRoute();
    const handler = route.handlePatchStarredHandInsight || route.default;
    const { req, res } = makeReqRes({
      params: { id: 'spot-1' },
      body: {
        insight: 'Bluff river OOP',
        tags: ['ICM', 'river'],
        decisionCorrect: false,
        confidenceLevel: 3,
      },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe('spot-1');
  });

  it('400 quando insight passa de 1000 chars', async () => {
    const route = await loadRoute();
    const handler = route.handlePatchStarredHandInsight || route.default;
    const { req, res } = makeReqRes({
      params: { id: 'spot-1' },
      body: { insight: 'x'.repeat(1001) },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando tags eh array com 11 itens (max 10)', async () => {
    const route = await loadRoute();
    const handler = route.handlePatchStarredHandInsight || route.default;
    const { req, res } = makeReqRes({
      params: { id: 'spot-1' },
      body: { tags: Array(11).fill('a') },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando tag individual passa de 40 chars', async () => {
    const route = await loadRoute();
    const handler = route.handlePatchStarredHandInsight || route.default;
    const { req, res } = makeReqRes({
      params: { id: 'spot-1' },
      body: { tags: ['x'.repeat(41)] },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando confidence_level=6 (range 1-5)', async () => {
    const route = await loadRoute();
    const handler = route.handlePatchStarredHandInsight || route.default;
    const { req, res } = makeReqRes({
      params: { id: 'spot-1' },
      body: { confidenceLevel: 6 },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando confidence_level=0', async () => {
    const route = await loadRoute();
    const handler = route.handlePatchStarredHandInsight || route.default;
    const { req, res } = makeReqRes({
      params: { id: 'spot-1' },
      body: { confidenceLevel: 0 },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('aceita patch parcial (apenas insight)', async () => {
    updateStarredHandInsightMock.mockResolvedValue({
      id: 'spot-1', userId: 'USER-0001', insight: 'parcial',
    });
    const route = await loadRoute();
    const handler = route.handlePatchStarredHandInsight || route.default;
    const { req, res } = makeReqRes({
      params: { id: 'spot-1' },
      body: { insight: 'parcial' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
  });

  it('404 quando spot nao existe (storage retorna null)', async () => {
    updateStarredHandInsightMock.mockResolvedValue(null);
    const route = await loadRoute();
    const handler = route.handlePatchStarredHandInsight || route.default;
    const { req, res } = makeReqRes({
      params: { id: 'spot-inexistente' },
      body: { insight: 'x' },
    });
    await handler(req, res);
    // 404 OR 403 (ownership nao bate). Implementer escolhe semantica.
    expect([403, 404]).toContain(res.statusCode);
  });

  it('passa userPlatformId para storage (ownership filter)', async () => {
    updateStarredHandInsightMock.mockResolvedValue({
      id: 'spot-1', userId: 'USER-XYZ',
    });
    const route = await loadRoute();
    const handler = route.handlePatchStarredHandInsight || route.default;
    const { req, res } = makeReqRes({
      user: { userPlatformId: 'USER-XYZ' },
      params: { id: 'spot-1' },
      body: { insight: 'x' },
    });
    await handler(req, res);
    expect(updateStarredHandInsightMock).toHaveBeenCalledWith(
      'spot-1',
      'USER-XYZ',
      expect.any(Object),
    );
  });

  it('500 quando storage throw', async () => {
    updateStarredHandInsightMock.mockRejectedValue(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const route = await loadRoute();
    const handler = route.handlePatchStarredHandInsight || route.default;
    const { req, res } = makeReqRes({
      params: { id: 'spot-1' },
      body: { insight: 'x' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// =============================================================================
// GET /api/starred-hands?withInsight=true&tag=...
// =============================================================================
describe('GET /api/starred-hands (extension filters RF-1.5)', () => {
  it('200 retorna { items, total }', async () => {
    getStarredHandsWithInsightMock.mockResolvedValue({
      items: [{ id: 'spot-1', insight: 'algo', tags: ['ICM'] }],
      total: 1,
    });
    const route = await loadRoute();
    const handler = route.handleGetStarredHands || route.default;
    const { req, res } = makeReqRes({
      query: { withInsight: 'true' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('total');
  });

  it('passa filter withInsight=true para storage', async () => {
    getStarredHandsWithInsightMock.mockResolvedValue({ items: [], total: 0 });
    const route = await loadRoute();
    const handler = route.handleGetStarredHands || route.default;
    const { req, res } = makeReqRes({ query: { withInsight: 'true' } });
    await handler(req, res);
    expect(getStarredHandsWithInsightMock).toHaveBeenCalledWith(
      'USER-0001',
      expect.objectContaining({ withInsight: true }),
    );
  });

  it('passa filter tag=ICM para storage', async () => {
    getStarredHandsWithInsightMock.mockResolvedValue({ items: [], total: 0 });
    const route = await loadRoute();
    const handler = route.handleGetStarredHands || route.default;
    const { req, res } = makeReqRes({ query: { tag: 'ICM' } });
    await handler(req, res);
    expect(getStarredHandsWithInsightMock).toHaveBeenCalledWith(
      'USER-0001',
      expect.objectContaining({ tag: 'ICM' }),
    );
  });

  it('passa filter decisionCorrect=false para storage', async () => {
    getStarredHandsWithInsightMock.mockResolvedValue({ items: [], total: 0 });
    const route = await loadRoute();
    const handler = route.handleGetStarredHands || route.default;
    const { req, res } = makeReqRes({ query: { decisionCorrect: 'false' } });
    await handler(req, res);
    expect(getStarredHandsWithInsightMock).toHaveBeenCalledWith(
      'USER-0001',
      expect.objectContaining({ decisionCorrect: false }),
    );
  });

  it('passa filter minConfidence=4 para storage (numero)', async () => {
    getStarredHandsWithInsightMock.mockResolvedValue({ items: [], total: 0 });
    const route = await loadRoute();
    const handler = route.handleGetStarredHands || route.default;
    const { req, res } = makeReqRes({ query: { minConfidence: '4' } });
    await handler(req, res);
    expect(getStarredHandsWithInsightMock).toHaveBeenCalledWith(
      'USER-0001',
      expect.objectContaining({ minConfidence: 4 }),
    );
  });
});
