/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-wallet-reconciliation.md
 *  - RF-04: POST /api/grind-sessions/:id/reconcile-wallets
 *  - RF-02: GET  /api/grind-sessions/:id/reconcilable-wallets
 *  - RF-07: validacao
 *  - RF-08: idempotencia
 *  - RF-12: telemetria (server-side opcional via spy de console.log nao
 *           coberto aqui — UI ja cobre os eventos client-side).
 *
 * Handlers que serao exportados pelo implementer (NAO existem ainda):
 *   server/routes/grind-sessions.ts
 *     - handleGetReconcilableWallets(req, res)
 *     - handlePostReconcileWallets(req, res)
 *
 * Pattern de mock alinhado com tests/integration/api/wallets-rakeback.test.ts —
 * mock o service (walletService) e o storage minimo, depois chamar handler direto
 * com req/res fakes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    recordWalletTransaction: vi.fn(),
    listWallets: vi.fn(),
  },
}));

vi.mock('../../../server/services/sessionReconciliation', () => ({
  computeAdjustment: vi.fn(),
  runReconciliation: vi.fn(),
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getGrindSession: vi.fn(),
    findReconciliationMarker: vi.fn(),
    listReconcilableWallets: vi.fn(),
    listWalletsByUser: vi.fn(),
  },
}));

import {
  handleGetReconcilableWallets,
  handlePostReconcileWallets,
} from '../../../server/routes/grind-sessions';
import { runReconciliation } from '../../../server/services/sessionReconciliation';
import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    query: {},
    params: { id: 'ses_1' },
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
// GET /reconcilable-wallets
// =============================================================================

describe('GET /api/grind-sessions/:id/reconcilable-wallets — auth (RF-02)', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handleGetReconcilableWallets(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/grind-sessions/:id/reconcilable-wallets — ownership (RF-02)', () => {
  it('404 quando sessao nao existe', async () => {
    (storage.getGrindSession as any).mockResolvedValue(null);

    const res = makeRes();
    await handleGetReconcilableWallets(
      makeReq({ params: { id: 'ses_404' } }) as any,
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
    await handleGetReconcilableWallets(makeReq() as any, res);
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/grind-sessions/:id/reconcilable-wallets — happy path (RF-02)', () => {
  it('200 com wallets ativas + flag hadActivityInSession', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    (storage.listReconcilableWallets as any).mockResolvedValue([
      {
        walletId: 'wA',
        name: 'PokerStars BR',
        platform: 'PokerStars',
        nativeCurrency: 'BRL',
        balance: 1180.0,
        expectedPreviousBalance: 1180.0,
        hadActivityInSession: true,
      },
      {
        walletId: 'wB',
        name: 'GG USD',
        platform: 'GGNetwork',
        nativeCurrency: 'USD',
        balance: 200.0,
        expectedPreviousBalance: 200.0,
        hadActivityInSession: true,
      },
    ]);

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.sessionId).toBe('ses_1');
    expect(res.body.alreadyReconciled).toBe(false);
    expect(res.body.wallets).toHaveLength(2);
    expect(res.body.wallets[0].walletId).toBe('wA');
    expect(res.body.wallets[0].hadActivityInSession).toBe(true);
  });

  it('200 alreadyReconciled=true quando preflight detecta marker', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 2 });

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.alreadyReconciled).toBe(true);
    expect(res.body.wallets).toEqual([]);
  });

  it('includeAll=true repassa flag para storage', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    (storage.listReconcilableWallets as any).mockResolvedValue([]);

    const res = makeRes();
    await handleGetReconcilableWallets(
      makeReq({ query: { includeAll: 'true' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    const args = (storage.listReconcilableWallets as any).mock.calls[0];
    // ultimo argumento deve indicar includeAll=true
    const includeAll = args.find((a: any) => typeof a === 'object' && 'includeAll' in (a ?? {}))?.includeAll
      ?? args.includes(true);
    expect(includeAll).toBe(true);
  });
});

// =============================================================================
// POST /reconcile-wallets
// =============================================================================

const validBody = {
  adjustments: [
    {
      walletId: 'wA',
      reportedBalance: 1247.0,
      expectedPreviousBalance: 1180.0,
    },
    {
      walletId: 'wB',
      reportedBalance: 165.0,
      expectedPreviousBalance: 200.0,
    },
  ],
};

describe('POST /api/grind-sessions/:id/reconcile-wallets — auth', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handlePostReconcileWallets(
      makeReq({ user: undefined, body: validBody }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(runReconciliation).not.toHaveBeenCalled();
  });
});

