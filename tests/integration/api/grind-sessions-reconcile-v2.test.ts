/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *  - RF-04: GET /api/grind-sessions/:id/reconcilable-wallets (corrigido)
 *  - RF-06: POST /api/grind-sessions/:id/reconcile-wallets (atualizado)
 *  - RF-07: persistencia em session_wallet_snapshots
 *  - RF-09: GET /api/grind-sessions/:id/wallet-snapshots
 *  - ADR-046: snapshots como fonte primaria de idempotencia
 *
 * Modulos esperados pelo implementer (atualizar ou criar):
 *   server/routes/grind-sessions.ts
 *     - handleGetReconcilableWallets (substitui/atualiza versao v1)
 *     - handlePostReconcileWallets (atualizar para suportar skipReconciliation
 *                                    + criar snapshot SEMPRE)
 *     - handleGetSessionWalletSnapshots (NOVO)
 *
 *   server/storage.ts (novos metodos):
 *     - listSessionTournaments(sessionId, userId)
 *     - listSessionWalletSnapshots(sessionId, userId)
 *     - findSessionWalletSnapshot(sessionId, userId)  (preflight idempotencia)
 *     - createSessionWalletSnapshot(input)
 *
 * Mocks seguem o pattern existente em grind-sessions-reconcile.test.ts
 * (ja em prod): vi.mock storage + walletService + sessionReconciliation.
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
  // novo helper exposto pelo implementer
  calculateExpectedDeltaPerWallet: vi.fn(),
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getGrindSession: vi.fn(),
    findReconciliationMarker: vi.fn(),
    listReconcilableWallets: vi.fn(),
    listWalletsByUser: vi.fn(),
    getUserSettings: vi.fn(),
    listSessionTournaments: vi.fn(),
    findSessionWalletSnapshot: vi.fn(),
    listSessionWalletSnapshots: vi.fn(),
    createSessionWalletSnapshot: vi.fn(),
  },
}));

