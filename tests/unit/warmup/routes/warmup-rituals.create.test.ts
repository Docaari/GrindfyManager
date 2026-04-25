import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD (Sprint W-1): POST /api/warmup-rituals (RF-15)
//
// Fonte: Docs/specs/warm-up-sprint-w1-spec.md (Secao 7.1)
//
// Requirements:
//   - 201 quando payload valido full
//   - 201 quando payload aborted
//   - 400 quando version=full mas faltam campos obrigatorios
//   - 400 quando overrideUsed=true mas score>=6 (cross-field)
//   - 400 quando overrideUsed=true mas decisionToPlay=false (cross-field)
//   - 401 sem auth
//   - 403 sem permission mental_prep_access
//   - 429 rate limit (30/h por userId)
//
// Convencao do projeto: handlers exportados de server/routes/warmup-rituals.ts
// =============================================================================

vi.mock('../../../../server/services/warmupService', () => ({
  warmupService: {
    createRitual: vi.fn(),
    getLatestRitual: vi.fn(),
    listRituals: vi.fn(),
  },
}));

import {
  handleCreateWarmupRitual,
} from '../../../../server/routes/warmup-rituals';
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
    body: {},
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

const validFullBody = {
  startedAt: new Date('2026-04-25T18:00:00Z').toISOString(),
  completedAt: new Date('2026-04-25T18:10:00Z').toISOString(),
  durationMinutes: 10,
  version: 'full',
  emotionalCheckScore: 8,
  decisionToPlay: true,
  overrideUsed: false,
  blocksCompleted: [
    {
      blockId: 1,
      startedAt: '2026-04-25T18:00:00Z',
      completedAt: '2026-04-25T18:02:00Z',
      durationSeconds: 120,
    },
  ],
  sessionIntention: {
    focus: 'Foco da sessao',
    tiltPlan: 'Plano anti-tilt',
    stopCriteria: 'Stop criteria',
  },
};

const validAbortedBody = {
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  durationMinutes: 1,
  version: 'aborted',
  emotionalCheckScore: 4,
  decisionToPlay: false,
  overrideUsed: false,
  blocksCompleted: [],
  sessionIntention: null,
};

describe('POST /api/warmup-rituals - happy path', () => {
  it('payload full valido -> 201 com ritual persistido', async () => {
    (warmupService.createRitual as any).mockResolvedValue({
      id: 'r-1',
      userId: 'USER-0001',
      ...validFullBody,
    });

    const res = makeRes();
    await handleCreateWarmupRitual(makeReq({ body: validFullBody }) as any, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.version).toBe('full');
    expect(warmupService.createRitual).toHaveBeenCalledWith(
      'USER-0001',
      expect.objectContaining({ version: 'full' }),
    );
  });

  it('payload aborted (gate no-go) -> 201', async () => {
    (warmupService.createRitual as any).mockResolvedValue({
      id: 'r-2',
      userId: 'USER-0001',
      ...validAbortedBody,
    });

    const res = makeRes();
    await handleCreateWarmupRitual(makeReq({ body: validAbortedBody }) as any, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.version).toBe('aborted');
  });

  it('payload com overrideUsed=true e score<6 -> 201 (caminho valido)', async () => {
    const overrideBody = {
      ...validFullBody,
      emotionalCheckScore: 4,
      decisionToPlay: true,
      overrideUsed: true,
    };
    (warmupService.createRitual as any).mockResolvedValue({ id: 'r-3', ...overrideBody });

    const res = makeRes();
    await handleCreateWarmupRitual(makeReq({ body: overrideBody }) as any, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.overrideUsed).toBe(true);
  });
});

