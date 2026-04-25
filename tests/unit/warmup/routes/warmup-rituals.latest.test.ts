import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD (Sprint W-1): GET /api/warmup-rituals/latest (RF-16)
//
// Fonte: Docs/specs/warm-up-sprint-w1-spec.md (Secao 7.2)
//
// Comportamento: retorna ritual mais recente do usuario onde
//   version='full' AND completedAt > NOW() - 30min
// Caso contrario: null.
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

import { handleGetLatestWarmupRitual } from '../../../../server/routes/warmup-rituals';
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

describe('GET /api/warmup-rituals/latest', () => {
  it('retorna ritual recente com version=full e completedAt < 30min -> 200', async () => {
    const ritual = {
      id: 'r-1',
      userId: 'USER-0001',
      version: 'full',
      completedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      decisionToPlay: true,
      overrideUsed: false,
      emotionalCheckScore: 8,
    };
    (warmupService.getLatestRitual as any).mockResolvedValue(ritual);

    const res = makeRes();
    await handleGetLatestWarmupRitual(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(ritual);
  });

  it('retorna null quando nao ha ritual recente -> 200 com body=null', async () => {
    (warmupService.getLatestRitual as any).mockResolvedValue(null);

    const res = makeRes();
    await handleGetLatestWarmupRitual(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBeNull();
  });

  it('passa userId do req.user para o service', async () => {
    (warmupService.getLatestRitual as any).mockResolvedValue(null);

    await handleGetLatestWarmupRitual(makeReq() as any, makeRes());

    expect(warmupService.getLatestRitual).toHaveBeenCalledWith('USER-0001');
  });

  it('sem req.user -> 401', async () => {
    const res = makeRes();
    await handleGetLatestWarmupRitual(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('user sem mental_prep_access -> 403', async () => {
    const res = makeRes();
    await handleGetLatestWarmupRitual(
      makeReq({ user: { userPlatformId: 'USER-0001', permissions: [] } }) as any,
      res,
    );
    expect(res.statusCode).toBe(403);
  });

  it('ritual com overrideUsed=true ainda e considerado valido (gate aceita)', async () => {
    const overrideRitual = {
      id: 'r-2',
      userId: 'USER-0001',
      version: 'full',
      completedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      decisionToPlay: true,
      overrideUsed: true,
      emotionalCheckScore: 4,
    };
    (warmupService.getLatestRitual as any).mockResolvedValue(overrideRitual);

    const res = makeRes();
    await handleGetLatestWarmupRitual(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.overrideUsed).toBe(true);
  });
});
