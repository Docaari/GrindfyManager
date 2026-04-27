import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-1 (MVP) — Endpoints /api/starred-hands
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-04)
// ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
// Sequence: Docs/architecture/flows/grind/sequence-cooldown-flow.mermaid
//
// Endpoints (handlers exportados de server/routes/cooldown.ts):
//   POST   /api/starred-hands              -> handleCreateStarredHand
//   GET    /api/starred-hands              -> handleListStarredHands
//   DELETE /api/starred-hands/:id          -> handleDeleteStarredHand
//
// Regras-chave (RF-04 + sequence diagram):
//   - sessionTournamentId.sessionId === body.sessionId (400 mismatch)
//   - limite 3 stars por sessionTournamentId (400 star_limit_reached)
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    getGrindSession: vi.fn(),
    getSessionTournament: vi.fn(),
    createStarredHand: vi.fn(),
    getStarredHand: vi.fn(),
    listStarredHands: vi.fn(),
    deleteStarredHand: vi.fn(),
    countStarredHandsByTournament: vi.fn(),
  },
}));

import {
  handleCreateStarredHand,
  handleListStarredHands,
  handleDeleteStarredHand,
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

const validBody = {
  sessionId: 'ses_1',
  sessionTournamentId: 'st_1',
  cooldownLogId: 'cd_1',
  type: 'tilt',
  spot: 'river',
  notes: 'AKs vs JJ no river — paguei drainage',
};

// ============================================================================
// POST /api/starred-hands
// ============================================================================

describe('POST /api/starred-hands - auth', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({ user: undefined, body: validBody }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(storage.createStarredHand).not.toHaveBeenCalled();
  });
});

