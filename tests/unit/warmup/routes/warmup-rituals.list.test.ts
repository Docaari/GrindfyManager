import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD (Sprint W-1): GET /api/warmup-rituals (RF-17)
//
// Fonte: Docs/specs/warm-up-sprint-w1-spec.md (Secao 7.3)
// Lista paginada ordered by startedAt DESC. Query params: from, to, limit (max 100), offset.
//
// Status esperado: TODOS DEVEM FALHAR (red) — handler nao existe.
// =============================================================================

vi.mock('../../../../server/services/warmupService', () => ({
  warmupService: {
    createRitual: vi.fn(),
    getLatestRitual: vi.fn(),
    listRituals: vi.fn(),
  },
}));

import { handleListWarmupRituals } from '../../../../server/routes/warmup-rituals';
import { warmupService } from '../../../../server/services/warmupService';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: {
      userPlatformId: 'USER-0001',
      permissions: ['mental_prep_access'],
    },
    query: {},
    params: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: any) => { res.body = data; return res; };
  return res;
}

describe('GET /api/warmup-rituals - happy path', () => {
  it('retorna shape { items, total, limit, offset }', async () => {
    (warmupService.listRituals as any).mockResolvedValue({
      items: [
        { id: 'r-1', startedAt: '2026-04-25T18:00:00Z', version: 'full' },
      ],
      total: 1,
      limit: 14,
      offset: 0,
    });

    const res = makeRes();
    await handleListWarmupRituals(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
    expect(res.body.total).toBeDefined();
    expect(res.body.limit).toBeDefined();
    expect(res.body.offset).toBeDefined();
  });

  it('retorna lista vazia quando usuario nunca fez ritual', async () => {
    (warmupService.listRituals as any).mockResolvedValue({
      items: [],
      total: 0,
      limit: 14,
      offset: 0,
    });

    const res = makeRes();
    await handleListWarmupRituals(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });
});

describe('GET /api/warmup-rituals - paginacao', () => {
  it('default limit=14 quando query.limit ausente', async () => {
    (warmupService.listRituals as any).mockResolvedValue({
      items: [], total: 0, limit: 14, offset: 0,
    });

    await handleListWarmupRituals(makeReq() as any, makeRes());

    expect(warmupService.listRituals).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 14 }),
    );
  });

  it('aceita query.limit=50', async () => {
    (warmupService.listRituals as any).mockResolvedValue({
      items: [], total: 0, limit: 50, offset: 0,
    });

    await handleListWarmupRituals(makeReq({ query: { limit: '50' } }) as any, makeRes());

    expect(warmupService.listRituals).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
    );
  });

  it('clamp limit no maximo 100', async () => {
    (warmupService.listRituals as any).mockResolvedValue({
      items: [], total: 0, limit: 100, offset: 0,
    });

    const res = makeRes();
    await handleListWarmupRituals(
      makeReq({ query: { limit: '500' } }) as any,
      res,
    );

    // Pode ser 400 (rejeita) ou clamp em 100 — valida que NUNCA chama service com limit>100.
    if (warmupService.listRituals.mock?.calls?.length > 0) {
      const arg = (warmupService.listRituals as any).mock.calls[0][0];
      expect(arg.limit).toBeLessThanOrEqual(100);
    } else {
      expect(res.statusCode).toBe(400);
    }
  });

  it('aceita query.offset=28 (paginacao)', async () => {
    (warmupService.listRituals as any).mockResolvedValue({
      items: [], total: 0, limit: 14, offset: 28,
    });

    await handleListWarmupRituals(
      makeReq({ query: { offset: '28' } }) as any,
      makeRes(),
    );

    expect(warmupService.listRituals).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 28 }),
    );
  });
});

describe('GET /api/warmup-rituals - filtros from/to', () => {
  it('aceita filtro from (ISO date)', async () => {
    (warmupService.listRituals as any).mockResolvedValue({
      items: [], total: 0, limit: 14, offset: 0,
    });

    await handleListWarmupRituals(
      makeReq({ query: { from: '2026-04-01' } }) as any,
      makeRes(),
    );

    expect(warmupService.listRituals).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.anything() }),
    );
  });

  it('aceita from + to combinados', async () => {
    (warmupService.listRituals as any).mockResolvedValue({
      items: [], total: 0, limit: 14, offset: 0,
    });

    await handleListWarmupRituals(
      makeReq({ query: { from: '2026-04-01', to: '2026-04-25' } }) as any,
      makeRes(),
    );

    expect(warmupService.listRituals).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.anything(),
        to: expect.anything(),
      }),
    );
  });

  it('rejeita from invalido (nao-ISO) -> 400', async () => {
    const res = makeRes();
    await handleListWarmupRituals(
      makeReq({ query: { from: 'nao-eh-data' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/warmup-rituals - auth', () => {
  it('sem req.user -> 401', async () => {
    const res = makeRes();
    await handleListWarmupRituals(
      makeReq({ user: undefined }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
  });

  it('user sem mental_prep_access -> 403', async () => {
    const res = makeRes();
    await handleListWarmupRituals(
      makeReq({ user: { userPlatformId: 'USER-0001', permissions: [] } }) as any,
      res,
    );
    expect(res.statusCode).toBe(403);
  });

  it('passa userId no service para escopo', async () => {
    (warmupService.listRituals as any).mockResolvedValue({
      items: [], total: 0, limit: 14, offset: 0,
    });

    await handleListWarmupRituals(makeReq() as any, makeRes());

    expect(warmupService.listRituals).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'USER-0001' }),
    );
  });
});

describe('GET /api/warmup-rituals - ordenacao', () => {
  it('items sao ordenados por startedAt DESC (responsabilidade do storage; aqui: passa-thru)', async () => {
    const items = [
      { id: 'r-3', startedAt: '2026-04-25T18:00:00Z', version: 'full' },
      { id: 'r-2', startedAt: '2026-04-24T18:00:00Z', version: 'aborted' },
      { id: 'r-1', startedAt: '2026-04-23T18:00:00Z', version: 'full' },
    ];
    (warmupService.listRituals as any).mockResolvedValue({
      items,
      total: 3,
      limit: 14,
      offset: 0,
    });

    const res = makeRes();
    await handleListWarmupRituals(makeReq() as any, res);

    expect(res.body.items[0].id).toBe('r-3');
    expect(res.body.items[2].id).toBe('r-1');
  });
});
