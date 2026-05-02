import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-2B / RF-01 — State machine pending -> completed -> undone/expired
//
// Fontes:
//   - Docs/specs/coach-2b.md (RF-01)
//   - ADR-077 (statuses + colunas)
//   - ADR-083 (state machine completa)
//
// Endpoints (server/routes/coach.ts):
//   POST /api/coach/actions/:id/confirm
//   POST /api/coach/actions/:id/cancel
//   POST /api/coach/actions/:id/undo
//   GET  /api/coach/actions/:id
//
// Lessons:
//   - #194 (atomicidade tx) -> tests integration validam (em arquivo separado).
//   - #3 mocks com SHAPE REAL: storage.getCoachAction retorna shape definido em ADR-077.
// =============================================================================

const getCoachActionMock = vi.fn();
const updateCoachActionMock = vi.fn();
const transactionMock = vi.fn();
const fetchPayloadBeforeMock = vi.fn();
const executeConfirmedMock = vi.fn();
const undoMock = vi.fn();

vi.mock('../../../server/storage', () => ({
  storage: {
    getCoachAction: getCoachActionMock,
    updateCoachAction: updateCoachActionMock,
    transaction: transactionMock,
  },
}));

// O coachToolRunner expoe (Implementer cria):
//   confirmCoachAction(actionId, ctx)
//   cancelCoachAction(actionId, ctx)
//   undoCoachAction(actionId, ctx)
// Estes endpoints HTTP envelopam essas funcoes.
//
// Para mockar tools registradas (write tools), nos mockamos getTool com handler
// que retorna {fetchPayloadBefore, executeConfirmed, undo}.
const getToolMock = vi.fn();
vi.mock('../../../server/coachTools/registry', async () => {
  const actual = await vi.importActual<any>('../../../server/coachTools/registry');
  return {
    ...actual,
    getTool: getToolMock,
  };
});

function createMockReq(overrides: any = {}) {
  return {
    headers: {},
    body: {},
    params: {},
    query: {},
    user: { id: 'u-1', userPlatformId: 'USER-0001', subscriptionPlan: 'pro' },
    ...overrides,
  };
}

function createMockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((body: any) => { res.body = body; return res; });
  return res;
}

const mockTxClient = { query: vi.fn() };
beforeEach(() => {
  getCoachActionMock.mockReset();
  updateCoachActionMock.mockReset().mockResolvedValue(undefined);
  fetchPayloadBeforeMock.mockReset();
  executeConfirmedMock.mockReset();
  undoMock.mockReset();
  getToolMock.mockReset();
  transactionMock.mockReset().mockImplementation(async (fn: any) => {
    return await fn(mockTxClient);
  });
  mockTxClient.query.mockReset().mockResolvedValue({ rows: [] });
});

// ---------------------------------------------------------------------------
// CONFIRM
// ---------------------------------------------------------------------------