import {
  handleGetReconcilableWallets,
  handlePostReconcileWallets,
  handleGetSessionWalletSnapshots,
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
// GET /reconcilable-wallets — derivado de session_tournaments (RF-04 v2)
// =============================================================================

describe('GET /reconcilable-wallets v2 — wallets DERIVADAS de session_tournaments (RF-04, fix bug P1)', () => {
  it('200 com wallets matched mesmo sem wallet_transactions previas para a sessao', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    // P5/ADR-046: snapshots tabela vazia -> alreadyReconciled=false
    (storage.findSessionWalletSnapshot as any).mockResolvedValue(null);
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });

    // Listagem v2: derivada de session_tournaments + wallets ativas
    (storage.listReconcilableWallets as any).mockResolvedValue([
      {
        walletId: 'wA',
        name: 'BlackChip Main',
        platform: 'WPN',
        nativeCurrency: 'USD',
        openingBalance: 1180,
        expectedPreviousBalance: 1180,
        expectedDelta: 67.5,
        expectedClosingBalance: 1247.5,
        contributingTournaments: ['st_1', 'st_2'],
        hadActivityInSession: true,
      },
    ]);

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.alreadyReconciled).toBe(false);
    expect(res.body.wallets).toHaveLength(1);
    expect(res.body.wallets[0].expectedDelta).toBeCloseTo(67.5, 2);
    expect(res.body.wallets[0].expectedClosingBalance).toBeCloseTo(1247.5, 2);
    expect(res.body.wallets[0].contributingTournaments).toEqual(['st_1', 'st_2']);
  });

  it('200 inclui orphanContribution como array de {site, currency, amount} (RF-04 P6)', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.findSessionWalletSnapshot as any).mockResolvedValue(null);
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    (storage.listReconcilableWallets as any).mockResolvedValue({
      wallets: [],
      orphanContribution: [
        { site: 'BodogPlay', currency: 'BRL', amount: 12.5 },
        { site: 'ChicoNetwork', currency: 'USD', amount: 8.0 },
      ],
    });

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.orphanContribution)).toBe(true);
    expect(res.body.orphanContribution).toHaveLength(2);
    const sites = res.body.orphanContribution.map((o: any) => o.site).sort();
    expect(sites).toEqual(['BodogPlay', 'ChicoNetwork']);
  });

  it('200 alreadyReconciled=true via session_wallet_snapshots row existente (P5/ADR-046 fonte primaria)', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.findSessionWalletSnapshot as any).mockResolvedValue({
      id: 'snap_1',
      sessionId: 'ses_1',
      walletId: 'wA',
    });
    // Mesmo se findReconciliationMarker = 0, snapshot ja indica reconciliado.
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.alreadyReconciled).toBe(true);
    expect(res.body.wallets).toEqual([]);
  });

  it('200 alreadyReconciled=true via wallet_transactions auto_session (fallback secundario RF-04)', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.findSessionWalletSnapshot as any).mockResolvedValue(null);
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 2 });

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.alreadyReconciled).toBe(true);
  });

  it('200 com wallets vazia quando todos sites sao orfaos', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.findSessionWalletSnapshot as any).mockResolvedValue(null);
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    (storage.listReconcilableWallets as any).mockResolvedValue({
      wallets: [],
      orphanContribution: [
        { site: 'BodogPlay', currency: 'BRL', amount: 5 },
      ],
    });

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.wallets).toEqual([]);
    expect(res.body.orphanContribution.length).toBeGreaterThan(0);
  });

  it('200 includeAll=true repassa flag para storage', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.findSessionWalletSnapshot as any).mockResolvedValue(null);
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    (storage.listReconcilableWallets as any).mockResolvedValue([]);

    const res = makeRes();
    await handleGetReconcilableWallets(
      makeReq({ query: { includeAll: 'true' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    const args = (storage.listReconcilableWallets as any).mock.calls[0];
    const includeAll =
      args.find((a: any) => typeof a === 'object' && 'includeAll' in (a ?? {}))?.includeAll ??
      args.includes(true);
    expect(includeAll).toBe(true);
  });

  it('401 sem auth', async () => {
    const res = makeRes();
    await handleGetReconcilableWallets(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
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

  it('500 quando storage.listSessionTournaments throw', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.findSessionWalletSnapshot as any).mockResolvedValue(null);
    (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
    (storage.listSessionTournaments as any).mockRejectedValue(new Error('db boom'));
    (storage.listReconcilableWallets as any).mockRejectedValue(new Error('db boom'));

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);
    expect(res.statusCode).toBe(500);
  });
});

// =============================================================================
// POST /reconcile-wallets v2 — adjustments + skipReconciliation + snapshots
// =============================================================================

const validBodyV2 = {
  adjustments: [
    {
      walletId: 'wA',
      reportedBalance: 1247.5,
      expectedPreviousBalance: 1180.0,
      expectedDelta: 67.5,
    },
  ],
  skipReconciliation: false,
};

describe('POST /reconcile-wallets v2 — adjustments validos cria tx + snapshots (RF-06, RF-07)', () => {
  beforeEach(() => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
  });

  it('200: cria 1 wallet_transaction + 1 session_wallet_snapshot', async () => {
    (runReconciliation as any).mockResolvedValue({
      created: [
        { id: 'tx_1', walletId: 'wA', direction: 'in', nativeAmount: '67.5' },
      ],
      skipped: 0,
      snapshotsCreated: 1,
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBodyV2 }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.snapshotsCreated).toBe(1);
    const created = res.body.txCreated ?? res.body.created;
    expect(created).toHaveLength(1);
  });

  it('repassa expectedDelta server-side para o service (manualAdjustment autoritativo)', async () => {
    (runReconciliation as any).mockResolvedValue({
      created: [],
      skipped: 0,
      snapshotsCreated: 1,
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBodyV2 }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(runReconciliation).toHaveBeenCalledTimes(1);
    const args = (runReconciliation as any).mock.calls[0];
    // service recebe (userId, sessionId, adjustments, ...). Adjustments contem expectedDelta.
    expect(args[2]).toBeDefined();
    expect(args[2][0]).toMatchObject({ walletId: 'wA' });
  });
});

describe('POST /reconcile-wallets v2 — skipReconciliation cria snapshots SEM txs (RF-06)', () => {
  beforeEach(() => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
  });

  it('200 com skipReconciliation=true: snapshotsCreated > 0, txCreated vazio', async () => {
    (runReconciliation as any).mockResolvedValue({
      created: [],
      skipped: 0,
      snapshotsCreated: 2,
      skippedByUser: true,
    });

    const skipBody = {
      adjustments: [
        { walletId: 'wA', reportedBalance: 0, expectedPreviousBalance: 1180, expectedDelta: 67.5 },
        { walletId: 'wB', reportedBalance: 0, expectedPreviousBalance: 200, expectedDelta: -10 },
      ],
      skipReconciliation: true,
    };

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: skipBody }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.snapshotsCreated).toBe(2);
    const created = res.body.txCreated ?? res.body.created;
    expect(created).toEqual([]);
  });
});

