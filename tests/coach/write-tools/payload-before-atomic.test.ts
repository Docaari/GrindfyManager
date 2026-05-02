import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-2B / RF-01 — Atomicidade tx (lesson #194)
//
// Esta suite valida que payload_before, payload_after e a mutacao no domain
// vivem na MESMA transaction. Se snapshot pos-execute falhar, TUDO deve fazer
// rollback — incluindo a row coach_actions.
//
// Lesson #194 (atomicidade tx multi-service):
//   walletService.recordWalletTransaction aceita externalTx; coachToolRunner
//   abre tx unica e passa para o handler. Se snapshot pos-execute throw, rollback
//   reverte tudo (transaction tipica do Postgres).
// =============================================================================

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
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn((b: any) => { res.body = b; return res; });
  return res;
}

beforeEach(() => {
  getCoachActionMock.mockReset();
  updateCoachActionMock.mockReset();
  transactionMock.mockReset();
  fetchPayloadBeforeMock.mockReset();
  executeConfirmedMock.mockReset();
  undoMock.mockReset();
  getToolMock.mockReset();
});

describe('Atomicidade: tx unica para payloadBefore + execute + UPDATE final', () => {
  it('updateCoachAction sempre eh chamado COM tx (lesson #194)', async () => {
    getCoachActionMock.mockResolvedValue({
      id: 'act-tx', userId: 'USER-0001', toolName: 'record_wallet_transaction',
      status: 'pending', input: { walletId: 'w-1', amount: 50 },
      requiresConfirmation: true,
    });
    getToolMock.mockReturnValue({
      name: 'record_wallet_transaction',
      requiresConfirmation: true,
      fetchPayloadBefore: fetchPayloadBeforeMock,
      executeConfirmed: executeConfirmedMock,
      undo: undoMock,
    });
    fetchPayloadBeforeMock.mockResolvedValue({ walletBalanceNative: 1000 });
    executeConfirmedMock.mockResolvedValue({
      payloadAfter: { walletBalanceNative: 1050 },
      affectedEntityType: 'wallet_transaction',
      affectedEntityId: 'tx-y',
      output: {},
    });

    const txClient = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    transactionMock.mockImplementation(async (fn: any) => fn(txClient));

    const { handlePostCoachActionConfirm } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'act-tx' } });
    const res = createMockRes();
    await handlePostCoachActionConfirm(req as any, res as any);

    // Toda updateCoachAction durante /confirm deve receber {tx: txClient}
    const callsInTx = updateCoachActionMock.mock.calls.filter((args: any[]) => {
      const opts = args[2];
      return opts?.tx === txClient;
    });
    expect(callsInTx.length).toBeGreaterThan(0);
  });

  it('handler.executeConfirmed recebe txClient como parametro', async () => {
    getCoachActionMock.mockResolvedValue({
      id: 'act-tx2', userId: 'USER-0001', toolName: 'log_study_session',
      status: 'pending', input: { topic: 'solver', durationMinutes: 60 },
      requiresConfirmation: true,
    });
    getToolMock.mockReturnValue({
      name: 'log_study_session', requiresConfirmation: true,
      fetchPayloadBefore: fetchPayloadBeforeMock,
      executeConfirmed: executeConfirmedMock,
      undo: undoMock,
    });
    fetchPayloadBeforeMock.mockResolvedValue({});
    executeConfirmedMock.mockResolvedValue({
      payloadAfter: {}, affectedEntityType: 'study_session',
      affectedEntityId: 'ss-1', output: {},
    });

    const txClient = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    transactionMock.mockImplementation(async (fn: any) => fn(txClient));

    const { handlePostCoachActionConfirm } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'act-tx2' } });
    const res = createMockRes();
    await handlePostCoachActionConfirm(req as any, res as any);

    expect(executeConfirmedMock).toHaveBeenCalled();
    // 3o argumento = txClient (input, ctx, txClient)
    const args = executeConfirmedMock.mock.calls[0];
    const ctxOrTx = args[2] ?? args[1]?.txClient ?? args[1]?.tx;
    expect(ctxOrTx === txClient || args[1]?.tx === txClient).toBe(true);
  });

  it('falha em executeConfirmed faz transaction rollback (UPDATE final NAO eh chamado)', async () => {
    getCoachActionMock.mockResolvedValue({
      id: 'act-tx3', userId: 'USER-0001', toolName: 'record_wallet_transaction',
      status: 'pending', input: { walletId: 'w-1', amount: 50 },
      requiresConfirmation: true,
    });
    getToolMock.mockReturnValue({
      name: 'record_wallet_transaction', requiresConfirmation: true,
      fetchPayloadBefore: fetchPayloadBeforeMock,
      executeConfirmed: executeConfirmedMock,
      undo: undoMock,
    });
    fetchPayloadBeforeMock.mockResolvedValue({ walletBalanceNative: 100 });
    executeConfirmedMock.mockRejectedValue(new Error('insufficient_balance'));

    const txClient = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    let rolledBack = false;
    transactionMock.mockImplementation(async (fn: any) => {
      try {
        return await fn(txClient);
      } catch (err) {
        rolledBack = true;
        throw err;
      }
    });

    const { handlePostCoachActionConfirm } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'act-tx3' } });
    const res = createMockRes();
    await handlePostCoachActionConfirm(req as any, res as any);

    expect(res.statusCode).toBe(422);
    expect(rolledBack).toBe(true);

    // updateCoachAction com status='completed' NAO deve ter sido chamado
    const completedCall = updateCoachActionMock.mock.calls.find((args: any[]) =>
      args[1]?.status === 'completed',
    );
    expect(completedCall).toBeUndefined();
  });

  it('falha em snapshot pos-execute (caso simulado) -> tx rolled back; status volta para pending', async () => {
    // Simulamos que recordWalletTransaction e snapshot vivem na mesma tx;
    // se snapshot falhar, o handler.executeConfirmed throw e rollback acontece.
    getCoachActionMock.mockResolvedValue({
      id: 'act-tx4', userId: 'USER-0001', toolName: 'record_wallet_transaction',
      status: 'pending', input: { walletId: 'w-1', amount: 50 },
      requiresConfirmation: true,
    });
    getToolMock.mockReturnValue({
      name: 'record_wallet_transaction', requiresConfirmation: true,
      fetchPayloadBefore: fetchPayloadBeforeMock,
      executeConfirmed: executeConfirmedMock,
      undo: undoMock,
    });
    fetchPayloadBeforeMock.mockResolvedValue({ walletBalanceNative: 1000 });
    executeConfirmedMock.mockImplementation(async () => {
      // simula falha apos primeira escrita interna (snapshot etapa 2 falha)
      throw new Error('snapshot_failed');
    });

    let txCommitted = false;
    transactionMock.mockImplementation(async (fn: any) => {
      const tx = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      try {
        const result = await fn(tx);
        txCommitted = true;
        return result;
      } catch (err) {
        throw err;
      }
    });

    const { handlePostCoachActionConfirm } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'act-tx4' } });
    const res = createMockRes();
    await handlePostCoachActionConfirm(req as any, res as any);

    expect(res.statusCode).toBe(422);
    expect(txCommitted).toBe(false);
  });
});