describe('POST /api/grind-sessions/:id/reconcile-wallets — ownership', () => {
  it('404 quando sessao nao existe', async () => {
    (storage.getGrindSession as any).mockResolvedValue(null);

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBody }) as any, res);
    expect(res.statusCode).toBe(404);
    expect(runReconciliation).not.toHaveBeenCalled();
  });

  it('404 quando sessao pertence a outro usuario', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-OTHER',
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBody }) as any, res);
    expect(res.statusCode).toBe(404);
    expect(runReconciliation).not.toHaveBeenCalled();
  });
});

describe('POST /api/grind-sessions/:id/reconcile-wallets — validacao body (RF-07)', () => {
  beforeEach(() => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
  });

  it('400 quando body nao tem adjustments', async () => {
    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: {} }) as any, res);
    expect(res.statusCode).toBe(400);
    expect(runReconciliation).not.toHaveBeenCalled();
  });

  it('400 quando reportedBalance NaN', async () => {
    const res = makeRes();
    await handlePostReconcileWallets(
      makeReq({
        body: {
          adjustments: [
            {
              walletId: 'wA',
              reportedBalance: NaN,
              expectedPreviousBalance: 1180,
            },
          ],
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 quando expectedPreviousBalance ausente', async () => {
    const res = makeRes();
    await handlePostReconcileWallets(
      makeReq({
        body: {
          adjustments: [{ walletId: 'wA', reportedBalance: 1247 }],
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 quando walletId vazio', async () => {
    const res = makeRes();
    await handlePostReconcileWallets(
      makeReq({
        body: {
          adjustments: [
            { walletId: '', reportedBalance: 1247, expectedPreviousBalance: 1180 },
          ],
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 quando duplicate_wallet (mesmo walletId 2x no array)', async () => {
    const res = makeRes();
    await handlePostReconcileWallets(
      makeReq({
        body: {
          adjustments: [
            { walletId: 'wA', reportedBalance: 1247, expectedPreviousBalance: 1180 },
            { walletId: 'wA', reportedBalance: 1300, expectedPreviousBalance: 1180 },
          ],
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('duplicate_wallet');
  });
});

describe('POST /api/grind-sessions/:id/reconcile-wallets — happy path (RF-04, US-01)', () => {
  beforeEach(() => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
  });

  it('200 com 2 ajustes -> retorna txCreated com 2 transacoes', async () => {
    (runReconciliation as any).mockResolvedValue({
      created: [
        { id: 'tx1', walletId: 'wA', direction: 'in', nativeAmount: '67' },
        { id: 'tx2', walletId: 'wB', direction: 'out', nativeAmount: '35' },
      ],
      skipped: 0,
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBody }) as any, res);

    expect(res.statusCode).toBe(200);
    // Spec menciona 'created' E 'txCreated'; aceitamos qualquer um — o handler escolhe.
    const created = res.body.txCreated ?? res.body.created;
    expect(Array.isArray(created)).toBe(true);
    expect(created).toHaveLength(2);
    expect(res.body.skipped).toBe(0);
  });

  it('repassa userId, sessionId, adjustments para runReconciliation', async () => {
    (runReconciliation as any).mockResolvedValue({ created: [], skipped: 0 });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBody }) as any, res);
    expect(res.statusCode).toBe(200);

    expect(runReconciliation).toHaveBeenCalledTimes(1);
    const args = (runReconciliation as any).mock.calls[0];
    expect(args[0]).toBe('USER-0001');
    expect(args[1]).toBe('ses_1');
    expect(args[2]).toHaveLength(2);
  });

  it('200 com adjustments=[] -> txCreated=[]', async () => {
    (runReconciliation as any).mockResolvedValue({ created: [], skipped: 0 });

    const res = makeRes();
    await handlePostReconcileWallets(
      makeReq({ body: { adjustments: [] } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    const created = res.body.txCreated ?? res.body.created;
    expect(created).toEqual([]);
  });
});

describe('POST /api/grind-sessions/:id/reconcile-wallets — fail-fast mid-batch (RF-04, US-04)', () => {
  beforeEach(() => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
  });

  it('409 balance_mismatch com txCreated parcial preservadas', async () => {
    (runReconciliation as any).mockResolvedValue({
      created: [
        { id: 'tx1', walletId: 'wA', direction: 'in', nativeAmount: '67' },
      ],
      skipped: 0,
      failed: {
        walletId: 'wB',
        code: 'balance_mismatch',
        currentBalance: 1280,
        message: 'balance_mismatch',
      },
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBody }) as any, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('balance_mismatch');
    const created = res.body.txCreated ?? res.body.created;
    expect(created).toHaveLength(1);
    expect(res.body.failedAt?.walletId ?? res.body.failed?.walletId).toBe('wB');
  });

  it('422 wallet_archived com txCreated parcial preservadas', async () => {
    (runReconciliation as any).mockResolvedValue({
      created: [],
      skipped: 0,
      failed: { walletId: 'wA', code: 'wallet_archived', message: 'wallet_archived' },
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBody }) as any, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe('wallet_archived');
  });
});

describe('POST /api/grind-sessions/:id/reconcile-wallets — idempotencia (RF-08, US-05)', () => {
  beforeEach(() => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
  });

  it('409 already_reconciled quando runReconciliation reporta marker', async () => {
    (runReconciliation as any).mockResolvedValue({
      alreadyReconciled: true,
      existingCount: 2,
      created: [],
      skipped: 0,
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBody }) as any, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('already_reconciled');
    expect(res.body.existingCount).toBe(2);
  });
});

describe('POST /api/grind-sessions/:id/reconcile-wallets — defesa em profundidade', () => {
  it('runReconciliation que retorna throw 500 -> 500 com message', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (runReconciliation as any).mockRejectedValue(new Error('boom'));

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBody }) as any, res);
    expect(res.statusCode).toBe(500);
  });
});

// =============================================================================
// HIGH-3 reviewer fix — mapeamento explicito de failure code -> HTTP status
// (Docs/specs/session-end-wallet-reconciliation.md, secao "API Delta")
// =============================================================================

describe('POST /api/grind-sessions/:id/reconcile-wallets — failure code mapping (HIGH-3)', () => {
  beforeEach(() => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
  });

  it('wallet_not_found -> 404 (cross-user mascarado por seguranca)', async () => {
    (runReconciliation as any).mockResolvedValue({
      created: [],
      skipped: 0,
      failed: {
        walletId: 'wOther',
        code: 'wallet_not_found',
        message: 'wallet_not_found',
      },
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBody }) as any, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('wallet_not_found');
    expect(res.body.failedAt?.walletId).toBe('wOther');
  });

  it('out_of_order -> 422 (estado invalido da fila de tx)', async () => {
    (runReconciliation as any).mockResolvedValue({
      created: [],
      skipped: 0,
      failed: {
        walletId: 'wA',
        code: 'out_of_order',
        message: 'out_of_order',
      },
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBody }) as any, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe('out_of_order');
  });

  it('invalid_reported_balance -> 422', async () => {
    (runReconciliation as any).mockResolvedValue({
      created: [],
      skipped: 0,
      failed: {
        walletId: 'wA',
        code: 'invalid_reported_balance',
        message: 'invalid_reported_balance',
      },
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBody }) as any, res);

    expect(res.statusCode).toBe(422);
  });

  it('duplicate_wallet vindo do service -> 400', async () => {
    (runReconciliation as any).mockResolvedValue({
      created: [],
      skipped: 0,
      failed: {
        walletId: 'wA',
        code: 'duplicate_wallet',
        message: 'duplicate_wallet',
      },
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBody }) as any, res);

    expect(res.statusCode).toBe(400);
  });

  it('missing_expected_balance vindo do service -> 400', async () => {
    (runReconciliation as any).mockResolvedValue({
      created: [],
      skipped: 0,
      failed: {
        walletId: 'wA',
        code: 'missing_expected_balance',
        message: 'missing_expected_balance',
      },
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBody }) as any, res);

    expect(res.statusCode).toBe(400);
  });

  it('code desconhecido -> 500 (defesa em profundidade)', async () => {
    (runReconciliation as any).mockResolvedValue({
      created: [],
      skipped: 0,
      failed: {
        walletId: 'wA',
        code: 'totally_unknown_xpto',
        message: 'totally_unknown_xpto',
      },
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBody }) as any, res);

    expect(res.statusCode).toBe(500);
  });

  it('balance_mismatch continua mapeando para 409', async () => {
    (runReconciliation as any).mockResolvedValue({
      created: [{ id: 'tx1', walletId: 'wA' }],
      skipped: 0,
      failed: {
        walletId: 'wB',
        code: 'balance_mismatch',
        currentBalance: 1280,
        message: 'balance_mismatch',
      },
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBody }) as any, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('balance_mismatch');
  });

  it('wallet_archived continua mapeando para 422', async () => {
    (runReconciliation as any).mockResolvedValue({
      created: [],
      skipped: 0,
      failed: { walletId: 'wA', code: 'wallet_archived', message: 'wallet_archived' },
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBody }) as any, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe('wallet_archived');
  });
});
