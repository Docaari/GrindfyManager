/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint B2 — M5 (lado server): cooldown finish marca session.status=completed
 *
 * Spec: Docs/specs/sprint-b2-summary-inline-reconcile.md (M5)
 *
 * Cenarios cobertos:
 *   1. POST /finish com session em status='ended': apos handler, session.status='completed'
 *   2. POST /finish com session ja em 'completed': idempotente, sem erro
 *   3. cooldown_log.status (ou completedAt) marcado apos finish
 *
 * Pattern espelha tests/integration/api/cooldown-logs.test.ts.
 *
 * Implementer deve atualizar handleFinishCooldownLog (server/routes/cooldown.ts)
 * para chamar storage.updateGrindSession({ status: 'completed' }) idempotente
 * apos POST finish OU expor metodo `setSessionStatusCompleted(sessionId, userId)`
 * idempotente.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: {
    getGrindSession: vi.fn(),
    updateGrindSession: vi.fn(),
    getCooldownLogBySession: vi.fn(),
    getCooldownLog: vi.fn(),
    createCooldownLog: vi.fn(),
    updateCooldownLog: vi.fn(),
    listCooldownLogs: vi.fn(),
    setSessionPlanClosed: vi.fn(),
    setUserDashboardSnoozedUntil: vi.fn(),
    // M5: novos metodos opcionais (implementer cria conforme decisao):
    setGrindSessionStatus: vi.fn(),
  },
}));

import { handleFinishCooldownLog } from '../../../server/routes/cooldown';
import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: { sleepIntent: false, planClosed: false },
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

// =============================================================================
// Cenario 1: session em 'ended' -> apos handler, status='completed'
// =============================================================================

describe('POST /api/cooldown-logs/:id/finish Sprint B2 (M5) — marca session completed', () => {
  it('200 e session.status passa de ended -> completed', async () => {
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
    // updateGrindSession ou setGrindSessionStatus — implementer escolhe
    (storage.updateGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      status: 'completed',
    });
    (storage.setGrindSessionStatus as any).mockResolvedValue({
      id: 'ses_1',
      status: 'completed',
    });

    const res = makeRes();
    await handleFinishCooldownLog(makeReq() as any, res);

    expect(res.statusCode).toBe(200);

    // Verifica que algum metodo foi chamado para atualizar status.
    const updateCalled =
      (storage.updateGrindSession as any).mock.calls.length > 0 ||
      (storage.setGrindSessionStatus as any).mock.calls.length > 0;
    expect(updateCalled).toBe(true);

    // Verifica que o status pedido eh 'completed' (independente de qual metodo).
    const statusUpdates: string[] = [];
    for (const call of (storage.updateGrindSession as any).mock.calls) {
      const arg = call[2] ?? call[1];
      if (arg && typeof arg === 'object' && arg.status) {
        statusUpdates.push(arg.status);
      }
    }
    for (const call of (storage.setGrindSessionStatus as any).mock.calls) {
      const arg = call[1] ?? call[2];
      if (typeof arg === 'string') statusUpdates.push(arg);
    }
    expect(statusUpdates).toContain('completed');
  });
});

// =============================================================================
// Cenario 2: session ja completed -> idempotente, sem erro
// =============================================================================

describe('POST /api/cooldown-logs/:id/finish Sprint B2 (M5) — idempotencia', () => {
  it('200 quando session ja esta em completed (sem segundo update)', async () => {
    (storage.getCooldownLog as any).mockResolvedValue({
      id: 'cd_1',
      sessionId: 'ses_1',
      userId: 'USER-0001',
      mode: 'full',
      startedAt: new Date(Date.now() - 5 * 60 * 1000),
      blocksCompleted: ['hands', 'abc', 'tilt', 'sleep'],
    });
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
      status: 'completed', // ja completed
    });
    (storage.updateCooldownLog as any).mockResolvedValue({
      id: 'cd_1',
      completedAt: new Date(),
    });
    (storage.updateGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      status: 'completed',
    });
    (storage.setGrindSessionStatus as any).mockResolvedValue({
      id: 'ses_1',
      status: 'completed',
    });

    const res = makeRes();
    await handleFinishCooldownLog(makeReq() as any, res);

    // 200 OK — idempotente
    expect(res.statusCode).toBe(200);

    // Implementer pode pular update OU chamar idempotente.
    // Aceitamos ambos comportamentos: o teste verifica que NAO deu erro.
  });
});

// =============================================================================
// Cenario 3: cooldown_log marcado completedAt apos finish (mantem existing)
// =============================================================================

describe('POST /api/cooldown-logs/:id/finish Sprint B2 (M5) — cooldown_log.completedAt', () => {
  it('updateCooldownLog eh chamado com completedAt definido', async () => {
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
    (storage.updateGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      status: 'completed',
    });
    (storage.setGrindSessionStatus as any).mockResolvedValue({});

    const res = makeRes();
    await handleFinishCooldownLog(makeReq() as any, res);

    expect(res.statusCode).toBe(200);

    const calls = (storage.updateCooldownLog as any).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const patch = calls[0][2];
    expect(patch.completedAt).toBeDefined();
  });
});