describe('POST /api/coach/actions/:id/confirm — happy path', () => {
  it('action pending => fetchPayloadBefore + execute + UPDATE status=completed + 200', async () => {
    getCoachActionMock.mockResolvedValue({
      id: 'act-1', userId: 'USER-0001', toolName: 'record_wallet_transaction',
      status: 'pending', input: { amount: 50, walletId: 'w-1' },
      requiresConfirmation: true,
    });
    getToolMock.mockReturnValue({
      name: 'record_wallet_transaction',
      requiresConfirmation: true,
      fetchPayloadBefore: fetchPayloadBeforeMock,
      executeConfirmed: executeConfirmedMock,
      undo: undoMock,
    });
    fetchPayloadBeforeMock.mockResolvedValue({
      walletBalanceNative: 1450, walletBalanceUSD: 1450,
    });
    executeConfirmedMock.mockResolvedValue({
      payloadAfter: { walletBalanceNative: 1500, walletBalanceUSD: 1500 },
      affectedEntityType: 'wallet_transaction',
      affectedEntityId: 'tx-x',
      output: { transactionId: 'tx-x', newBalanceNative: 1500 },
    });

    const { handlePostCoachActionConfirm } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'act-1' } });
    const res = createMockRes();
    await handlePostCoachActionConfirm(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      id: 'act-1',
      status: 'completed',
      affectedEntityType: 'wallet_transaction',
      affectedEntityId: 'tx-x',
    });
    expect(res.body.undoExpiresAt).toBeDefined();

    // UPDATE com status=completed deve ter sido chamado
    const completedCall = updateCoachActionMock.mock.calls.find((args: any[]) =>
      args[1]?.status === 'completed',
    );
    expect(completedCall).toBeDefined();
  });

  it('grava payloadBefore ANTES de chamar executeConfirmed (lesson #194)', async () => {
    getCoachActionMock.mockResolvedValue({
      id: 'act-2', userId: 'USER-0001', toolName: 'log_study_session',
      status: 'pending', input: { topic: 'solver', durationMinutes: 60 },
      requiresConfirmation: true,
    });
    getToolMock.mockReturnValue({
      name: 'log_study_session', requiresConfirmation: true,
      fetchPayloadBefore: fetchPayloadBeforeMock,
      executeConfirmed: executeConfirmedMock,
      undo: undoMock,
    });
    fetchPayloadBeforeMock.mockResolvedValue({ studySessionsToday: 0 });
    executeConfirmedMock.mockResolvedValue({
      payloadAfter: { studySessionsToday: 1 },
      affectedEntityType: 'study_session',
      affectedEntityId: 'ss-x',
      output: {},
    });

    const callOrder: string[] = [];
    fetchPayloadBeforeMock.mockImplementation(async () => {
      callOrder.push('fetchPayloadBefore');
      return { studySessionsToday: 0 };
    });
    executeConfirmedMock.mockImplementation(async () => {
      callOrder.push('executeConfirmed');
      return {
        payloadAfter: { studySessionsToday: 1 },
        affectedEntityType: 'study_session',
        affectedEntityId: 'ss-x',
        output: {},
      };
    });

    const { handlePostCoachActionConfirm } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'act-2' } });
    const res = createMockRes();
    await handlePostCoachActionConfirm(req as any, res as any);

    expect(callOrder).toEqual(['fetchPayloadBefore', 'executeConfirmed']);
  });
});

describe('POST /api/coach/actions/:id/confirm — error paths', () => {
  it('action de outro user => 403', async () => {
    getCoachActionMock.mockResolvedValue({
      id: 'act-X', userId: 'USER-OTHER', status: 'pending',
    });
    const { handlePostCoachActionConfirm } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'act-X' } });
    const res = createMockRes();
    await handlePostCoachActionConfirm(req as any, res as any);
    expect(res.statusCode).toBe(403);
  });

  it('action nao existe => 404', async () => {
    getCoachActionMock.mockResolvedValue(undefined);
    const { handlePostCoachActionConfirm } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'act-NOPE' } });
    const res = createMockRes();
    await handlePostCoachActionConfirm(req as any, res as any);
    expect(res.statusCode).toBe(404);
  });

  it('status=completed (ja confirmado) => 409 already_confirmed', async () => {
    getCoachActionMock.mockResolvedValue({
      id: 'act-1', userId: 'USER-0001', status: 'completed',
    });
    const { handlePostCoachActionConfirm } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'act-1' } });
    const res = createMockRes();
    await handlePostCoachActionConfirm(req as any, res as any);
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/already_confirmed/);
  });

  it('status=expired => 409 expired', async () => {
    getCoachActionMock.mockResolvedValue({
      id: 'act-1', userId: 'USER-0001', status: 'expired',
    });
    const { handlePostCoachActionConfirm } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'act-1' } });
    const res = createMockRes();
    await handlePostCoachActionConfirm(req as any, res as any);
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/expired|cancelled/);
  });

  it('handler.executeConfirmed throw => 422 execution_failed', async () => {
    getCoachActionMock.mockResolvedValue({
      id: 'act-3', userId: 'USER-0001', toolName: 'record_wallet_transaction',
      status: 'pending', input: { amount: 50, walletId: 'w-1' },
    });
    getToolMock.mockReturnValue({
      name: 'record_wallet_transaction',
      fetchPayloadBefore: fetchPayloadBeforeMock,
      executeConfirmed: executeConfirmedMock,
      undo: undoMock,
    });
    fetchPayloadBeforeMock.mockResolvedValue({});
    executeConfirmedMock.mockRejectedValue(new Error('insufficient_balance'));

    const { handlePostCoachActionConfirm } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'act-3' } });
    const res = createMockRes();
    await handlePostCoachActionConfirm(req as any, res as any);

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toBe('execution_failed');
  });
});

