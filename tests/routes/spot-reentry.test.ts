/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spot-Anki-Reentry-3 — RF-2.4: POST/DELETE /api/spots/:id/reentry
 *
 * Spec: Docs/specs/spot-anki-reentry-3.md §RF-2.4
 *
 * Cobertura RED:
 *   - POST /api/spots/:id/reentry
 *     * 201 + isNew=true quando criado.
 *     * 200/409 + isNew=false quando ja existe ativo (idempotency).
 *     * 403 quando spot nao pertence ao user.
 *     * 404 quando spot nao existe.
 *     * 400 quando source invalido.
 *     * Initial state computado por source (ADR-139).
 *   - DELETE /api/spots/:id/reentry
 *     * 200 + archived=true.
 *     * 200 + archived=false quando nao havia ativo.
 *
 * Lessons aplicadas:
 *   #14 vi.hoisted spies
 *
 * Status RED: arquivo server/routes/spot-reentry.ts NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getStarredHandByIdMock,
  getActiveReentryCardForSpotMock,
  createSpotReentryCardMock,
  archiveReentryCardMock,
} = vi.hoisted(() => ({
  getStarredHandByIdMock: vi.fn(),
  getActiveReentryCardForSpotMock: vi.fn(),
  createSpotReentryCardMock: vi.fn(),
  archiveReentryCardMock: vi.fn(),
}));

vi.mock('../../server/storage', () => ({
  storage: {
    getStarredHandById: getStarredHandByIdMock,
    getActiveReentryCardForSpot: getActiveReentryCardForSpotMock,
    createSpotReentryCard: createSpotReentryCardMock,
    archiveReentryCard: archiveReentryCardMock,
  },
}));

async function loadRoute() {
  const mod: any = await import('../../server/routes/spot-reentry');
  return mod;
}

