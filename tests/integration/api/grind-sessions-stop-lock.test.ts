/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-6: POST /api/grind-sessions gated por stop_lock_until
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-6)
 *
 * Cenarios:
 *   1. POST /grind-sessions com lock ativo -> 423 Locked
 *   2. POST /grind-sessions sem lock -> 201 normal
 *   3. PUT /grind-sessions/:id status=completed -> chama evaluateStops
 *   4. PUT status=completed quando delta < -stopLoss -> response inclui stopReached
 *   5. bankrollManagementEnabled=false -> nao bloqueia
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const stopServiceMock = {
  assertNotStopLocked: vi.fn(),
  evaluateStops: vi.fn(),
  getCurrentDayDeltaUsd: vi.fn(),
};

vi.mock('../../../server/services/stopService', () => ({
  stopService: stopServiceMock,
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getGrindSession: vi.fn(),
    createGrindSession: vi.fn(),
    updateGrindSession: vi.fn(),
    listGrindSessionsByUser: vi.fn(),
    getUserSettings: vi.fn(),
  },
}));

import { handleCreateGrindSession, handleUpdateGrindSession } from '../../../server/routes/grind-sessions';
import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getUserSettings as any).mockResolvedValue({
    bankrollManagementEnabled: true,
  });
  (storage.createGrindSession as any).mockResolvedValue({
    id: 'ses_new',
    userId: 'USER-0001',
    status: 'active',
  });
  (storage.getGrindSession as any).mockResolvedValue({
    id: 'ses_1',
    userId: 'USER-0001',
    status: 'active',
  });
  (storage.updateGrindSession as any).mockResolvedValue({
    id: 'ses_1',
    userId: 'USER-0001',
    status: 'completed',
  });
  stopServiceMock.assertNotStopLocked.mockResolvedValue(undefined);
  stopServiceMock.evaluateStops.mockResolvedValue({ stopReached: null });
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

describe('POST /api/grind-sessions — RF-6 stop_lock gate', () => {
  it('lock ativo -> 423 Locked', async () => {
    const lockedUntil = new Date(Date.now() + 60 * 60 * 1000);
    stopServiceMock.assertNotStopLocked.mockRejectedValue(
      Object.assign(new Error('STOP_LOCKED'), {
        httpStatus: 423,
        code: 'STOP_LOCKED',
        lockedUntil: lockedUntil.toISOString(),
        remainingMs: 60 * 60 * 1000,
      }),
    );
    const res = makeRes();
    await handleCreateGrindSession(
      makeReq({ body: { type: 'mtt', sessionStartTime: new Date() } }) as any,
      res,
    );
    expect(res.statusCode).toBe(423);
    expect(res.body.code ?? res.body.message).toBeDefined();
  });

  it('sem lock -> 201 normal', async () => {
    const res = makeRes();
    await handleCreateGrindSession(
      makeReq({ body: { type: 'mtt', sessionStartTime: new Date() } }) as any,
      res,
    );
    expect([200, 201]).toContain(res.statusCode);
    expect(stopServiceMock.assertNotStopLocked).toHaveBeenCalledWith('USER-0001');
  });

  it('chama assertNotStopLocked ANTES de criar sessao', async () => {
    const order: string[] = [];
    stopServiceMock.assertNotStopLocked.mockImplementation(async () => {
      order.push('assert');
    });
    (storage.createGrindSession as any).mockImplementation(async () => {
      order.push('create');
      return { id: 'ses_new' };
    });
    const res = makeRes();
    await handleCreateGrindSession(
      makeReq({ body: { type: 'mtt', sessionStartTime: new Date() } }) as any,
      res,
    );
    expect(order).toEqual(['assert', 'create']);
  });

  it('bankrollManagementEnabled=false: skip do gate', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: false,
    });
    // assertNotStopLocked nao deve throw para casual mode (service ja respeita)
    const res = makeRes();
    await handleCreateGrindSession(
      makeReq({ body: { type: 'mtt', sessionStartTime: new Date() } }) as any,
      res,
    );
    expect([200, 201]).toContain(res.statusCode);
  });
});

describe('PUT /api/grind-sessions/:id — RF-6 evaluate stops', () => {
  it('status=completed: chama evaluateStops', async () => {
    const res = makeRes();
    await handleUpdateGrindSession(
      makeReq({ params: { id: 'ses_1' }, body: { status: 'completed' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(stopServiceMock.evaluateStops).toHaveBeenCalledWith('USER-0001', 'ses_1');
  });

  it('status diferente de completed: nao chama evaluateStops', async () => {
    const res = makeRes();
    await handleUpdateGrindSession(
      makeReq({ params: { id: 'ses_1' }, body: { status: 'paused' } }) as any,
      res,
    );
    expect(stopServiceMock.evaluateStops).not.toHaveBeenCalled();
  });

  it('stopReached=loss: response inclui stopReached + lockedUntil', async () => {
    stopServiceMock.evaluateStops.mockResolvedValue({
      stopReached: 'loss',
      lockedUntil: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
    });
    const res = makeRes();
    await handleUpdateGrindSession(
      makeReq({ params: { id: 'ses_1' }, body: { status: 'completed' } }) as any,
      res,
    );
    expect(res.body.stopReached).toBe('loss');
    expect(res.body.lockedUntil).toBeDefined();
  });

  it('stopReached=win: response indica win sem lockedUntil', async () => {
    stopServiceMock.evaluateStops.mockResolvedValue({ stopReached: 'win' });
    const res = makeRes();
    await handleUpdateGrindSession(
      makeReq({ params: { id: 'ses_1' }, body: { status: 'completed' } }) as any,
      res,
    );
    expect(res.body.stopReached).toBe('win');
    expect(res.body.lockedUntil).toBeFalsy();
  });

  it('falha em evaluateStops NAO quebra update (logado, completed continua)', async () => {
    stopServiceMock.evaluateStops.mockRejectedValue(new Error('boom'));
    const res = makeRes();
    await handleUpdateGrindSession(
      makeReq({ params: { id: 'ses_1' }, body: { status: 'completed' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
  });
});