describe('POST /reconcile-wallets v2 — codigos de erro (RF-06)', () => {
  beforeEach(() => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
  });

  it('409 already_reconciled (snapshot existe)', async () => {
    (runReconciliation as any).mockResolvedValue({
      alreadyReconciled: true,
      existingCount: 2,
      created: [],
      skipped: 0,
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBodyV2 }) as any, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('already_reconciled');
  });

  it('409 balance_mismatch (current diff de expectedPreviousBalance)', async () => {
    (runReconciliation as any).mockResolvedValue({
      created: [],
      skipped: 0,
      failed: {
        walletId: 'wA',
        code: 'balance_mismatch',
        currentBalance: 1280,
        message: 'balance_mismatch',
      },
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBodyV2 }) as any, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('balance_mismatch');
  });

  it('422 wallet_archived', async () => {
    (runReconciliation as any).mockResolvedValue({
      created: [],
      skipped: 0,
      failed: { walletId: 'wA', code: 'wallet_archived', message: 'wallet_archived' },
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBodyV2 }) as any, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe('wallet_archived');
  });

  it('422 invalid_reported_balance (NaN)', async () => {
    const res = makeRes();
    await handlePostReconcileWallets(
      makeReq({
        body: {
          adjustments: [
            { walletId: 'wA', reportedBalance: NaN, expectedPreviousBalance: 1180, expectedDelta: 0 },
          ],
        },
      }) as any,
      res,
    );
    // Validacao Zod no body retorna 400; mas o service tambem pode mapear 422.
    // Aceitamos 400 ou 422 conforme onde a validacao acontece.
    expect([400, 422]).toContain(res.statusCode);
  });

  it('422 out_of_order', async () => {
    (runReconciliation as any).mockResolvedValue({
      created: [],
      skipped: 0,
      failed: { walletId: 'wA', code: 'out_of_order', message: 'out_of_order' },
    });

    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBodyV2 }) as any, res);
    expect(res.statusCode).toBe(422);
  });

  it('400 duplicate_wallet (mesmo walletId 2x)', async () => {
    const res = makeRes();
    await handlePostReconcileWallets(
      makeReq({
        body: {
          adjustments: [
            { walletId: 'wA', reportedBalance: 1247, expectedPreviousBalance: 1180, expectedDelta: 67 },
            { walletId: 'wA', reportedBalance: 1300, expectedPreviousBalance: 1180, expectedDelta: 120 },
          ],
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('duplicate_wallet');
  });

  it('400 missing_expected_balance (expectedPreviousBalance ausente)', async () => {
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

  it('401 sem auth', async () => {
    const res = makeRes();
    await handlePostReconcileWallets(
      makeReq({ user: undefined, body: validBodyV2 }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(runReconciliation).not.toHaveBeenCalled();
  });

  it('404 sessao cross-user', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-OTHER',
    });
    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBodyV2 }) as any, res);
    expect(res.statusCode).toBe(404);
    expect(runReconciliation).not.toHaveBeenCalled();
  });

  it('500 quando walletService throw inesperado', async () => {
    (runReconciliation as any).mockRejectedValue(new Error('boom'));
    const res = makeRes();
    await handlePostReconcileWallets(makeReq({ body: validBodyV2 }) as any, res);
    expect(res.statusCode).toBe(500);
  });
});

// =============================================================================
// GET /api/grind-sessions/:id/wallet-snapshots (RF-09)
// =============================================================================

describe('GET /wallet-snapshots — RF-09', () => {
  it('200: retorna snapshots da sessao do user', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.listSessionWalletSnapshots as any).mockResolvedValue([
      {
        walletId: 'wA',
        walletName: 'BlackChip Main',
        platform: 'WPN',
        nativeCurrency: 'USD',
        openingBalance: 1180,
        closingBalance: 1247.5,
        expectedDelta: 67.5,
        manualAdjustment: 0,
        contributingTournamentIds: ['st_1', 'st_2'],
        reason: 'session_result',
      },
    ]);

    const res = makeRes();
    await handleGetSessionWalletSnapshots(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.sessionId).toBe('ses_1');
    expect(res.body.snapshots).toHaveLength(1);
    expect(res.body.snapshots[0].closingBalance).toBeCloseTo(1247.5, 2);
  });

  it('200: snapshots vazios quando sessao nao tem rows', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-0001',
    });
    (storage.listSessionWalletSnapshots as any).mockResolvedValue([]);

    const res = makeRes();
    await handleGetSessionWalletSnapshots(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.snapshots).toEqual([]);
  });

  it('401 sem auth', async () => {
    const res = makeRes();
    await handleGetSessionWalletSnapshots(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('404 sessao de outro user', async () => {
    (storage.getGrindSession as any).mockResolvedValue({
      id: 'ses_1',
      userId: 'USER-OTHER',
    });
    const res = makeRes();
    await handleGetSessionWalletSnapshots(makeReq() as any, res);
    expect(res.statusCode).toBe(404);
  });
});