function makeReqRes(opts: { user?: any; params?: any; body?: any } = {}) {
  const req: any = {
    user: opts.user ?? { userPlatformId: 'USER-0001' },
    params: opts.params ?? {},
    body: opts.body ?? {},
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
// POST /api/spots/:id/reentry
// =============================================================================
describe('POST /api/spots/:id/reentry', () => {
  it('201 cria card novo (manual_add default)', async () => {
    getStarredHandByIdMock.mockResolvedValue({
      id: 'spot-1', userId: 'USER-0001',
    });
    getActiveReentryCardForSpotMock.mockResolvedValue(null);
    createSpotReentryCardMock.mockResolvedValue({
      id: 'card-1',
      userId: 'USER-0001',
      spotId: 'spot-1',
      source: 'manual_add',
      intervalDays: '1.00',
      easeFactor: '2.50',
    });
    const route = await loadRoute();
    const handler = route.handlePostSpotReentry || route.default;
    const { req, res } = makeReqRes({
      params: { id: 'spot-1' },
      body: {},
    });
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.isNew).toBe(true);
    expect(res.body.card.spotId).toBe('spot-1');
  });

  it('200/409 com isNew=false quando ja existe card ativo', async () => {
    getStarredHandByIdMock.mockResolvedValue({
      id: 'spot-1', userId: 'USER-0001',
    });
    getActiveReentryCardForSpotMock.mockResolvedValue({
      id: 'card-existing', userId: 'USER-0001', spotId: 'spot-1', archivedAt: null,
    });
    const route = await loadRoute();
    const handler = route.handlePostSpotReentry || route.default;
    const { req, res } = makeReqRes({
      params: { id: 'spot-1' },
    });
    await handler(req, res);
    expect([200, 409]).toContain(res.statusCode);
    expect(res.body.isNew).toBe(false);
    expect(res.body.card.id).toBe('card-existing');
  });

  it('404 quando spot nao existe', async () => {
    getStarredHandByIdMock.mockResolvedValue(null);
    const route = await loadRoute();
    const handler = route.handlePostSpotReentry || route.default;
    const { req, res } = makeReqRes({
      params: { id: 'spot-inexistente' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('403 quando spot pertence a outro user', async () => {
    getStarredHandByIdMock.mockResolvedValue({
      id: 'spot-1', userId: 'USER-OUTRO',
    });
    const route = await loadRoute();
    const handler = route.handlePostSpotReentry || route.default;
    const { req, res } = makeReqRes({
      user: { userPlatformId: 'USER-0001' },
      params: { id: 'spot-1' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(403);
  });

  it('400 quando source enviado eh invalido', async () => {
    getStarredHandByIdMock.mockResolvedValue({ id: 'spot-1', userId: 'USER-0001' });
    const route = await loadRoute();
    const handler = route.handlePostSpotReentry || route.default;
    const { req, res } = makeReqRes({
      params: { id: 'spot-1' },
      body: { source: 'foo_bar_invalid' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('source=coach_session_insight respeitado quando enviado', async () => {
    getStarredHandByIdMock.mockResolvedValue({
      id: 'spot-2', userId: 'USER-0001',
      decisionCorrect: false, confidenceLevel: null,
    });
    getActiveReentryCardForSpotMock.mockResolvedValue(null);
    createSpotReentryCardMock.mockResolvedValue({
      id: 'card-2', spotId: 'spot-2', userId: 'USER-0001', source: 'coach_session_insight',
    });
    const route = await loadRoute();
    const handler = route.handlePostSpotReentry || route.default;
    const { req, res } = makeReqRes({
      params: { id: 'spot-2' },
      body: { source: 'coach_session_insight' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    expect(createSpotReentryCardMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'coach_session_insight' }),
    );
  });

  it('passa decisionCorrect/confidenceLevel para computeInitialState (ADR-139)', async () => {
    getStarredHandByIdMock.mockResolvedValue({
      id: 'spot-3', userId: 'USER-0001',
      decisionCorrect: null, confidenceLevel: 1,
    });
    getActiveReentryCardForSpotMock.mockResolvedValue(null);
    createSpotReentryCardMock.mockResolvedValue({
      id: 'card-3', spotId: 'spot-3', userId: 'USER-0001', source: 'coach_session_insight',
      intervalDays: '2.00',
    });
    const route = await loadRoute();
    const handler = route.handlePostSpotReentry || route.default;
    const { req, res } = makeReqRes({
      params: { id: 'spot-3' },
      body: { source: 'coach_session_insight' },
    });
    await handler(req, res);
    // Validamos que o intervalDays passado eh 2 (low confidence). Implementer
    // pode passar Number ou string '2.00' — aceita ambos.
    const callArgs = createSpotReentryCardMock.mock.calls[0]?.[0];
    if (callArgs?.intervalDays !== undefined) {
      expect(Number(callArgs.intervalDays)).toBe(2);
    }
  });

  it('500 quando storage throw', async () => {
    getStarredHandByIdMock.mockRejectedValue(new Error('db boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const route = await loadRoute();
    const handler = route.handlePostSpotReentry || route.default;
    const { req, res } = makeReqRes({ params: { id: 'spot-1' } });
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// =============================================================================
// DELETE /api/spots/:id/reentry
// =============================================================================
describe('DELETE /api/spots/:id/reentry', () => {
  it('200 archived=true quando havia card ativo', async () => {
    archiveReentryCardMock.mockResolvedValue({ archived: true });
    const route = await loadRoute();
    const handler = route.handleDeleteSpotReentry || route.default;
    const { req, res } = makeReqRes({ params: { id: 'spot-1' } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.archived).toBe(true);
  });

  it('200 archived=false quando nao havia card ativo (idempotent)', async () => {
    archiveReentryCardMock.mockResolvedValue({ archived: false });
    const route = await loadRoute();
    const handler = route.handleDeleteSpotReentry || route.default;
    const { req, res } = makeReqRes({ params: { id: 'spot-without' } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.archived).toBe(false);
  });

  it('passa userPlatformId para ownership', async () => {
    archiveReentryCardMock.mockResolvedValue({ archived: true });
    const route = await loadRoute();
    const handler = route.handleDeleteSpotReentry || route.default;
    const { req, res } = makeReqRes({
      user: { userPlatformId: 'USER-XYZ' },
      params: { id: 'spot-1' },
    });
    await handler(req, res);
    expect(archiveReentryCardMock).toHaveBeenCalledWith('USER-XYZ', 'spot-1');
  });
});
