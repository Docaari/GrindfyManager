import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: server/routes/wallets.ts (RF-09 + RF-10 + RF-11)
//
// Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md
// API docs: Docs/api/wallets.md
//
// Estrategia (seguindo padrao tests/integration/api/bankroll.test.ts):
// testamos handlers isoladamente com makeReq/makeRes, mockando service.
// =============================================================================

vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    createWallet: vi.fn(),
    getWallet: vi.fn(),
    listWallets: vi.fn(),
    updateWallet: vi.fn(),
    archiveWallet: vi.fn(),
    recordWalletTransaction: vi.fn(),
    listWalletTransactions: vi.fn(),
    getConsolidatedBalance: vi.fn(),
  },
}));

import {
  handleGetWallets,
  handlePostWallet,
  handleGetWallet,
  handlePutWallet,
  handlePatchArchiveWallet,
  handleDeleteWallet,
  handleGetWalletTransactions,
  handlePostWalletTransaction,
  handleGetBankrollConsolidated,
} from '../../../server/routes/wallets';
import { walletService } from '../../../server/services/walletService';

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
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  return res;
}

// ===========================================================================
// GET /api/wallets
// ===========================================================================

describe('GET /api/wallets', () => {
  it('happy path: 200 com array de wallets + consolidated', async () => {
    (walletService.listWallets as any).mockResolvedValue([
      { id: 'w1', name: 'GG', platform: 'GGNetwork', nativeCurrency: 'USD', balance: '1000', status: 'active', displayOrder: 0 },
    ]);
    (walletService.getConsolidatedBalance as any).mockResolvedValue({
      totalUSD: '1000.00', totalDisplayCurrency: '5000.00', displayCurrency: 'BRL',
      aggregationMode: 'global', byWallet: [], shotPockets: [], lastUpdatedAt: '2026-04-26T15:00:00Z',
      softLimitUSD: '10', hardLimitUSD: '15',
    });

    const res = makeRes();
    await handleGetWallets(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.wallets).toBeDefined();
    expect(res.body.consolidated).toBeDefined();
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handleGetWallets(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('default oculta archived (passa includeArchived=false)', async () => {
    (walletService.listWallets as any).mockResolvedValue([]);
    (walletService.getConsolidatedBalance as any).mockResolvedValue({
      totalUSD: '0', totalDisplayCurrency: '0', displayCurrency: 'USD',
      aggregationMode: 'global', byWallet: [], shotPockets: [],
    });

    const res = makeRes();
    await handleGetWallets(makeReq() as any, res);

    const args = (walletService.listWallets as any).mock.calls[0];
    expect(args[1]?.includeArchived ?? false).toBe(false);
  });

  it('includeArchived=true e propagado ao service', async () => {
    (walletService.listWallets as any).mockResolvedValue([]);
    (walletService.getConsolidatedBalance as any).mockResolvedValue({
      totalUSD: '0', totalDisplayCurrency: '0', displayCurrency: 'USD',
      aggregationMode: 'global', byWallet: [], shotPockets: [],
    });

    const res = makeRes();
    await handleGetWallets(makeReq({ query: { includeArchived: 'true' } }) as any, res);

    const args = (walletService.listWallets as any).mock.calls[0];
    expect(args[1]?.includeArchived).toBe(true);
  });

  it('warning approaching_wallet_limit em consolidated.warnings quando >=20 wallets', async () => {
    const manyWallets = Array.from({ length: 21 }, (_, i) => ({
      id: `w${i}`, name: `W${i}`, platform: 'GGNetwork', nativeCurrency: 'USD',
      balance: '0', status: 'active', displayOrder: i,
    }));
    (walletService.listWallets as any).mockResolvedValue(manyWallets);
    (walletService.getConsolidatedBalance as any).mockResolvedValue({
      totalUSD: '0', totalDisplayCurrency: '0', displayCurrency: 'USD',
      aggregationMode: 'global', byWallet: [], shotPockets: [],
    });

    const res = makeRes();
    await handleGetWallets(makeReq() as any, res);

    const warnings = res.body.warnings ?? res.body.consolidated?.warnings ?? [];
    expect(warnings).toContain('approaching_wallet_limit');
  });
});

// ===========================================================================
// POST /api/wallets
// ===========================================================================

describe('POST /api/wallets', () => {
  it('happy path 201 com wallet criada', async () => {
    (walletService.createWallet as any).mockResolvedValue({
      wallet: {
        id: 'wlt_new', name: 'Suprema X', platform: 'Suprema', nativeCurrency: 'BRL',
        balance: '0', status: 'active',
      },
      transaction: null,
      warnings: [],
    });

    const res = makeRes();
    await handlePostWallet(makeReq({
      body: { name: 'Suprema X', platform: 'Suprema', nativeCurrency: 'BRL' },
    }) as any, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.wallet).toBeDefined();
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handlePostWallet(makeReq({
      user: undefined,
      body: { name: 'X', platform: 'GGNetwork', nativeCurrency: 'USD' },
    }) as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('Zod: body sem name -> 400', async () => {
    const res = makeRes();
    await handlePostWallet(makeReq({
      body: { platform: 'GGNetwork', nativeCurrency: 'USD' },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('Zod: platform invalida -> 400', async () => {
    const res = makeRes();
    await handlePostWallet(makeReq({
      body: { name: 'X', platform: 'PokerKing', nativeCurrency: 'USD' },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('Zod: nativeCurrency invalida -> 400', async () => {
    const res = makeRes();
    await handlePostWallet(makeReq({
      body: { name: 'X', platform: 'GGNetwork', nativeCurrency: 'JPY' },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('limite 50 wallets -> 409', async () => {
    (walletService.createWallet as any).mockRejectedValue(
      Object.assign(new Error('Limite de 50 carteiras atingido'), { statusCode: 409, code: 'wallet_limit_reached' }),
    );

    const res = makeRes();
    await handlePostWallet(makeReq({
      body: { name: 'X', platform: 'GGNetwork', nativeCurrency: 'USD' },
    }) as any, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/limite|limit|50/i);
  });

  it('nome duplicado -> 400 com errNameDuplicate', async () => {
    (walletService.createWallet as any).mockRejectedValue(
      Object.assign(new Error('Ja existe uma carteira ativa com este nome'), { statusCode: 400, code: 'errNameDuplicate' }),
    );

    const res = makeRes();
    await handlePostWallet(makeReq({
      body: { name: 'GG Main', platform: 'GGNetwork', nativeCurrency: 'USD' },
    }) as any, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/existe|nome|duplica/i);
  });

  it('initialDeposit.amount <= 0 -> 400', async () => {
    const res = makeRes();
    await handlePostWallet(makeReq({
      body: {
        name: 'X', platform: 'GGNetwork', nativeCurrency: 'USD',
        initialDeposit: { amount: 0 },
      },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('initialDeposit valido inclui transaction na response', async () => {
    (walletService.createWallet as any).mockResolvedValue({
      wallet: {
        id: 'wlt_new', name: 'X', platform: 'GGNetwork', nativeCurrency: 'USD',
        balance: '500', status: 'active',
      },
      transaction: { id: 'wtx_init', direction: 'in', nativeAmount: '500', reason: 'deposit' },
      warnings: [],
    });

    const res = makeRes();
    await handlePostWallet(makeReq({
      body: {
        name: 'X', platform: 'GGNetwork', nativeCurrency: 'USD',
        initialDeposit: { amount: 500, note: 'PIX' },
      },
    }) as any, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.transaction).toBeDefined();
  });
});

// ===========================================================================
// GET /api/wallets/:id
// ===========================================================================

describe('GET /api/wallets/:id', () => {
  it('happy path 200 com wallet + recentTransactions', async () => {
    (walletService.getWallet as any).mockResolvedValue({
      wallet: { id: 'wlt_1', name: 'GG', balance: '1000', status: 'active' },
      lastTransactionAt: '2026-04-26T15:00:00Z',
      recentTransactions: [{ id: 'wtx_1', direction: 'in', nativeAmount: '100' }],
    });

    const res = makeRes();
    await handleGetWallet(makeReq({ params: { id: 'wlt_1' } }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.wallet).toBeDefined();
    expect(res.body.recentTransactions).toBeDefined();
  });

  it('wallet inexistente -> 404', async () => {
    (walletService.getWallet as any).mockResolvedValue(null);

    const res = makeRes();
    await handleGetWallet(makeReq({ params: { id: 'wlt_nao_existe' } }) as any, res);
    expect(res.statusCode).toBe(404);
  });

  it('wallet de outro user -> 404 (nao 403, evita info leak)', async () => {
    (walletService.getWallet as any).mockRejectedValue(
      Object.assign(new Error('Not found'), { statusCode: 404 }),
    );

    const res = makeRes();
    await handleGetWallet(makeReq({ params: { id: 'wlt_other' } }) as any, res);
    expect(res.statusCode).toBe(404);
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handleGetWallet(makeReq({ user: undefined, params: { id: 'wlt_1' } }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// PUT /api/wallets/:id
// ===========================================================================

describe('PUT /api/wallets/:id', () => {
  it('happy path 200', async () => {
    (walletService.updateWallet as any).mockResolvedValue({
      wallet: { id: 'wlt_1', name: 'New Name', color: '#000000' },
    });

    const res = makeRes();
    await handlePutWallet(makeReq({
      params: { id: 'wlt_1' },
      body: { name: 'New Name', color: '#000000' },
    }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.wallet.name).toBe('New Name');
  });

  it('tentativa de mudar nativeCurrency -> 400', async () => {
    const res = makeRes();
    await handlePutWallet(makeReq({
      params: { id: 'wlt_1' },
      body: { nativeCurrency: 'BRL' },
    }) as any, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/imutavel|immutable|nao permitido/i);
  });

  it('tentativa de mudar platform -> 400', async () => {
    const res = makeRes();
    await handlePutWallet(makeReq({
      params: { id: 'wlt_1' },
      body: { platform: 'PokerStars' },
    }) as any, res);

    expect(res.statusCode).toBe(400);
  });

  it('tentativa de mudar balance -> 400', async () => {
    const res = makeRes();
    await handlePutWallet(makeReq({
      params: { id: 'wlt_1' },
      body: { balance: '500' },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('tentativa de mudar status (use archive) -> 400', async () => {
    const res = makeRes();
    await handlePutWallet(makeReq({
      params: { id: 'wlt_1' },
      body: { status: 'archived' },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });
});

// ===========================================================================
// PATCH /api/wallets/:id/archive
// ===========================================================================

describe('PATCH /api/wallets/:id/archive', () => {
  it('happy path arquiva wallet com balance=0', async () => {
    (walletService.archiveWallet as any).mockResolvedValue({
      wallet: { id: 'wlt_1', status: 'archived', balance: '0' },
      warning: undefined,
    });

    const res = makeRes();
    await handlePatchArchiveWallet(makeReq({ params: { id: 'wlt_1' } }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.wallet.status).toBe('archived');
  });

  it('arquivar com balance != 0 retorna warning na response', async () => {
    (walletService.archiveWallet as any).mockResolvedValue({
      wallet: { id: 'wlt_1', status: 'archived', balance: '500' },
      warning: 'wallet_archived_with_balance',
    });

    const res = makeRes();
    await handlePatchArchiveWallet(makeReq({ params: { id: 'wlt_1' } }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.warning).toBe('wallet_archived_with_balance');
  });

  it('wallet inexistente -> 404', async () => {
    (walletService.archiveWallet as any).mockRejectedValue(
      Object.assign(new Error('Wallet nao encontrada'), { statusCode: 404 }),
    );

    const res = makeRes();
    await handlePatchArchiveWallet(makeReq({ params: { id: 'wlt_x' } }) as any, res);
    expect(res.statusCode).toBe(404);
  });
});

// ===========================================================================
// DELETE /api/wallets/:id
// ===========================================================================

describe('DELETE /api/wallets/:id', () => {
  it('SEMPRE retorna 405 com mensagem em pt-BR', async () => {
    const res = makeRes();
    await handleDeleteWallet(makeReq({ params: { id: 'wlt_1' } }) as any, res);

    expect(res.statusCode).toBe(405);
    expect(res.body.message).toMatch(/nao podem ser deletadas|method not allowed|archive/i);
  });

  it('mesmo com user autenticado e wallet existente: 405', async () => {
    const res = makeRes();
    await handleDeleteWallet(makeReq({
      user: { userPlatformId: 'USER-0001' },
      params: { id: 'wlt_real' },
    }) as any, res);
    expect(res.statusCode).toBe(405);
  });
});

// ===========================================================================
// GET /api/wallets/:id/transactions
// ===========================================================================

describe('GET /api/wallets/:id/transactions', () => {
  it('happy path 200 com transactions paginadas + summary', async () => {
    (walletService.listWalletTransactions as any).mockResolvedValue({
      transactions: [
        { id: 'wtx_1', direction: 'in', nativeAmount: '100', reason: 'deposit' },
      ],
      pagination: { total: 1, limit: 50, offset: 0 },
      summary: {
        totalDepositsNative: '100', totalWithdrawalsNative: '0',
        totalSessionPnLNative: '0', totalManualAdjustmentsNative: '0',
        netNative: '100', nativeCurrency: 'USD',
      },
    });

    const res = makeRes();
    await handleGetWalletTransactions(makeReq({ params: { id: 'wlt_1' } }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.transactions.length).toBe(1);
    expect(res.body.summary).toBeDefined();
    expect(res.body.pagination).toBeDefined();
  });

  it('limit > 200 e clampado para 200', async () => {
    (walletService.listWalletTransactions as any).mockResolvedValue({
      transactions: [], pagination: { total: 0, limit: 200, offset: 0 },
      summary: { totalDepositsNative: '0', totalWithdrawalsNative: '0', totalSessionPnLNative: '0', totalManualAdjustmentsNative: '0', netNative: '0', nativeCurrency: 'USD' },
    });

    const res = makeRes();
    await handleGetWalletTransactions(makeReq({
      params: { id: 'wlt_1' },
      query: { limit: '999' },
    }) as any, res);

    const filters = (walletService.listWalletTransactions as any).mock.calls[0]?.[2] ?? {};
    expect(filters.limit ?? 200).toBeLessThanOrEqual(200);
  });

  it('reason csv multipla: filtros propagados', async () => {
    (walletService.listWalletTransactions as any).mockResolvedValue({
      transactions: [], pagination: { total: 0, limit: 50, offset: 0 },
      summary: { totalDepositsNative: '0', totalWithdrawalsNative: '0', totalSessionPnLNative: '0', totalManualAdjustmentsNative: '0', netNative: '0', nativeCurrency: 'USD' },
    });

    const res = makeRes();
    await handleGetWalletTransactions(makeReq({
      params: { id: 'wlt_1' },
      query: { reason: 'deposit,withdrawal' },
    }) as any, res);

    expect(res.statusCode).toBe(200);
  });
});

// ===========================================================================
// POST /api/wallets/:id/transactions
// ===========================================================================

describe('POST /api/wallets/:id/transactions', () => {
  const validBody = {
    direction: 'in',
    nativeAmount: 500,
    reason: 'deposit',
    occurredAt: new Date('2026-04-26T14:00:00Z').toISOString(),
  };

  it('happy path 201 com tx e wallet retornados', async () => {
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'wtx_1', direction: 'in', nativeAmount: '500', reason: 'deposit' },
      wallet: { id: 'wlt_1', balance: '1500' },
      warning: null,
    });

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      params: { id: 'wlt_1' },
      body: validBody,
    }) as any, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.transaction).toBeDefined();
    expect(res.body.wallet).toBeDefined();
  });

  it('rejeita reason fora do P0 com 400 reason_not_supported_in_p0', async () => {
    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      params: { id: 'wlt_1' },
      body: { ...validBody, reason: 'transfer_in' },
    }) as any, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/p0|nao suportado|transfer/i);
  });

  it('nativeAmount <= 0 -> 400', async () => {
    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      params: { id: 'wlt_1' },
      body: { ...validBody, nativeAmount: 0 },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('direction invalida -> 400', async () => {
    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      params: { id: 'wlt_1' },
      body: { ...validBody, direction: 'sideways' },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('occurredAt no futuro -> 400', async () => {
    const futureBody = { ...validBody, occurredAt: new Date(Date.now() + 86400000).toISOString() };
    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      params: { id: 'wlt_1' }, body: futureBody,
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('occurredAt anterior a ultima tx -> 422 out_of_order', async () => {
    (walletService.recordWalletTransaction as any).mockRejectedValue(
      Object.assign(new Error('out_of_order'), { statusCode: 422, code: 'out_of_order' }),
    );

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      params: { id: 'wlt_1' }, body: validBody,
    }) as any, res);

    expect(res.statusCode).toBe(422);
  });

  it('wallet arquivada -> 409 wallet_archived', async () => {
    (walletService.recordWalletTransaction as any).mockRejectedValue(
      Object.assign(new Error('wallet_archived'), { statusCode: 409, code: 'wallet_archived' }),
    );

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      params: { id: 'wlt_arch' }, body: validBody,
    }) as any, res);
    expect(res.statusCode).toBe(409);
  });

  it('wallet inexistente -> 404', async () => {
    (walletService.recordWalletTransaction as any).mockRejectedValue(
      Object.assign(new Error('not_found'), { statusCode: 404 }),
    );

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      params: { id: 'wlt_x' }, body: validBody,
    }) as any, res);
    expect(res.statusCode).toBe(404);
  });

  it('reason=session_result com sessionId invalido -> 400', async () => {
    (walletService.recordWalletTransaction as any).mockRejectedValue(
      Object.assign(new Error('sessionId invalido'), { statusCode: 400 }),
    );

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      params: { id: 'wlt_1' },
      body: { ...validBody, reason: 'session_result', sessionId: 'ses_inexistente' },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('saldo negativo retorna 201 + warning wallet_negative', async () => {
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'wtx', direction: 'out', nativeAmount: '200' },
      wallet: { id: 'wlt_1', balance: '-100' },
      warning: 'wallet_negative',
    });

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      params: { id: 'wlt_1' },
      body: { ...validBody, direction: 'out', nativeAmount: 200, reason: 'withdrawal' },
    }) as any, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.warning).toBe('wallet_negative');
  });

  it('note com 501 chars -> 400 (Zod max 500)', async () => {
    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      params: { id: 'wlt_1' },
      body: { ...validBody, note: 'x'.repeat(501) },
    }) as any, res);

    expect(res.statusCode).toBe(400);
  });
});

// ===========================================================================
// GET /api/bankroll/consolidated
// ===========================================================================

describe('GET /api/bankroll/consolidated', () => {
  it('happy path 200 com totalUSD + byWallet + shotPockets', async () => {
    (walletService.getConsolidatedBalance as any).mockResolvedValue({
      aggregationMode: 'global',
      displayCurrency: 'BRL',
      totalUSD: '5432.10',
      totalDisplayCurrency: '27160.50',
      rule: '1pct',
      rulePct: 1.0,
      tolerance: 1.5,
      softLimitUSD: '54.32',
      hardLimitUSD: '81.48',
      byWallet: [
        { walletId: 'w1', name: 'GG', platform: 'GGNetwork', nativeCurrency: 'USD',
          balanceNative: '1234.50', balanceUSD: '1234.50', share: 0.227, isShotPocket: false },
      ],
      shotPockets: [],
      lastUpdatedAt: '2026-04-26T15:00:00Z',
    });

    const res = makeRes();
    await handleGetBankrollConsolidated(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.aggregationMode).toBe('global');
    expect(res.body.byWallet.length).toBe(1);
    expect(res.body.softLimitUSD).toBeDefined();
  });

  it('aggregationMode per_wallet retorna softLimitUSD e hardLimitUSD null', async () => {
    (walletService.getConsolidatedBalance as any).mockResolvedValue({
      aggregationMode: 'per_wallet',
      displayCurrency: 'USD',
      totalUSD: '5000',
      softLimitUSD: null,
      hardLimitUSD: null,
      byWallet: [], shotPockets: [], lastUpdatedAt: '2026-04-26T15:00:00Z',
    });

    const res = makeRes();
    await handleGetBankrollConsolidated(makeReq() as any, res);
    expect(res.body.softLimitUSD).toBeNull();
    expect(res.body.hardLimitUSD).toBeNull();
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handleGetBankrollConsolidated(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});
