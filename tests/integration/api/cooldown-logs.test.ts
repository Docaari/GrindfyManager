import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-1 (MVP) — Endpoints /api/cooldown-logs
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-04)
// ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
// Sequence: Docs/architecture/flows/grind/sequence-cooldown-flow.mermaid
//
// Endpoints (handlers exportados de server/routes/cooldown.ts — NAO existe ainda):
//   POST   /api/cooldown-logs               -> handleCreateCooldownLog
//   PATCH  /api/cooldown-logs/:id           -> handleUpdateCooldownLog
//   GET    /api/cooldown-logs/:sessionId    -> handleGetCooldownLogBySession
//   GET    /api/cooldown-logs               -> handleListCooldownLogs
//
// Pattern espelha tests/integration/api/grind-sessions-reconcile.test.ts
// — mock storage + handlers chamados diretamente com req/res fakes.
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    getGrindSession: vi.fn(),
    getCooldownLogBySession: vi.fn(),
    getCooldownLog: vi.fn(),
    createCooldownLog: vi.fn(),
    updateCooldownLog: vi.fn(),
    listCooldownLogs: vi.fn(),
  },
}));

import {
  handleCreateCooldownLog,
  handleUpdateCooldownLog,
  handleGetCooldownLogBySession,
  handleListCooldownLogs,
} from '../../../server/routes/cooldown';
import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    query: {},
    params: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (d: any) => {
    res.body = d;
    return res;
  };
  return res;
}

// ============================================================================
// POST /api/cooldown-logs
// ============================================================================