describe('POST /api/starred-hands - validacao body', () => {
  beforeEach(() => {
    (storage.getSessionTournament as any).mockResolvedValue({
      id: 'st_1',
      sessionId: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.countStarredHandsByTournament as any).mockResolvedValue(0);
  });

  it('400 quando type invalido', async () => {
    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({ body: { ...validBody, type: 'amazing' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(storage.createStarredHand).not.toHaveBeenCalled();
  });

  it('400 quando spot invalido', async () => {
    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({ body: { ...validBody, spot: 'deep-stack' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 quando sessionId vazio', async () => {
    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({ body: { ...validBody, sessionId: '' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 quando sessionTournamentId vazio', async () => {
    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({ body: { ...validBody, sessionTournamentId: '' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 quando notes > 500 chars', async () => {
    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({ body: { ...validBody, notes: 'n'.repeat(501) } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/starred-hands - ownership e FK', () => {
  it('404 quando sessionTournamentId nao existe', async () => {
    (storage.getSessionTournament as any).mockResolvedValue(null);

    const res = makeRes();
    await handleCreateStarredHand(makeReq({ body: validBody }) as any, res);
    expect(res.statusCode).toBe(404);
    expect(storage.createStarredHand).not.toHaveBeenCalled();
  });

  it('404 quando sessionTournament pertence a outro usuario', async () => {
    (storage.getSessionTournament as any).mockResolvedValue({
      id: 'st_1',
      sessionId: 'ses_1',
      userId: 'USER-OTHER',
    });

    const res = makeRes();
    await handleCreateStarredHand(makeReq({ body: validBody }) as any, res);
    expect(res.statusCode).toBe(404);
  });

  it('400 quando sessionTournamentId.sessionId !== body.sessionId (FK consistency)', async () => {
    (storage.getSessionTournament as any).mockResolvedValue({
      id: 'st_1',
      sessionId: 'ses_OUTRA', // mismatch
      userId: 'USER-0001',
    });

    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({ body: { ...validBody, sessionId: 'ses_1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('invalid_session_tournament');
    expect(storage.createStarredHand).not.toHaveBeenCalled();
  });
});

describe('POST /api/starred-hands - limite 3 stars por torneio', () => {
  beforeEach(() => {
    (storage.getSessionTournament as any).mockResolvedValue({
      id: 'st_1',
      sessionId: 'ses_1',
      userId: 'USER-0001',
    });
  });

  it('400 quando ja existem 3 stars no mesmo sessionTournamentId', async () => {
    (storage.countStarredHandsByTournament as any).mockResolvedValue(3);

    const res = makeRes();
    await handleCreateStarredHand(makeReq({ body: validBody }) as any, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('star_limit_reached');
    expect(storage.createStarredHand).not.toHaveBeenCalled();
  });

  it('201 quando ainda ha apenas 2 stars (limite nao atingido)', async () => {
    (storage.countStarredHandsByTournament as any).mockResolvedValue(2);
    (storage.createStarredHand as any).mockResolvedValue({
      id: 'sh_1',
      ...validBody,
    });

    const res = makeRes();
    await handleCreateStarredHand(makeReq({ body: validBody }) as any, res);
    expect(res.statusCode).toBe(201);
  });
});

describe('POST /api/starred-hands - happy path', () => {
  beforeEach(() => {
    (storage.getSessionTournament as any).mockResolvedValue({
      id: 'st_1',
      sessionId: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.countStarredHandsByTournament as any).mockResolvedValue(0);
  });

  it('201 cria starred hand com todos os campos', async () => {
    (storage.createStarredHand as any).mockResolvedValue({
      id: 'sh_1',
      userId: 'USER-0001',
      sessionId: 'ses_1',
      sessionTournamentId: 'st_1',
      cooldownLogId: 'cd_1',
      type: 'tilt',
      spot: 'river',
      notes: validBody.notes,
      createdAt: new Date().toISOString(),
    });

    const res = makeRes();
    await handleCreateStarredHand(makeReq({ body: validBody }) as any, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe('sh_1');
    expect(res.body.type).toBe('tilt');
    expect(res.body.spot).toBe('river');
  });

  it('201 cria starred hand sem cooldownLogId (NULL aceito)', async () => {
    (storage.createStarredHand as any).mockResolvedValue({
      id: 'sh_2',
      userId: 'USER-0001',
      sessionId: 'ses_1',
      sessionTournamentId: 'st_1',
      cooldownLogId: null,
      type: 'leak',
      spot: 'flop',
    });

    const res = makeRes();
    const { cooldownLogId: _, ...bodyNoLogId } = validBody;
    await handleCreateStarredHand(
      makeReq({ body: { ...bodyNoLogId, type: 'leak', spot: 'flop' } }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
  });

  it('NAO confia em userId do body — usa req.user.userPlatformId', async () => {
    (storage.createStarredHand as any).mockResolvedValue({
      id: 'sh_3',
      userId: 'USER-0001',
    });

    const res = makeRes();
    await handleCreateStarredHand(
      makeReq({ body: { ...validBody, userId: 'USER-9999' } }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    const call = (storage.createStarredHand as any).mock.calls[0];
    const flat = JSON.stringify(call);
    expect(flat).toContain('USER-0001');
  });
});

// ============================================================================
// GET /api/starred-hands
// ============================================================================

describe('GET /api/starred-hands - auth', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handleListStarredHands(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/starred-hands - happy path + filtros', () => {
  it('200 lista stars filtradas por sessionId', async () => {
    (storage.listStarredHands as any).mockResolvedValue([
      { id: 'sh_1', sessionId: 'ses_1', type: 'tilt', spot: 'river' },
      { id: 'sh_2', sessionId: 'ses_1', type: 'leak', spot: 'flop' },
    ]);

    const res = makeRes();
    await handleListStarredHands(
      makeReq({ query: { sessionId: 'ses_1' } }) as any,
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  it('200 com filtro ?type=tilt&period=30d', async () => {
    (storage.listStarredHands as any).mockResolvedValue([
      { id: 'sh_1', type: 'tilt' },
    ]);

    const res = makeRes();
    await handleListStarredHands(
      makeReq({ query: { type: 'tilt', period: '30d' } }) as any,
      res,
    );

    expect(res.statusCode).toBe(200);
    const callArgs = (storage.listStarredHands as any).mock.calls[0];
    const flat = JSON.stringify(callArgs);
    expect(flat).toContain('tilt');
    expect(flat).toContain('30d');
  });

  it('200 lista vazia quando user nao tem stars', async () => {
    (storage.listStarredHands as any).mockResolvedValue([]);

    const res = makeRes();
    await handleListStarredHands(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('passa userId autenticado para storage (nao confia em query)', async () => {
    (storage.listStarredHands as any).mockResolvedValue([]);

    const res = makeRes();
    await handleListStarredHands(
      makeReq({ query: { userId: 'USER-9999' } }) as any,
      res,
    );

    expect(res.statusCode).toBe(200);
    const flat = JSON.stringify((storage.listStarredHands as any).mock.calls[0]);
    expect(flat).toContain('USER-0001');
  });
});

// ============================================================================
// DELETE /api/starred-hands/:id
// ============================================================================

describe('DELETE /api/starred-hands/:id - auth + ownership', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handleDeleteStarredHand(
      makeReq({ user: undefined, params: { id: 'sh_1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(storage.deleteStarredHand).not.toHaveBeenCalled();
  });

  it('404 quando star nao existe', async () => {
    (storage.getStarredHand as any).mockResolvedValue(null);

    const res = makeRes();
    await handleDeleteStarredHand(
      makeReq({ params: { id: 'sh_404' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(storage.deleteStarredHand).not.toHaveBeenCalled();
  });

  it('404 quando star pertence a outro usuario (mascarado)', async () => {
    (storage.getStarredHand as any).mockResolvedValue({
      id: 'sh_1',
      userId: 'USER-OTHER',
    });

    const res = makeRes();
    await handleDeleteStarredHand(
      makeReq({ params: { id: 'sh_1' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(storage.deleteStarredHand).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/starred-hands/:id - happy path', () => {
  it('200 remove star do user', async () => {
    (storage.getStarredHand as any).mockResolvedValue({
      id: 'sh_1',
      userId: 'USER-0001',
    });
    (storage.deleteStarredHand as any).mockResolvedValue(undefined);

    const res = makeRes();
    await handleDeleteStarredHand(
      makeReq({ params: { id: 'sh_1' } }) as any,
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(storage.deleteStarredHand).toHaveBeenCalledTimes(1);
  });
});
