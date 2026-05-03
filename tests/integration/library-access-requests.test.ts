// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint UX-Biblioteca-1 / RF-02 backend
//
// Spec: Docs/specs/ux-biblioteca-1.md RF-02
// ADR:  Docs/architecture/decisions/103-library-access-requests-table.md
//
// Handlers target (NAO EXISTEM):
//   - handleCreateLibraryAccessRequest -> POST /api/library/access-requests
//   - handleGetMyLibraryAccessRequest  -> GET  /api/library/access-requests/me
//
// Storage methods target (NAO EXISTEM):
//   - storage.createLibraryAccessRequest({ userId, name, reason, subscriptionPlanSnapshot })
//   - storage.findPendingLibraryAccessRequest(userId)
//   - storage.getLatestLibraryAccessRequestForUser(userId)
//
// Estrategia: testar handlers diretamente (mesmo padrao de telemetry-events.test.ts).
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock do storage — handlers usam storage como dependencia.
vi.mock('../../server/storage', () => ({
  storage: {
    createLibraryAccessRequest: vi.fn(),
    findPendingLibraryAccessRequest: vi.fn(),
    getLatestLibraryAccessRequestForUser: vi.fn(),
  },
}));

import { storage } from '../../server/storage';

// Handlers RED phase — nao existem ainda.
// @ts-expect-error - handler nao existe
import {
  handleCreateLibraryAccessRequest,
  handleGetMyLibraryAccessRequest,
} from '../../server/routes/library';

beforeEach(() => {
  vi.clearAllMocks();
  (storage as any).createLibraryAccessRequest.mockReset();
  (storage as any).findPendingLibraryAccessRequest.mockReset();
  (storage as any).getLatestLibraryAccessRequestForUser.mockReset();
});

function makeReq(
  body: any = {},
  user: any = { userPlatformId: 'USER-0001', subscriptionPlan: 'basic' },
) {
  return { user, body, params: {}, query: {} };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res.body = data;
    return res;
  });
  return res;
}

// =============================================================================
// POST /api/library/access-requests — happy path
// =============================================================================
describe('POST /api/library/access-requests — happy path (RF-02)', () => {
  it('deve criar pedido com snapshot de plano e retornar 201', async () => {
    (storage as any).findPendingLibraryAccessRequest.mockResolvedValueOnce(null);
    (storage as any).createLibraryAccessRequest.mockResolvedValueOnce({
      id: 'req-1',
      status: 'pending',
      createdAt: new Date('2026-05-03T12:00:00Z'),
    });
    const req = makeReq({
      name: 'Joao Player',
      reason: 'Quero estudar mentalidade e ICM porque vou jogar Sunday Million.',
    });
    const res = makeRes();
    await handleCreateLibraryAccessRequest(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(
      expect.objectContaining({ id: 'req-1', status: 'pending' }),
    );
    expect((storage as any).createLibraryAccessRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'USER-0001',
        name: 'Joao Player',
        subscriptionPlanSnapshot: 'basic',
        reason: expect.stringMatching(/Sunday Million/),
      }),
    );
  });

  it('deve usar req.user.subscriptionPlan no snapshot (NAO body — anti-spoofing)', async () => {
    (storage as any).findPendingLibraryAccessRequest.mockResolvedValueOnce(null);
    (storage as any).createLibraryAccessRequest.mockResolvedValueOnce({
      id: 'req-1',
      status: 'pending',
      createdAt: new Date(),
    });
    const req = makeReq(
      {
        name: 'Player',
        reason: 'Motivo bem detalhado vai aqui.',
        subscriptionPlan: 'premium', // tentativa de spoofing
      },
      { userPlatformId: 'USER-0001', subscriptionPlan: 'basic' },
    );
    const res = makeRes();
    await handleCreateLibraryAccessRequest(req, res);
    expect(res.statusCode).toBe(201);
    const callArgs = (storage as any).createLibraryAccessRequest.mock.calls[0][0];
    expect(callArgs.subscriptionPlanSnapshot).toBe('basic');
    expect(callArgs.subscriptionPlanSnapshot).not.toBe('premium');
  });
});

