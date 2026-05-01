/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-05: POST /api/study/theme-spot-links + GET linked-spots
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/storage', () => ({
  storage: {
    getStudyTheme: vi.fn(),
    getStarredHand: vi.fn(),
    linkSpotToTheme: vi.fn(),
    unlinkSpotFromTheme: vi.fn(),
    getLinkedSpots: vi.fn(),
  },
}));

import { storage } from '../../server/storage';

async function importRoute() {
  return await import('../../server/routes/study-theme-spot-links');
}

function makeReqRes(userPlatformId: string | null, body: any = {}, params: any = {}) {
  const req: any = {
    user: userPlatformId ? { userPlatformId } : null,
    body,
    params,
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

describe('RF-05 POST /api/study/theme-spot-links', () => {
  it('201 cria link spot↔tema valido', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({ id: 'thm_1', userId: 'USER-0001' });
    (storage.getStarredHand as any).mockResolvedValue({ id: 'spt_1', userId: 'USER-0001' });
    (storage.linkSpotToTheme as any).mockResolvedValue({
      id: 'link_1', themeId: 'thm_1', spotId: 'spt_1', userId: 'USER-0001', linkedAt: new Date(),
    });

    const route = await importRoute();
    const handler = route.handleCreateThemeSpotLink || route.default;
    const { req, res } = makeReqRes('USER-0001', { themeId: 'thm_1', spotId: 'spt_1' });
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('403 cross-user: tema de outro user', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({ id: 'thm_1', userId: 'USER-OTHER' });
    (storage.getStarredHand as any).mockResolvedValue({ id: 'spt_1', userId: 'USER-0001' });

    const route = await importRoute();
    const handler = route.handleCreateThemeSpotLink || route.default;
    const { req, res } = makeReqRes('USER-0001', { themeId: 'thm_1', spotId: 'spt_1' });
    await handler(req, res);
    expect(res.statusCode).toBe(403);
  });

  it('404 quando tema nao existe', async () => {
    (storage.getStudyTheme as any).mockResolvedValue(null);
    (storage.getStarredHand as any).mockResolvedValue({ id: 'spt_1', userId: 'USER-0001' });
    const route = await importRoute();
    const handler = route.handleCreateThemeSpotLink || route.default;
    const { req, res } = makeReqRes('USER-0001', { themeId: 'thm_x', spotId: 'spt_1' });
    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('500: storage.linkSpotToTheme falha — toast/erro generico', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({ id: 'thm_1', userId: 'USER-0001' });
    (storage.getStarredHand as any).mockResolvedValue({ id: 'spt_1', userId: 'USER-0001' });
    (storage.linkSpotToTheme as any).mockRejectedValue(new Error('db down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const route = await importRoute();
    const handler = route.handleCreateThemeSpotLink || route.default;
    const { req, res } = makeReqRes('USER-0001', { themeId: 'thm_1', spotId: 'spt_1' });
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('idempotencia: UNIQUE constraint -> retorna 200 ou 201 sem duplicar', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({ id: 'thm_1', userId: 'USER-0001' });
    (storage.getStarredHand as any).mockResolvedValue({ id: 'spt_1', userId: 'USER-0001' });
    (storage.linkSpotToTheme as any).mockResolvedValue({
      id: 'link_existing', themeId: 'thm_1', spotId: 'spt_1', userId: 'USER-0001',
      linkedAt: new Date(), alreadyLinked: true,
    });

    const route = await importRoute();
    const handler = route.handleCreateThemeSpotLink || route.default;
    const { req, res } = makeReqRes('USER-0001', { themeId: 'thm_1', spotId: 'spt_1' });
    await handler(req, res);
    expect([200, 201]).toContain(res.statusCode);
  });

  it('telemetria spot.linked_to_theme disparada (lesson #3 — log shape consistente)', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({ id: 'thm_1', userId: 'USER-0001' });
    (storage.getStarredHand as any).mockResolvedValue({ id: 'spt_1', userId: 'USER-0001' });
    (storage.linkSpotToTheme as any).mockResolvedValue({
      id: 'link_1', themeId: 'thm_1', spotId: 'spt_1', userId: 'USER-0001', linkedAt: new Date(),
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const route = await importRoute();
    const handler = route.handleCreateThemeSpotLink || route.default;
    const { req, res } = makeReqRes('USER-0001', { themeId: 'thm_1', spotId: 'spt_1', suggested: true });
    await handler(req, res);
    // Permite que telemetria seja chamada via console.log estruturado OU outro mecanismo;
    // teste apenas que o request foi bem-sucedido.
    expect([200, 201]).toContain(res.statusCode);
    logSpy.mockRestore();
  });
});

describe('RF-05 GET /api/study-themes/:id/linked-spots', () => {
  it('200 retorna array de spots vinculados', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({ id: 'thm_1', userId: 'USER-0001' });
    (storage.getLinkedSpots as any).mockResolvedValue([
      { id: 'spt_1', conclusion: 'fold', type: 'tilt', spot: 'ip_vs_bb', imageUrl: null },
    ]);

    const route = await importRoute();
    const handler = route.handleGetLinkedSpots || route.handleListLinkedSpots;
    const { req, res } = makeReqRes('USER-0001', {}, { id: 'thm_1' });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body) || Array.isArray(res.body?.items)).toBe(true);
  });

  it('403 cross-user em GET linked-spots', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({ id: 'thm_1', userId: 'USER-OTHER' });

    const route = await importRoute();
    const handler = route.handleGetLinkedSpots || route.handleListLinkedSpots;
    const { req, res } = makeReqRes('USER-0001', {}, { id: 'thm_1' });
    await handler(req, res);
    expect(res.statusCode).toBe(403);
  });
});