describe('POST /api/warmup-rituals - validacao Zod', () => {
  it('payload sem version -> 400', async () => {
    const { version: _, ...body } = validFullBody;
    const res = makeRes();
    await handleCreateWarmupRitual(makeReq({ body }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('version invalida -> 400', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({ body: { ...validFullBody, version: 'minimal' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('emotionalCheckScore=11 (fora do range 0-10) -> 400', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({ body: { ...validFullBody, emotionalCheckScore: 11 } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('emotionalCheckScore=-1 -> 400', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({ body: { ...validFullBody, emotionalCheckScore: -1 } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('startedAt nao-ISO -> 400', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({ body: { ...validFullBody, startedAt: 'nao-eh-data' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('blocksCompleted com mais de 5 blocos -> 400', async () => {
    const res = makeRes();
    const tooMany = Array.from({ length: 6 }).map((_, i) => ({
      blockId: ((i % 5) + 1),
      startedAt: '2026-04-25T18:00:00Z',
      completedAt: '2026-04-25T18:02:00Z',
      durationSeconds: 120,
    }));
    await handleCreateWarmupRitual(
      makeReq({ body: { ...validFullBody, blocksCompleted: tooMany } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('sessionIntention.focus vazio (apos trim) -> 400', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({
        body: {
          ...validFullBody,
          sessionIntention: { focus: '   ', tiltPlan: 'b', stopCriteria: 'c' },
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('sessionIntention com tiltPlan > 200 chars -> 400', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({
        body: {
          ...validFullBody,
          sessionIntention: {
            focus: 'a',
            tiltPlan: 'x'.repeat(201),
            stopCriteria: 'c',
          },
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/warmup-rituals - validacao cross-field (server-side)', () => {
  it('version=full mas sessionIntention=null -> 400', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({ body: { ...validFullBody, sessionIntention: null } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('version=full mas decisionToPlay=null -> 400', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({ body: { ...validFullBody, decisionToPlay: null } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('version=full mas emotionalCheckScore=null -> 400', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({ body: { ...validFullBody, emotionalCheckScore: null } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('overrideUsed=true mas score>=6 -> 400 (cross-field)', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({
        body: {
          ...validFullBody,
          emotionalCheckScore: 7,
          decisionToPlay: true,
          overrideUsed: true,
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('overrideUsed=true mas decisionToPlay=false -> 400 (cross-field)', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({
        body: {
          ...validFullBody,
          emotionalCheckScore: 4,
          decisionToPlay: false,
          overrideUsed: true,
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/warmup-rituals - auth/permission', () => {
  it('sem req.user -> 401', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({ user: undefined, body: validFullBody }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
  });

  it('user sem mental_prep_access -> 403', async () => {
    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({
        user: { userPlatformId: 'USER-0001', permissions: [] },
        body: validFullBody,
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/warmup-rituals - userId server-side (RNF-16)', () => {
  it('NAO confia em userId do body — usa req.user.userPlatformId', async () => {
    (warmupService.createRitual as any).mockResolvedValue({
      id: 'r-1',
      userId: 'USER-0001',
      ...validFullBody,
    });

    const res = makeRes();
    await handleCreateWarmupRitual(
      makeReq({
        body: { ...validFullBody, userId: 'USER-9999' /* tentativa de spoofing */ },
      }) as any,
      res,
    );

    expect(warmupService.createRitual).toHaveBeenCalledWith(
      'USER-0001',
      expect.any(Object),
    );
  });
});

describe('POST /api/warmup-rituals - resposta', () => {
  it('shape de resposta inclui id, version, completedAt, durationMinutes', async () => {
    (warmupService.createRitual as any).mockResolvedValue({
      id: 'r-1',
      userId: 'USER-0001',
      startedAt: validFullBody.startedAt,
      completedAt: validFullBody.completedAt,
      durationMinutes: 10,
      version: 'full',
      emotionalCheckScore: 8,
      decisionToPlay: true,
      overrideUsed: false,
      blocksCompleted: validFullBody.blocksCompleted,
      sessionIntention: validFullBody.sessionIntention,
      linkedGrindSessionId: null,
      createdAt: new Date().toISOString(),
    });

    const res = makeRes();
    await handleCreateWarmupRitual(makeReq({ body: validFullBody }) as any, res);

    expect(res.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        version: 'full',
        durationMinutes: 10,
      }),
    );
  });
});