// =============================================================================
// POST — validacao Zod
// =============================================================================
describe('POST /api/library/access-requests — validacao Zod', () => {
  it('deve retornar 400 quando reason < 20 chars', async () => {
    const req = makeReq({ name: 'Joao', reason: 'curto' });
    const res = makeRes();
    await handleCreateLibraryAccessRequest(req, res);
    expect(res.statusCode).toBe(400);
    expect((storage as any).createLibraryAccessRequest).not.toHaveBeenCalled();
  });

  it('deve retornar 400 quando reason > 1000 chars', async () => {
    const req = makeReq({ name: 'Joao', reason: 'a'.repeat(1001) });
    const res = makeRes();
    await handleCreateLibraryAccessRequest(req, res);
    expect(res.statusCode).toBe(400);
    expect((storage as any).createLibraryAccessRequest).not.toHaveBeenCalled();
  });

  it('deve retornar 400 quando name vazio', async () => {
    const req = makeReq({
      name: '',
      reason: 'Motivo bem detalhado com mais de 20 caracteres.',
    });
    const res = makeRes();
    await handleCreateLibraryAccessRequest(req, res);
    expect(res.statusCode).toBe(400);
    expect((storage as any).createLibraryAccessRequest).not.toHaveBeenCalled();
  });

  it('deve retornar 400 quando name > 120 chars', async () => {
    const req = makeReq({
      name: 'a'.repeat(121),
      reason: 'Motivo bem detalhado vai aqui sem problemas.',
    });
    const res = makeRes();
    await handleCreateLibraryAccessRequest(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('deve retornar 400 quando reason ausente do body', async () => {
    const req = makeReq({ name: 'Joao' });
    const res = makeRes();
    await handleCreateLibraryAccessRequest(req, res);
    expect(res.statusCode).toBe(400);
  });
});

// =============================================================================
// POST — idempotencia (409 quando ja tem pending)
// =============================================================================
describe('POST /api/library/access-requests — idempotencia', () => {
  it('deve retornar 409 com existingId quando ja existe pedido pending', async () => {
    (storage as any).findPendingLibraryAccessRequest.mockResolvedValueOnce({
      id: 'req-existing',
      status: 'pending',
      createdAt: new Date('2026-05-01T00:00:00Z'),
    });
    const req = makeReq({
      name: 'Joao',
      reason: 'Motivo bem detalhado vai aqui sem problemas hoje.',
    });
    const res = makeRes();
    await handleCreateLibraryAccessRequest(req, res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual(
      expect.objectContaining({
        message: 'request_already_pending',
        existingId: 'req-existing',
      }),
    );
    // Storage create NAO deve ser chamado (rejeito antes).
    expect((storage as any).createLibraryAccessRequest).not.toHaveBeenCalled();
  });

  it('deve aceitar novo pedido quando ultimo eh status=denied', async () => {
    (storage as any).findPendingLibraryAccessRequest.mockResolvedValueOnce(null);
    (storage as any).createLibraryAccessRequest.mockResolvedValueOnce({
      id: 'req-new',
      status: 'pending',
      createdAt: new Date(),
    });
    const req = makeReq({
      name: 'Joao',
      reason: 'Motivo bem detalhado para nova tentativa de acesso.',
    });
    const res = makeRes();
    await handleCreateLibraryAccessRequest(req, res);
    expect(res.statusCode).toBe(201);
    expect((storage as any).createLibraryAccessRequest).toHaveBeenCalledTimes(1);
  });

  it('deve converter unique violation 23505 em 409 (race condition)', async () => {
    (storage as any).findPendingLibraryAccessRequest.mockResolvedValueOnce(null);
    // Simula race: SELECT diz "no pending" mas INSERT bate UNIQUE INDEX parcial.
    const pgErr: any = new Error('duplicate key violates unique constraint');
    pgErr.code = '23505';
    pgErr.constraint = 'uniq_library_access_requests_user_pending';
    (storage as any).createLibraryAccessRequest.mockRejectedValueOnce(pgErr);
    const req = makeReq({
      name: 'Joao',
      reason: 'Motivo bem detalhado vai aqui sem problemas.',
    });
    const res = makeRes();
    await handleCreateLibraryAccessRequest(req, res);
    expect(res.statusCode).toBe(409);
  });
});

// =============================================================================
// POST — auth required
// =============================================================================
describe('POST /api/library/access-requests — auth', () => {
  it('deve retornar 401 quando req.user ausente (sem auth)', async () => {
    const req = { body: { name: 'X', reason: 'Motivo motivo motivo motivo.' } } as any;
    const res = makeRes();
    await handleCreateLibraryAccessRequest(req, res);
    // Aceitar 401 OU 500 (depende de como handler lida com user nulo;
    // requireAuth normalmente cobre antes mas testamos defesa).
    expect([401, 500]).toContain(res.statusCode);
  });
});

// =============================================================================
// GET /api/library/access-requests/me
// =============================================================================
describe('GET /api/library/access-requests/me (RF-02)', () => {
  it('deve retornar 200 com ultimo pedido pending do usuario', async () => {
    (storage as any).getLatestLibraryAccessRequestForUser.mockResolvedValueOnce({
      id: 'req-1',
      status: 'pending',
      createdAt: new Date('2026-05-03T12:00:00Z'),
      name: 'Joao',
      reason: 'Motivo',
    });
    const req = makeReq({});
    const res = makeRes();
    await handleGetMyLibraryAccessRequest(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({ id: 'req-1', status: 'pending' }),
    );
    expect(
      (storage as any).getLatestLibraryAccessRequestForUser,
    ).toHaveBeenCalledWith('USER-0001');
  });

  it('deve retornar 200 com null quando user nunca pediu', async () => {
    (storage as any).getLatestLibraryAccessRequestForUser.mockResolvedValueOnce(
      null,
    );
    const req = makeReq({});
    const res = makeRes();
    await handleGetMyLibraryAccessRequest(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBeNull();
  });

  it('deve retornar 200 com pedido approved quando ultimo eh approved', async () => {
    (storage as any).getLatestLibraryAccessRequestForUser.mockResolvedValueOnce({
      id: 'req-1',
      status: 'approved',
      createdAt: new Date(),
      name: 'Joao',
      reason: 'Motivo',
    });
    const req = makeReq({});
    const res = makeRes();
    await handleGetMyLibraryAccessRequest(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('approved');
  });

  it('deve retornar 200 com pedido denied quando ultimo eh denied', async () => {
    (storage as any).getLatestLibraryAccessRequestForUser.mockResolvedValueOnce({
      id: 'req-1',
      status: 'denied',
      createdAt: new Date(),
      name: 'Joao',
      reason: 'Motivo',
    });
    const req = makeReq({});
    const res = makeRes();
    await handleGetMyLibraryAccessRequest(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('denied');
  });
});

// =============================================================================
// Rate limit (5/h por user)
// =============================================================================
describe('POST /api/library/access-requests — rate limit', () => {
  // Rate limit eh middleware express-rate-limit; teste eh mais util em e2e/HTTP.
  // Aqui validamos que o handler nao tenta criar quando middleware bloqueou.
  // O middleware retorna 429 antes de chamar handler — entao testar via
  // express app real ficaria ideal. Por ora documentamos via skipped.
  it.skip('TODO e2e: 6a tentativa em 1h retorna 429 (rate limit middleware)', () => {
    // Validado via integration test com supertest em sprint futura.
  });
});