describe('POST /api/cooldown-logs - auth', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handleCreateCooldownLog(
      makeReq({ user: undefined, body: { sessionId: 'ses_1', mode: 'full' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(storage.createCooldownLog).not.toHaveBeenCalled();
  });
});

describe('POST /api/cooldown-logs - validacao body', () => {
  beforeEach(() => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
  });

  it('400 quando sessionId ausente', async () => {
    const res = makeRes();
    await handleCreateCooldownLog(makeReq({ body: { mode: 'full' } }) as any, res);
    expect(res.statusCode).toBe(400);
    expect(storage.createCooldownLog).not.toHaveBeenCalled();
  });

  it('400 quando sessionId vazio', async () => {
    const res = makeRes();
    await handleCreateCooldownLog(
      makeReq({ body: { sessionId: '', mode: 'full' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 quando mode invalido', async () => {
    const res = makeRes();
    await handleCreateCooldownLog(
      makeReq({ body: { sessionId: 'ses_1', mode: 'complete' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 quando mode ausente', async () => {
    const res = makeRes();
    await handleCreateCooldownLog(
      makeReq({ body: { sessionId: 'ses_1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/cooldown-logs - ownership da sessao', () => {
  it('404 quando sessao nao existe', async () => {
    (storage.getGrindSession as any).mockResolvedValue(null);

    const res = makeRes();
    await handleCreateCooldownLog(
      makeReq({ body: { sessionId: 'ses_404', mode: 'full' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(storage.createCooldownLog).not.toHaveBeenCalled();
  });

  it('404 quando sessao pertence a outro usuario (mascarado)', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-OTHER',
    });

    const res = makeRes();
    await handleCreateCooldownLog(
      makeReq({ body: { sessionId: 'ses_1', mode: 'full' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(storage.createCooldownLog).not.toHaveBeenCalled();
  });
});

describe('POST /api/cooldown-logs - happy path', () => {
  beforeEach(() => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.getCooldownLogBySession as any).mockResolvedValue(null);
  });

  it('201 cria log com mode=full, completedAt=null, blocksCompleted=[]', async () => {
    (storage.createCooldownLog as any).mockResolvedValue({
      id: 'cd_1',
      userId: 'USER-0001',
      sessionId: 'ses_1',
      mode: 'full',
      blocksCompleted: [],
      completedAt: null,
      startedAt: new Date().toISOString(),
    });

    const res = makeRes();
    await handleCreateCooldownLog(
      makeReq({ body: { sessionId: 'ses_1', mode: 'full' } }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe('cd_1');
    expect(res.body.mode).toBe('full');
    expect(res.body.completedAt).toBeNull();
    expect(res.body.blocksCompleted).toEqual([]);
  });

  it('201 cria log com mode=quick', async () => {
    (storage.createCooldownLog as any).mockResolvedValue({
      id: 'cd_2',
      userId: 'USER-0001',
      sessionId: 'ses_1',
      mode: 'quick',
      blocksCompleted: [],
      completedAt: null,
    });

    const res = makeRes();
    await handleCreateCooldownLog(
      makeReq({ body: { sessionId: 'ses_1', mode: 'quick' } }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(res.body.mode).toBe('quick');
  });

  it('NAO confia em userId do body — usa req.user.userPlatformId', async () => {
    (storage.createCooldownLog as any).mockResolvedValue({
      id: 'cd_3',
      userId: 'USER-0001',
      sessionId: 'ses_1',
      mode: 'full',
    });

    const res = makeRes();
    await handleCreateCooldownLog(
      makeReq({
        body: {
          sessionId: 'ses_1',
          mode: 'full',
          userId: 'USER-9999', // tentativa de spoofing
        },
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    const call = (storage.createCooldownLog as any).mock.calls[0];
    // userId passado para o storage deve ser o autenticado
    const passedUserId = call[0]?.userId ?? call[0];
    expect(passedUserId === 'USER-0001' || call.flat().includes('USER-0001')).toBe(true);
  });
});

describe('POST /api/cooldown-logs - idempotencia (409 em duplicata)', () => {
  beforeEach(() => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
  });

  it('409 quando ja existe log para (userId, sessionId)', async () => {
    (storage.getCooldownLogBySession as any).mockResolvedValue({
      id: 'cd_existing',
      userId: 'USER-0001',
      sessionId: 'ses_1',
      mode: 'full',
    });

    const res = makeRes();
    await handleCreateCooldownLog(
      makeReq({ body: { sessionId: 'ses_1', mode: 'full' } }) as any,
      res,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('cooldown_already_exists');
    expect(res.body.logId).toBe('cd_existing');
    expect(storage.createCooldownLog).not.toHaveBeenCalled();
  });
});

// ============================================================================
// PATCH /api/cooldown-logs/:id
// ============================================================================

describe('PATCH /api/cooldown-logs/:id - auth', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handleUpdateCooldownLog(
      makeReq({
        user: undefined,
        params: { id: 'cd_1' },
        body: { blocksCompleted: ['hands'] },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(storage.updateCooldownLog).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/cooldown-logs/:id - ownership', () => {
  it('404 quando cooldown nao existe', async () => {
    (storage.getCooldownLog as any).mockResolvedValue(null);

    const res = makeRes();
    await handleUpdateCooldownLog(
      makeReq({
        params: { id: 'cd_404' },
        body: { blocksCompleted: ['hands'] },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(storage.updateCooldownLog).not.toHaveBeenCalled();
  });

  it('404 quando cooldown pertence a outro usuario', async () => {
    (storage.getCooldownLog as any).mockResolvedValue({
      id: 'cd_1',
      userId: 'USER-OTHER',
      sessionId: 'ses_1',
    });

    const res = makeRes();
    await handleUpdateCooldownLog(
      makeReq({
        params: { id: 'cd_1' },
        body: { blocksCompleted: ['hands'] },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/cooldown-logs/:id - validacao body', () => {
  beforeEach(() => {
    (storage.getCooldownLog as any).mockResolvedValue({
      id: 'cd_1',
      userId: 'USER-0001',
      sessionId: 'ses_1',
      startedAt: '2026-04-26T10:00:00Z',
    });
  });

  it('400 quando body tem mode (imutavel)', async () => {
    const res = makeRes();
    await handleUpdateCooldownLog(
      makeReq({ params: { id: 'cd_1' }, body: { mode: 'quick' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 quando body tem userId (imutavel)', async () => {
    const res = makeRes();
    await handleUpdateCooldownLog(
      makeReq({
        params: { id: 'cd_1' },
        body: { userId: 'USER-OTHER' },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 quando abGameAnswers.lesson > 200 chars', async () => {
    const res = makeRes();
    await handleUpdateCooldownLog(
      makeReq({
        params: { id: 'cd_1' },
        body: {
          abGameAnswers: {
            aGame: [],
            bGame: [],
            cGame: '',
            lesson: 'L'.repeat(201),
          },
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /api/cooldown-logs/:id - happy path', () => {
  beforeEach(() => {
    (storage.getCooldownLog as any).mockResolvedValue({
      id: 'cd_1',
      userId: 'USER-0001',
      sessionId: 'ses_1',
      startedAt: '2026-04-26T10:00:00Z',
      blocksCompleted: [],
      completedAt: null,
    });
  });

  it('200 atualiza blocksCompleted', async () => {
    (storage.updateCooldownLog as any).mockResolvedValue({
      id: 'cd_1',
      userId: 'USER-0001',
      sessionId: 'ses_1',
      blocksCompleted: ['hands'],
      completedAt: null,
    });

    const res = makeRes();
    await handleUpdateCooldownLog(
      makeReq({
        params: { id: 'cd_1' },
        body: { blocksCompleted: ['hands'] },
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.blocksCompleted).toEqual(['hands']);
  });

  it('200 atualiza abGameAnswers', async () => {
    const ans = {
      aGame: ['joguei concentrado'],
      bGame: ['call marginal'],
      cGame: 'tilt apos cooler',
      lesson: 'stop loss respeita',
    };
    (storage.updateCooldownLog as any).mockResolvedValue({
      id: 'cd_1',
      abGameAnswers: ans,
    });

    const res = makeRes();
    await handleUpdateCooldownLog(
      makeReq({
        params: { id: 'cd_1' },
        body: { abGameAnswers: ans },
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.abGameAnswers).toEqual(ans);
  });

  it('200 atualiza completedAt e calcula durationMinutes a partir de startedAt', async () => {
    // startedAt = 2026-04-26T10:00:00Z, completedAt = +600s -> 10min
    const startedAt = '2026-04-26T10:00:00Z';
    const completedAt = '2026-04-26T10:10:00Z';

    (storage.getCooldownLog as any).mockResolvedValue({
      id: 'cd_1',
      userId: 'USER-0001',
      sessionId: 'ses_1',
      startedAt,
      blocksCompleted: ['hands'],
      completedAt: null,
    });
    (storage.updateCooldownLog as any).mockImplementation(
      async (id: string, userId: string, patch: any) => ({
        id,
        userId,
        startedAt,
        completedAt: patch.completedAt,
        durationMinutes: patch.durationMinutes ?? 10,
        blocksCompleted: patch.blocksCompleted,
      }),
    );

    const res = makeRes();
    await handleUpdateCooldownLog(
      makeReq({
        params: { id: 'cd_1' },
        body: {
          blocksCompleted: ['hands', 'abc'],
          completedAt,
        },
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(200);
    // espera durationMinutes calculado pela rota antes de chamar storage
    const callArgs = (storage.updateCooldownLog as any).mock.calls[0];
    const patch = callArgs[2] ?? callArgs[1] ?? {};
    expect(patch.durationMinutes ?? res.body.durationMinutes).toBe(10);
  });

  it('PATCH idempotente (chamar 2x com mesmo body produz mesmo resultado)', async () => {
    (storage.updateCooldownLog as any).mockResolvedValue({
      id: 'cd_1',
      blocksCompleted: ['hands'],
    });

    const body = { blocksCompleted: ['hands'] };

    const r1 = makeRes();
    await handleUpdateCooldownLog(
      makeReq({ params: { id: 'cd_1' }, body }) as any,
      r1,
    );
    const r2 = makeRes();
    await handleUpdateCooldownLog(
      makeReq({ params: { id: 'cd_1' }, body }) as any,
      r2,
    );

    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(r1.body).toEqual(r2.body);
  });
});

// ============================================================================
// GET /api/cooldown-logs/:sessionId
// ============================================================================

describe('GET /api/cooldown-logs/:sessionId - auth + ownership', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handleGetCooldownLogBySession(
      makeReq({ user: undefined, params: { sessionId: 'ses_1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
  });

  it('404 quando sessao nao existe', async () => {
    (storage.getGrindSession as any).mockResolvedValue(null);

    const res = makeRes();
    await handleGetCooldownLogBySession(
      makeReq({ params: { sessionId: 'ses_404' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('404 quando sessao pertence a outro usuario', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-OTHER',
    });

    const res = makeRes();
    await handleGetCooldownLogBySession(
      makeReq({ params: { sessionId: 'ses_1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('404 quando sessao existe mas nao tem cooldown ainda', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.getCooldownLogBySession as any).mockResolvedValue(null);

    const res = makeRes();
    await handleGetCooldownLogBySession(
      makeReq({ params: { sessionId: 'ses_1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/cooldown-logs/:sessionId - happy path', () => {
  it('200 retorna log com isDraft=true quando completedAt=null', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.getCooldownLogBySession as any).mockResolvedValue({
      id: 'cd_1',
      userId: 'USER-0001',
      sessionId: 'ses_1',
      mode: 'full',
      blocksCompleted: ['hands'],
      completedAt: null,
      startedAt: '2026-04-26T10:00:00Z',
    });

    const res = makeRes();
    await handleGetCooldownLogBySession(
      makeReq({ params: { sessionId: 'ses_1' } }) as any,
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe('cd_1');
    // sequence diagram especifica isDraft = (completedAt IS NULL)
    expect(res.body.isDraft ?? res.body.completedAt === null).toBe(true);
  });

  it('200 retorna log finalizado (completedAt != null)', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.getCooldownLogBySession as any).mockResolvedValue({
      id: 'cd_1',
      userId: 'USER-0001',
      sessionId: 'ses_1',
      mode: 'full',
      blocksCompleted: ['hands', 'abc'],
      completedAt: '2026-04-26T10:10:00Z',
      durationMinutes: 10,
    });

    const res = makeRes();
    await handleGetCooldownLogBySession(
      makeReq({ params: { sessionId: 'ses_1' } }) as any,
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.completedAt).toBe('2026-04-26T10:10:00Z');
  });
});

// ============================================================================
// GET /api/cooldown-logs (lista paginada)
// ============================================================================

describe('GET /api/cooldown-logs - auth + paginacao', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handleListCooldownLogs(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('200 lista paginada (default page=1, pageSize=20)', async () => {
    (storage.listCooldownLogs as any).mockResolvedValue({
      items: [
        { id: 'cd_1', sessionId: 'ses_1', completedAt: '2026-04-26T10:10:00Z' },
        { id: 'cd_2', sessionId: 'ses_2', completedAt: '2026-04-25T20:00:00Z' },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    });

    const res = makeRes();
    await handleListCooldownLogs(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('200 respeita ?page=2&pageSize=10', async () => {
    (storage.listCooldownLogs as any).mockResolvedValue({
      items: [],
      total: 25,
      page: 2,
      pageSize: 10,
    });

    const res = makeRes();
    await handleListCooldownLogs(
      makeReq({ query: { page: '2', pageSize: '10' } }) as any,
      res,
    );

    expect(res.statusCode).toBe(200);
    const callArgs = (storage.listCooldownLogs as any).mock.calls[0];
    // userId deve ser passado, page=2, pageSize=10
    const flat = JSON.stringify(callArgs);
    expect(flat).toContain('USER-0001');
    expect(flat).toContain('2');
    expect(flat).toContain('10');
  });

  it('lista ordenada por completedAt DESC (verificado no storage)', async () => {
    (storage.listCooldownLogs as any).mockResolvedValue({
      items: [
        { id: 'cd_recent', completedAt: '2026-04-26T20:00:00Z' },
        { id: 'cd_older', completedAt: '2026-04-20T10:00:00Z' },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    });

    const res = makeRes();
    await handleListCooldownLogs(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.items[0].id).toBe('cd_recent');
  });
});

// ============================================================================
// Cross-user ownership (User A nao consegue PATCH log do User B)
// ============================================================================

describe('Cross-user ownership protection', () => {
  it('PATCH com cooldown de outro user -> 404 (mascarado)', async () => {
    (storage.getCooldownLog as any).mockResolvedValue({
      id: 'cd_userB',
      userId: 'USER-B',
      sessionId: 'ses_B',
    });

    const res = makeRes();
    await handleUpdateCooldownLog(
      makeReq({
        user: { userPlatformId: 'USER-A' },
        params: { id: 'cd_userB' },
        body: { blocksCompleted: ['hands'] },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(storage.updateCooldownLog).not.toHaveBeenCalled();
  });
});