// ---------------------------------------------------------------------------
// CANCEL
// ---------------------------------------------------------------------------

describe('POST /api/coach/actions/:id/cancel', () => {
  it('action pending => UPDATE status=expired + 200', async () => {
    getCoachActionMock.mockResolvedValue({
      id: 'act-c1', userId: 'USER-0001', status: 'pending',
    });
    const { handlePostCoachActionCancel } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'act-c1' } });
    const res = createMockRes();
    await handlePostCoachActionCancel(req as any, res as any);

    expect(res.statusCode).toBe(200);
    const cancelCall = updateCoachActionMock.mock.calls.find((args: any[]) =>
      args[1]?.status === 'expired',
    );
    expect(cancelCall).toBeDefined();
  });

  it('action nao pending => 409', async () => {
    getCoachActionMock.mockResolvedValue({
      id: 'act-c2', userId: 'USER-0001', status: 'completed',
    });
    const { handlePostCoachActionCancel } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'act-c2' } });
    const res = createMockRes();
    await handlePostCoachActionCancel(req as any, res as any);
    expect(res.statusCode).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// UNDO
// ---------------------------------------------------------------------------

describe('POST /api/coach/actions/:id/undo', () => {
  it('completed dentro da janela 5min => undo + 200', async () => {
    const future = new Date(Date.now() + 4 * 60 * 1000); // 4 min restantes
    getCoachActionMock.mockResolvedValue({
      id: 'act-u1', userId: 'USER-0001', status: 'completed',
      toolName: 'record_wallet_transaction',
      payloadBefore: { walletBalanceNative: 1450 },
      payloadAfter: { walletBalanceNative: 1500 },
      undoExpiresAt: future,
    });
    getToolMock.mockReturnValue({
      name: 'record_wallet_transaction',
      undo: undoMock,
    });
    undoMock.mockResolvedValue({
      reversedEntityType: 'wallet_transaction',
      reversedEntityId: 'tx-rev',
    });

    const { handlePostCoachActionUndo } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'act-u1' } });
    const res = createMockRes();
    await handlePostCoachActionUndo(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(undoMock).toHaveBeenCalled();
    const undoneCall = updateCoachActionMock.mock.calls.find((args: any[]) =>
      args[1]?.status === 'undone',
    );
    expect(undoneCall).toBeDefined();
  });

  it('apos undoExpiresAt => 410 undo_window_expired', async () => {
    const past = new Date(Date.now() - 60 * 1000); // 1 min atras
    getCoachActionMock.mockResolvedValue({
      id: 'act-u2', userId: 'USER-0001', status: 'completed',
      toolName: 'record_wallet_transaction',
      undoExpiresAt: past,
    });
    const { handlePostCoachActionUndo } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'act-u2' } });
    const res = createMockRes();
    await handlePostCoachActionUndo(req as any, res as any);

    expect(res.statusCode).toBe(410);
    expect(res.body.message).toMatch(/undo_window_expired/);
    expect(undoMock).not.toHaveBeenCalled();
  });

  it('action ja undone => 409 already_undone', async () => {
    getCoachActionMock.mockResolvedValue({
      id: 'act-u3', userId: 'USER-0001', status: 'undone',
    });
    const { handlePostCoachActionUndo } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'act-u3' } });
    const res = createMockRes();
    await handlePostCoachActionUndo(req as any, res as any);
    expect(res.statusCode).toBe(409);
  });

  it('action de outro user => 403', async () => {
    getCoachActionMock.mockResolvedValue({
      id: 'act-u4', userId: 'USER-OTHER', status: 'completed',
      undoExpiresAt: new Date(Date.now() + 4 * 60 * 1000),
    });
    const { handlePostCoachActionUndo } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'act-u4' } });
    const res = createMockRes();
    await handlePostCoachActionUndo(req as any, res as any);
    expect(res.statusCode).toBe(403);
  });
});
