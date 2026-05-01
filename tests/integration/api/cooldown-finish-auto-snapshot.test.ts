/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-2: Auto-snapshot pos-cooldown (handler integration)
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-2, D2)
 * ADR-058: Auto-snapshot dentro da TX, falha logada nao bloqueia finish
 *
 * Cenarios cobertos no handler POST /api/cooldown-logs/:id/finish:
 *   1. Snapshot criado quando bankrollManagementEnabled=true
 *   2. Snapshot NAO criado quando bankrollManagementEnabled=false (skip)
 *   3. Falha em createAutoSnapshot NAO quebra finish (200 OK + snapshot:null)
 *   4. Response inclui campo `snapshot` (additive)
 *   5. createAutoSnapshot recebe userId + cooldownLogId
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: {
    getCooldownLog: vi.fn(),
    getGrindSession: vi.fn(),
    updateGrindSession: vi.fn(),
    updateCooldownLog: vi.fn(),
    setSessionPlanClosed: vi.fn(),
    setUserDashboardSnoozedUntil: vi.fn(),
    setGrindSessionStatus: vi.fn(),
    getUserSettings: vi.fn(),
  },
}));

const createAutoSnapshotMock = vi.fn();
vi.mock('../../../server/services/bankrollService', () => ({
  bankrollService: {
    createAutoSnapshot: (...args: any[]) => createAutoSnapshotMock(...args),
  },
}));

import { handleFinishCooldownLog } from '../../../server/routes/cooldown';
import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getCooldownLog as any).mockResolvedValue({
    id: 'cd_1',
    sessionId: 'ses_1',
    userId: 'USER-0001',
    mode: 'full',
    startedAt: new Date(Date.now() - 5 * 60 * 1000),
    blocksCompleted: ['hands', 'abc', 'tilt'],
  });
  (storage.getGrindSession as any).mockResolvedValue({
    id: 'ses_1',
    userId: 'USER-0001',
    status: 'ended',
  });
  (storage.updateCooldownLog as any).mockResolvedValue({
    id: 'cd_1',
    completedAt: new Date(),
  });
  (storage.updateGrindSession as any).mockResolvedValue({ id: 'ses_1', status: 'completed' });
  (storage.getUserSettings as any).mockResolvedValue({
    userId: 'USER-0001',
    bankrollManagementEnabled: true,
  });
  createAutoSnapshotMock.mockResolvedValue({
    id: 'snap_new',
    userId: 'USER-0001',
    sourceRefId: 'cd_1',
    origin: 'auto-cooldown',
    delta: '660',
  });
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: { sleepIntent: false, planClosed: true },
    query: {},
    params: { id: 'cd_1' },
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

describe('POST /api/cooldown-logs/:id/finish — RF-2 auto-snapshot', () => {
  it('chama bankrollService.createAutoSnapshot com userId + cooldownLogId', async () => {
    const res = makeRes();
    await handleFinishCooldownLog(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(createAutoSnapshotMock).toHaveBeenCalled();
    const arg = createAutoSnapshotMock.mock.calls[0][0];
    expect(arg.userId).toBe('USER-0001');
    expect(arg.cooldownLogId).toBe('cd_1');
  });

  it('response inclui campo snapshot (additive)', async () => {
    const res = makeRes();
    await handleFinishCooldownLog(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.snapshot).toBeDefined();
    expect(res.body.snapshot.id).toBe('snap_new');
    expect(res.body.snapshot.origin).toBe('auto-cooldown');
  });

  it('falha em createAutoSnapshot NAO quebra finish (snapshot:null)', async () => {
    createAutoSnapshotMock.mockRejectedValue(new Error('snapshot db down'));

    const res = makeRes();
    await handleFinishCooldownLog(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.snapshot).toBeNull();
    // Outras operacoes do finish continuam OK
    expect(res.body.id).toBe('cd_1');
  });

  it('createAutoSnapshot retorna null (idempotente / setting off) -> snapshot:null', async () => {
    createAutoSnapshotMock.mockResolvedValue(null);
    const res = makeRes();
    await handleFinishCooldownLog(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.snapshot).toBeNull();
  });

  it('sem auth -> 401 e nao chama createAutoSnapshot', async () => {
    const res = makeRes();
    await handleFinishCooldownLog(makeReq({ user: undefined }) as any, res);

    expect(res.statusCode).toBe(401);
    expect(createAutoSnapshotMock).not.toHaveBeenCalled();
  });

  it('cooldown nao encontrado -> 404 e nao chama createAutoSnapshot', async () => {
    (storage.getCooldownLog as any).mockResolvedValue(null);

    const res = makeRes();
    await handleFinishCooldownLog(makeReq() as any, res);

    expect(res.statusCode).toBe(404);
    expect(createAutoSnapshotMock).not.toHaveBeenCalled();
  });

  it('chama createAutoSnapshot APOS updateCooldownLog (ordem importa)', async () => {
    const callOrder: string[] = [];
    (storage.updateCooldownLog as any).mockImplementation(async () => {
      callOrder.push('updateCooldownLog');
      return { id: 'cd_1', completedAt: new Date() };
    });
    createAutoSnapshotMock.mockImplementation(async () => {
      callOrder.push('createAutoSnapshot');
      return { id: 'snap_new', origin: 'auto-cooldown' };
    });

    const res = makeRes();
    await handleFinishCooldownLog(makeReq() as any, res);

    expect(callOrder).toEqual(['updateCooldownLog', 'createAutoSnapshot']);
  });

  it('mode=quick tambem dispara auto-snapshot', async () => {
    (storage.getCooldownLog as any).mockResolvedValue({
      id: 'cd_q',
      sessionId: 'ses_1',
      userId: 'USER-0001',
      mode: 'quick',
      startedAt: new Date(Date.now() - 60 * 1000),
      blocksCompleted: [],
    });

    const res = makeRes();
    await handleFinishCooldownLog(makeReq({ params: { id: 'cd_q' } }) as any, res);

    expect(createAutoSnapshotMock).toHaveBeenCalled();
  });
});
