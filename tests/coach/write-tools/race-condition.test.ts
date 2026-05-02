import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-2B / RF-01 — Race condition em /confirm paralelo
//
// ADR-083: SELECT ... FOR UPDATE garante que segundo confirm encontra status
// != pending e retorna 409 already_confirmed.
//
// Este test simula 2 confirms via Promise.all e valida exatamente 1 OK + 1 409.
// =============================================================================

// Estado interno simulando Postgres com FOR UPDATE
const stateStore: Record<string, { status: string }> = {};

const getCoachActionMock = vi.fn();
const updateCoachActionMock = vi.fn();
const transactionMock = vi.fn();
const fetchPayloadBeforeMock = vi.fn();
const executeConfirmedMock = vi.fn();
const undoMock = vi.fn();
const getToolMock = vi.fn();

vi.mock('../../../server/storage', () => ({
  storage: {
    getCoachAction: getCoachActionMock,
    updateCoachAction: updateCoachActionMock,
    transaction: transactionMock,
  },
}));

vi.mock('../../../server/coachTools/registry', async () => {
  const actual = await vi.importActual<any>('../../../server/coachTools/registry');
  return { ...actual, getTool: getToolMock };
});

function createMockReq(overrides: any = {}) {
  return {
    headers: {}, body: {}, params: {}, query: {},
    user: { id: 'u-1', userPlatformId: 'USER-0001', subscriptionPlan: 'pro' },
    ...overrides,
  };
}

function createMockRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((body: any) => { res.body = body; return res; });
  return res;
}

beforeEach(() => {
  Object.keys(stateStore).forEach(k => delete stateStore[k]);
  stateStore['act-race'] = { status: 'pending' };

  // Simular FOR UPDATE: getCoachAction le o status atual; updateCoachAction
  // muda para 'completed' atomicamente. Em paralelo, segundo getCoachAction
  // ja vai pegar status='completed' (FOR UPDATE bloqueou ate o primeiro
  // commit).
  let lockHeld = false;
  const queue: Array<() => void> = [];
  getCoachActionMock.mockImplementation(async (id: string) => {
    // Simula lock: aguarda lock liberar
    if (lockHeld) {
      await new Promise<void>(resolve => queue.push(resolve));
    }
    lockHeld = true;
    return {
      id,
      userId: 'USER-0001',
      toolName: 'record_wallet_transaction',
      status: stateStore[id]?.status || 'pending',
      input: { amount: 50, walletId: 'w-1' },
      requiresConfirmation: true,
    };
  });

  updateCoachActionMock.mockImplementation(async (id: string, delta: any) => {
    if (delta.status) {
      stateStore[id] = { status: delta.status };
    }
    // Liberar lock
    lockHeld = false;
    const next = queue.shift();
    if (next) next();
  });

  transactionMock.mockImplementation(async (fn: any) => {
    const txClient = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    return await fn(txClient);
  });

  getToolMock.mockReturnValue({
    name: 'record_wallet_transaction',
    requiresConfirmation: true,
    fetchPayloadBefore: fetchPayloadBeforeMock,
    executeConfirmed: executeConfirmedMock,
    undo: undoMock,
  });
  fetchPayloadBeforeMock.mockReset().mockResolvedValue({ walletBalanceNative: 1450 });
  executeConfirmedMock.mockReset().mockResolvedValue({
    payloadAfter: { walletBalanceNative: 1500 },
    affectedEntityType: 'wallet_transaction',
    affectedEntityId: 'tx-x',
    output: { transactionId: 'tx-x' },
  });
  undoMock.mockReset();
});

describe('Race condition: 2 POST /confirm paralelos', () => {
  it('exatamente 1 sucesso (200) + 1 conflito (409 already_confirmed)', async () => {
    const { handlePostCoachActionConfirm } =
      await import('../../../server/routes/coach');

    const req1 = createMockReq({ params: { id: 'act-race' } });
    const req2 = createMockReq({ params: { id: 'act-race' } });
    const res1 = createMockRes();
    const res2 = createMockRes();

    await Promise.all([
      handlePostCoachActionConfirm(req1 as any, res1 as any),
      handlePostCoachActionConfirm(req2 as any, res2 as any),
    ]);

    const codes = [res1.statusCode, res2.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    // Apenas 1 execute foi chamado (o segundo viu status=completed)
    expect(executeConfirmedMock.mock.calls.length).toBe(1);
  });

  it('o vencedor emite SSE/HTTP body com payloadAfter; o perdedor retorna body com message=already_confirmed', async () => {
    const { handlePostCoachActionConfirm } =
      await import('../../../server/routes/coach');

    const req1 = createMockReq({ params: { id: 'act-race' } });
    const req2 = createMockReq({ params: { id: 'act-race' } });
    const res1 = createMockRes();
    const res2 = createMockRes();
    await Promise.all([
      handlePostCoachActionConfirm(req1 as any, res1 as any),
      handlePostCoachActionConfirm(req2 as any, res2 as any),
    ]);

    const winner = res1.statusCode === 200 ? res1 : res2;
    const loser = res1.statusCode === 200 ? res2 : res1;

    expect(winner.body.status).toBe('completed');
    expect(loser.body.message).toMatch(/already_confirmed/);
  });
});
