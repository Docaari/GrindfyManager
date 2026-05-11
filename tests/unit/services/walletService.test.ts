import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: server/services/walletService.ts (RF-07)
//
// Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md (RF-07)
// ADR-034: invariantes ledger, FX historico imutavel, atomicidade
//
// API esperada:
//   createWallet(userId, input): Promise<Wallet>
//   getWallet(userId, walletId): Promise<Wallet | null>
//   listWallets(userId, opts): Promise<Wallet[]>
//   updateWallet(userId, walletId, patch): Promise<Wallet>
//   archiveWallet(userId, walletId): Promise<Wallet>
//   recordWalletTransaction(userId, walletId, input): Promise<{ tx, wallet }>
//   listWalletTransactions(userId, walletId, filters): Promise<{ items, pagination }>
//   getConsolidatedBalance(userId): Promise<ConsolidatedBalance>
//   migrateUserV1toV2(userId): Promise<{ created, walletId? }>
// =============================================================================

const txMock: any = {};

vi.mock('../../../server/storage', () => ({
  storage: {
    // Wallet CRUD
    createWallet: vi.fn(),
    getWalletById: vi.fn(),
    listWalletsByUser: vi.fn(),
    countActiveWalletsByUser: vi.fn(),
    findActiveWalletByName: vi.fn(),
    updateWallet: vi.fn(),
    archiveWallet: vi.fn(),
    selectWalletForUpdate: vi.fn(),
    // Wallet transactions
    createWalletTransaction: vi.fn(),
    listWalletTransactions: vi.fn(),
    getLastWalletTransaction: vi.fn(),
    // Bankroll snapshot mirror
    insertBankrollSnapshot: vi.fn(),
    // Consolidated
    getActiveWalletsByUser: vi.fn(),
    getUserSettings: vi.fn(),
    // Migration
    setUserBankrollV2Migrated: vi.fn(),
    backfillSnapshotsWalletId: vi.fn(),
    // Generic
    transaction: vi.fn(async (fn: any) => fn(txMock)),
  },
}));

vi.mock('../../../server/services/selectorCache', () => ({
  selectorCache: { invalidateAllForUser: vi.fn(), get: vi.fn(), set: vi.fn() },
}));
vi.mock('../../../server/services/bankrollCache', () => ({
  bankrollCache: { invalidateAllForUser: vi.fn(), get: vi.fn(() => null), set: vi.fn() },
}));
vi.mock('../../../server/services/walletCache', () => ({
  walletCache: { invalidateAllForUser: vi.fn(), get: vi.fn(() => null), set: vi.fn() },
}));

import { walletService } from '../../../server/services/walletService';
import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
  // Re-bind tx mock methods
  Object.assign(txMock, {
    createWallet: vi.fn(),
    selectWalletForUpdate: vi.fn(),
    createWalletTransaction: vi.fn(),
    insertBankrollSnapshot: vi.fn(),
    updateWalletBalance: vi.fn(),
    countActiveWalletsByUser: vi.fn(async () => 0),
    findActiveWalletByName: vi.fn(async () => null),
    getLastWalletTransaction: vi.fn(async () => null),
    getUserSettings: vi.fn(async () => ({ exchangeRates: {} })),
    archiveWallet: vi.fn(),
    updateWallet: vi.fn(),
    getWalletById: vi.fn(),
    setUserBankrollV2Migrated: vi.fn(),
    backfillSnapshotsWalletId: vi.fn(async () => 0),
    listWalletsByUser: vi.fn(async () => []),
  });
});

// ===========================================================================
// createWallet
// ===========================================================================

describe('walletService.createWallet', () => {
  it('cria wallet com balance=0 e status=active default', async () => {
    txMock.createWallet.mockResolvedValue({
      id: 'wlt_new',
      userId: 'USER-0001',
      name: 'GG Main',
      platform: 'GGNetwork',
      nativeCurrency: 'USD',
      balance: '0',
      status: 'active',
    });

    const r = await walletService.createWallet('USER-0001', {
      name: 'GG Main',
      platform: 'GGNetwork',
      nativeCurrency: 'USD',
    });

    expect(r.wallet).toBeDefined();
    expect(r.wallet.balance).toBe('0');
    expect(r.wallet.status).toBe('active');
    expect(txMock.createWallet).toHaveBeenCalled();
  });

  it('rejeita criacao quando ja ha 50 wallets ativas (409)', async () => {
    txMock.countActiveWalletsByUser.mockResolvedValue(50);

    await expect(
      walletService.createWallet('USER-0001', {
        name: 'GG Main 51',
        platform: 'GGNetwork',
        nativeCurrency: 'USD',
      }),
    ).rejects.toThrow(/limite|limit|50/i);
  });

  it('inclui warning approaching_wallet_limit em response quando ja tem 19 ativas (criando a 20a)', async () => {
    txMock.countActiveWalletsByUser.mockResolvedValue(19);
    txMock.createWallet.mockResolvedValue({
      id: 'wlt_new', userId: 'USER-0001', name: 'GG 20', platform: 'GGNetwork',
      nativeCurrency: 'USD', balance: '0', status: 'active',
    });

    const r = await walletService.createWallet('USER-0001', {
      name: 'GG 20', platform: 'GGNetwork', nativeCurrency: 'USD',
    });

    expect(r.warnings).toContain('approaching_wallet_limit');
  });

  it('rejeita nome duplicado entre wallets ativas (mesmo user)', async () => {
    txMock.findActiveWalletByName.mockResolvedValue({
      id: 'wlt_existing', userId: 'USER-0001', name: 'GG Main', status: 'active',
    });

    await expect(
      walletService.createWallet('USER-0001', {
        name: 'GG Main', platform: 'GGNetwork', nativeCurrency: 'USD',
      }),
    ).rejects.toThrow(/duplica|name|existe/i);
  });

  it('com initialDeposit cria wallet + 1 wallet_transaction inicial atomicamente', async () => {
    txMock.createWallet.mockResolvedValue({
      id: 'wlt_new', userId: 'USER-0001', name: 'Suprema X', platform: 'Suprema',
      nativeCurrency: 'BRL', balance: '0', status: 'active',
    });
    txMock.getUserSettings.mockResolvedValue({ exchangeRates: { BRL: 5.0 } });
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_new', balance: '0', status: 'active', nativeCurrency: 'BRL',
    });
    txMock.createWalletTransaction.mockResolvedValue({
      id: 'wtx_init', walletId: 'wlt_new', direction: 'in', nativeAmount: '5000',
      fxRateUSDPerNative: '5.0', usdAmount: '1000', reason: 'deposit',
      previousNativeBalance: '0', newNativeBalance: '5000',
    });
    txMock.updateWalletBalance.mockResolvedValue(true);
    txMock.insertBankrollSnapshot.mockResolvedValue({ id: 'snap_init' });

    const r = await walletService.createWallet('USER-0001', {
      name: 'Suprema X',
      platform: 'Suprema',
      nativeCurrency: 'BRL',
      initialDeposit: { amount: 5000, note: 'PIX inicial' },
    });

    expect(r.wallet).toBeDefined();
    expect(r.transaction).toBeDefined();
    expect(txMock.createWalletTransaction).toHaveBeenCalled();
    expect(txMock.updateWalletBalance).toHaveBeenCalled();
    expect(txMock.insertBankrollSnapshot).toHaveBeenCalled();
  });

  it('initialDeposit.amount <= 0 rejeita', async () => {
    await expect(
      walletService.createWallet('USER-0001', {
        name: 'GG', platform: 'GGNetwork', nativeCurrency: 'USD',
        initialDeposit: { amount: 0 } as any,
      }),
    ).rejects.toThrow();
  });
});

// ===========================================================================
// archiveWallet
// ===========================================================================

describe('walletService.archiveWallet', () => {
  it('arquiva wallet com balance=0 sem warning', async () => {
    txMock.getWalletById.mockResolvedValue({
      id: 'wlt_arch', userId: 'USER-0001', balance: '0', status: 'active',
    });
    txMock.archiveWallet.mockResolvedValue({
      id: 'wlt_arch', balance: '0', status: 'archived',
    });

    const r = await walletService.archiveWallet('USER-0001', 'wlt_arch');

    expect(r.wallet.status).toBe('archived');
    expect(r.warning).toBeUndefined();
  });

  it('arquiva wallet com balance != 0 + confirmArchiveWithBalance retorna warning wallet_archived_with_balance', async () => {
    // Bankroll-Launch-Fix P1 #2 (P1#7): contrato mudou — archive de wallet com
    // saldo > 0.01 agora exige confirmArchiveWithBalance:true. Sem o flag,
    // service rejeita 422 WALLET_HAS_BALANCE (ver test seguinte).
    txMock.getWalletById.mockResolvedValue({
      id: 'wlt_arch', userId: 'USER-0001', balance: '500.00', status: 'active',
    });
    txMock.archiveWallet.mockResolvedValue({
      id: 'wlt_arch', balance: '500.00', status: 'archived',
    });

    const r = await walletService.archiveWallet('USER-0001', 'wlt_arch', {
      confirmArchiveWithBalance: true,
    });

    expect(r.wallet.status).toBe('archived');
    expect(r.warning).toBe('wallet_archived_with_balance');
  });

  it('arquiva wallet com balance != 0 SEM confirmArchiveWithBalance rejeita 422 WALLET_HAS_BALANCE', async () => {
    // Bankroll-Launch-Fix P1 #2: defesa — saldo > 0 sem confirmacao do user
    // dispara erro estruturado em vez de silenciosamente arquivar.
    txMock.getWalletById.mockResolvedValue({
      id: 'wlt_arch', userId: 'USER-0001', balance: '500.00', status: 'active',
      nativeCurrency: 'USD',
    });

    await expect(
      walletService.archiveWallet('USER-0001', 'wlt_arch'),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: 'WALLET_HAS_BALANCE',
    });
  });

  it('archiveWallet em wallet ja archived: idempotente (sem warning)', async () => {
    txMock.getWalletById.mockResolvedValue({
      id: 'wlt_arch', userId: 'USER-0001', balance: '0', status: 'archived',
    });
    txMock.archiveWallet.mockResolvedValue({
      id: 'wlt_arch', balance: '0', status: 'archived',
    });

    const r = await walletService.archiveWallet('USER-0001', 'wlt_arch');
    expect(r.wallet.status).toBe('archived');
  });

  it('archiveWallet em wallet de outro user retorna 404 (nao 403, evita info leak)', async () => {
    txMock.getWalletById.mockResolvedValue(null);

    await expect(
      walletService.archiveWallet('USER-0001', 'wlt_other'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ===========================================================================
// listWallets / getActiveWallets
// ===========================================================================

describe('walletService.listWallets', () => {
  it('default lista apenas wallets ativas', async () => {
    (storage.listWalletsByUser as any).mockResolvedValue([
      { id: 'w1', status: 'active' },
      { id: 'w2', status: 'active' },
    ]);

    const r = await walletService.listWallets('USER-0001', { includeArchived: false });
    expect(r.length).toBe(2);
    expect(r.every((w: any) => w.status === 'active')).toBe(true);
  });

  it('includeArchived=true retorna ambos status', async () => {
    (storage.listWalletsByUser as any).mockResolvedValue([
      { id: 'w1', status: 'active' },
      { id: 'w2', status: 'archived' },
    ]);

    const r = await walletService.listWallets('USER-0001', { includeArchived: true });
    expect(r.length).toBe(2);
  });

  it('ordenado por displayOrder ASC, createdAt ASC', async () => {
    (storage.listWalletsByUser as any).mockResolvedValue([
      { id: 'w1', displayOrder: 0, createdAt: '2026-04-01' },
      { id: 'w2', displayOrder: 1, createdAt: '2026-04-02' },
      { id: 'w3', displayOrder: 2, createdAt: '2026-04-03' },
    ]);

    const r = await walletService.listWallets('USER-0001', { includeArchived: false });
    expect(r[0].id).toBe('w1');
    expect(r[1].id).toBe('w2');
    expect(r[2].id).toBe('w3');
  });
});

// ===========================================================================
// recordWalletTransaction
// ===========================================================================

describe('walletService.recordWalletTransaction', () => {
  it('happy path deposit USD: tx criada + wallet.balance atualizado em transacao', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '100.00', status: 'active',
      nativeCurrency: 'USD',
    });
    txMock.getUserSettings.mockResolvedValue({ exchangeRates: {} });
    txMock.getLastWalletTransaction.mockResolvedValue({ occurredAt: new Date('2026-04-25') });
    txMock.createWalletTransaction.mockImplementation(async (input: any) => ({
      id: 'wtx_new', ...input,
    }));
    txMock.updateWalletBalance.mockResolvedValue(true);
    txMock.insertBankrollSnapshot.mockResolvedValue({ id: 'snap_new' });

    const r = await walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
      direction: 'in',
      nativeAmount: 50,
      reason: 'deposit',
      occurredAt: new Date('2026-04-26T14:00:00Z'),
    });

    expect(r.transaction).toBeDefined();
    expect(r.wallet).toBeDefined();
    // Invariante: previous=100, new=150
    const txCall = txMock.createWalletTransaction.mock.calls[0][0];
    expect(parseFloat(txCall.previousNativeBalance)).toBe(100);
    expect(parseFloat(txCall.newNativeBalance)).toBe(150);
    // FX USD = 1.0 sempre
    expect(parseFloat(txCall.fxRateUSDPerNative)).toBe(1.0);
  });

  it('FX historico: tx em wallet BRL pega fxRate corrente do user_settings', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_2', userId: 'USER-0001', balance: '0', status: 'active',
      nativeCurrency: 'BRL',
    });
    txMock.getUserSettings.mockResolvedValue({ exchangeRates: { BRL: 5.0 } });
    txMock.getLastWalletTransaction.mockResolvedValue(null);
    txMock.createWalletTransaction.mockImplementation(async (input: any) => ({
      id: 'wtx_brl', ...input,
    }));
    txMock.updateWalletBalance.mockResolvedValue(true);
    txMock.insertBankrollSnapshot.mockResolvedValue({ id: 'snap_brl' });

    await walletService.recordWalletTransaction('USER-0001', 'wlt_2', {
      direction: 'in',
      nativeAmount: 5000,
      reason: 'deposit',
      occurredAt: new Date('2026-04-26T14:00:00Z'),
    });

    const txCall = txMock.createWalletTransaction.mock.calls[0][0];
    expect(parseFloat(txCall.fxRateUSDPerNative)).toBe(5.0);
    // usdAmount = nativeAmount / fxRate = 5000 / 5.0 = 1000
    expect(parseFloat(txCall.usdAmount)).toBeCloseTo(1000, 2);
  });

  it('invariante audit: tx[N+1].previousNativeBalance == tx[N].newNativeBalance', async () => {
    // Simula 2 tx em sequencia
    let currentBalance = 0;
    txMock.selectWalletForUpdate.mockImplementation(async () => ({
      id: 'wlt_3', userId: 'USER-0001', balance: String(currentBalance), status: 'active',
      nativeCurrency: 'USD',
    }));
    txMock.getUserSettings.mockResolvedValue({ exchangeRates: {} });
    txMock.getLastWalletTransaction.mockResolvedValue(null);
    const txs: any[] = [];
    txMock.createWalletTransaction.mockImplementation(async (input: any) => {
      txs.push(input);
      currentBalance = parseFloat(input.newNativeBalance);
      return { id: `wtx_${txs.length}`, ...input };
    });
    txMock.updateWalletBalance.mockResolvedValue(true);
    txMock.insertBankrollSnapshot.mockResolvedValue({});

    // Tx 1: deposit 100
    await walletService.recordWalletTransaction('USER-0001', 'wlt_3', {
      direction: 'in', nativeAmount: 100, reason: 'deposit',
      occurredAt: new Date('2026-04-26T10:00:00Z'),
    });
    // Tx 2: withdrawal 30
    await walletService.recordWalletTransaction('USER-0001', 'wlt_3', {
      direction: 'out', nativeAmount: 30, reason: 'withdrawal',
      occurredAt: new Date('2026-04-26T15:00:00Z'),
    });

    expect(txs.length).toBe(2);
    expect(parseFloat(txs[0].newNativeBalance)).toBe(100);
    expect(parseFloat(txs[1].previousNativeBalance)).toBe(100);
    expect(parseFloat(txs[1].newNativeBalance)).toBe(70);
  });

  it('rejeita tx em wallet arquivada com 409', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_arch', userId: 'USER-0001', balance: '100', status: 'archived',
      nativeCurrency: 'USD',
    });

    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_arch', {
        direction: 'in', nativeAmount: 50, reason: 'deposit',
        occurredAt: new Date(),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejeita occurredAt no futuro', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '100', status: 'active',
      nativeCurrency: 'USD',
    });

    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
        direction: 'in', nativeAmount: 10, reason: 'deposit',
        occurredAt: new Date(Date.now() + 86400000),
      }),
    ).rejects.toThrow(/futuro|future/i);
  });

  it('rejeita occurredAt anterior a ultima tx (out_of_order 422)', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '100', status: 'active',
      nativeCurrency: 'USD',
    });
    txMock.getLastWalletTransaction.mockResolvedValue({
      occurredAt: new Date('2026-04-26T10:00:00Z'),
    });

    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
        direction: 'in',
        nativeAmount: 10,
        reason: 'deposit',
        occurredAt: new Date('2026-04-25T10:00:00Z'), // anterior
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('saldo negativo permitido: warning wallet_negative na response', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '100', status: 'active',
      nativeCurrency: 'USD',
    });
    txMock.getUserSettings.mockResolvedValue({ exchangeRates: {} });
    txMock.getLastWalletTransaction.mockResolvedValue(null);
    txMock.createWalletTransaction.mockImplementation(async (input: any) => ({
      id: 'wtx', ...input,
    }));
    txMock.updateWalletBalance.mockResolvedValue(true);
    txMock.insertBankrollSnapshot.mockResolvedValue({});

    const r = await walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
      direction: 'out',
      nativeAmount: 200,
      reason: 'withdrawal',
      occurredAt: new Date(),
    });

    expect(r.warning).toBe('wallet_negative');
  });

  it('rejeita reason fora do P0 (transfer_in) com 400', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '100', status: 'active',
      nativeCurrency: 'USD',
    });

    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
        direction: 'in',
        nativeAmount: 100,
        reason: 'transfer_in' as any,
        occurredAt: new Date(),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('reason=session_result com sessionId ausente -> erro', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '100', status: 'active',
      nativeCurrency: 'USD',
    });

    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
        direction: 'in',
        nativeAmount: 50,
        reason: 'session_result',
        occurredAt: new Date(),
        sessionId: undefined as any,
      }),
    ).rejects.toThrow(/session/i);
  });
});

// ===========================================================================
// getConsolidatedBalance
// ===========================================================================

describe('walletService.getConsolidatedBalance', () => {
  it('soma USD de todas wallets active e nao-shotPocket', async () => {
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'w1', balance: '1000', nativeCurrency: 'USD', isShotPocket: false, name: 'GG', platform: 'GGNetwork' },
      { id: 'w2', balance: '5000', nativeCurrency: 'BRL', isShotPocket: false, name: 'Suprema', platform: 'Suprema' },
      { id: 'w3', balance: '100', nativeCurrency: 'USDT', isShotPocket: false, name: 'CP', platform: 'CoinPoker' },
    ]);
    (storage.getUserSettings as any).mockResolvedValue({
      exchangeRates: { BRL: 5.0, USDT: 1.0 },
      bankrollAggregationMode: 'global',
      bankrollDisplayCurrency: 'USD',
      bankrollRule: '1pct',
    });

    const r = await walletService.getConsolidatedBalance('USER-0001');

    // 1000 (USD) + 5000/5 (BRL=1000 USD) + 100/1 (USDT=100 USD) = 2100 USD
    expect(parseFloat(r.totalUSD as any)).toBeCloseTo(2100, 2);
    expect(r.byWallet.length).toBe(3);
  });

  it('exclui wallets archived da consolidacao', async () => {
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'w1', balance: '1000', nativeCurrency: 'USD', isShotPocket: false, status: 'active' },
    ]);
    (storage.getUserSettings as any).mockResolvedValue({ exchangeRates: {}, bankrollAggregationMode: 'global', bankrollDisplayCurrency: 'USD', bankrollRule: '1pct' });

    const r = await walletService.getConsolidatedBalance('USER-0001');

    expect(parseFloat(r.totalUSD as any)).toBe(1000);
    expect(r.byWallet.length).toBe(1);
  });

  it('separa shotPockets em array dedicado (nao soma a totalUSD)', async () => {
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'w1', balance: '1000', nativeCurrency: 'USD', isShotPocket: false, name: 'Main', platform: 'GGNetwork' },
      { id: 'w2', balance: '500', nativeCurrency: 'USD', isShotPocket: true, name: 'Shot', platform: 'GGNetwork' },
    ]);
    (storage.getUserSettings as any).mockResolvedValue({ exchangeRates: {}, bankrollAggregationMode: 'global', bankrollDisplayCurrency: 'USD', bankrollRule: '1pct' });

    const r = await walletService.getConsolidatedBalance('USER-0001');

    expect(parseFloat(r.totalUSD as any)).toBe(1000);
    expect(r.shotPockets.length).toBe(1);
    expect(r.byWallet.find((w: any) => w.walletId === 'w2')).toBeUndefined();
  });

  it('cada wallet tem share = balanceUSD / totalUSD com 4 casas decimais', async () => {
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'w1', balance: '1000', nativeCurrency: 'USD', isShotPocket: false, name: 'A', platform: 'GGNetwork' },
      { id: 'w2', balance: '3000', nativeCurrency: 'USD', isShotPocket: false, name: 'B', platform: 'GGNetwork' },
    ]);
    (storage.getUserSettings as any).mockResolvedValue({ exchangeRates: {}, bankrollAggregationMode: 'global', bankrollDisplayCurrency: 'USD', bankrollRule: '1pct' });

    const r = await walletService.getConsolidatedBalance('USER-0001');

    const sumShares = r.byWallet.reduce((s: number, w: any) => s + (w.share ?? 0), 0);
    expect(sumShares).toBeCloseTo(1.0, 3);
    const w1 = r.byWallet.find((w: any) => w.walletId === 'w1');
    expect(w1?.share).toBeCloseTo(0.25, 4);
  });

  it('usuario sem wallets retorna totalUSD=0 + byWallet vazio', async () => {
    (storage.getActiveWalletsByUser as any).mockResolvedValue([]);
    (storage.getUserSettings as any).mockResolvedValue({ exchangeRates: {}, bankrollAggregationMode: 'global', bankrollDisplayCurrency: 'USD', bankrollRule: '1pct' });

    const r = await walletService.getConsolidatedBalance('USER-0001');
    expect(parseFloat(r.totalUSD as any)).toBe(0);
    expect(r.byWallet.length).toBe(0);
  });

  it('aggregationMode global retorna softLimit/hardLimit derivados da soma', async () => {
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'w1', balance: '1000', nativeCurrency: 'USD', isShotPocket: false, name: 'A', platform: 'GGNetwork' },
    ]);
    (storage.getUserSettings as any).mockResolvedValue({ exchangeRates: {}, bankrollAggregationMode: 'global', bankrollDisplayCurrency: 'USD', bankrollRule: '1pct' });

    const r = await walletService.getConsolidatedBalance('USER-0001');
    // 1pct + 1.5x tolerancia em 1000 USD
    expect(parseFloat(r.softLimitUSD as any)).toBe(10);
    expect(parseFloat(r.hardLimitUSD as any)).toBe(15);
  });

  it('aggregationMode per_wallet: softLimit e hardLimit retornam null', async () => {
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'w1', balance: '1000', nativeCurrency: 'USD', isShotPocket: false, name: 'A', platform: 'GGNetwork' },
    ]);
    (storage.getUserSettings as any).mockResolvedValue({ exchangeRates: {}, bankrollAggregationMode: 'per_wallet', bankrollDisplayCurrency: 'USD', bankrollRule: '1pct' });

    const r = await walletService.getConsolidatedBalance('USER-0001');
    expect(r.softLimitUSD).toBeNull();
    expect(r.hardLimitUSD).toBeNull();
  });

  it('totalDisplayCurrency em BRL: total em USD * BRL rate', async () => {
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'w1', balance: '1000', nativeCurrency: 'USD', isShotPocket: false, name: 'A', platform: 'GGNetwork' },
    ]);
    (storage.getUserSettings as any).mockResolvedValue({
      exchangeRates: { BRL: 5.0 },
      bankrollAggregationMode: 'global',
      bankrollDisplayCurrency: 'BRL',
      bankrollRule: '1pct',
    });

    const r = await walletService.getConsolidatedBalance('USER-0001');
    expect(parseFloat(r.totalDisplayCurrency as any)).toBeCloseTo(5000, 2);
    expect(r.displayCurrency).toBe('BRL');
  });
});

// ===========================================================================
// migrateUserV1toV2
// ===========================================================================

describe('walletService.migrateUserV1toV2', () => {
  it('usuario com bankrollAmount > 0 e sem wallets: cria default wallet', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      userId: 'USER-LEG',
      bankrollAmount: '1000.00',
      bankrollRule: '1pct',
      bankrollV2Migrated: false,
    });
    (storage.listWalletsByUser as any).mockResolvedValue([]);
    txMock.createWallet.mockResolvedValue({
      id: 'wlt_default',
      userId: 'USER-LEG',
      name: 'Banca Padrao USD',
      platform: 'GenericUSD',
      nativeCurrency: 'USD',
      balance: '1000.00',
    });
    txMock.backfillSnapshotsWalletId.mockResolvedValue(5);
    txMock.setUserBankrollV2Migrated.mockResolvedValue(true);
    txMock.listWalletsByUser.mockResolvedValue([]);
    txMock.getUserSettings.mockResolvedValue({
      userId: 'USER-LEG', bankrollAmount: '1000.00', bankrollV2Migrated: false,
    });

    const r = await walletService.migrateUserV1toV2('USER-LEG');

    expect(r.created).toBe(true);
    expect(r.walletId).toBe('wlt_default');
    expect(txMock.createWallet).toHaveBeenCalled();
    expect(txMock.backfillSnapshotsWalletId).toHaveBeenCalled();
    expect(txMock.setUserBankrollV2Migrated).toHaveBeenCalled();
  });

  it('idempotente: usuario ja migrado retorna created=false', async () => {
    txMock.getUserSettings.mockResolvedValue({
      userId: 'USER-LEG2', bankrollAmount: '1000.00', bankrollV2Migrated: true,
    });
    txMock.listWalletsByUser.mockResolvedValue([{ id: 'wlt_existing' }]);

    const r = await walletService.migrateUserV1toV2('USER-LEG2');

    expect(r.created).toBe(false);
    expect(txMock.createWallet).not.toHaveBeenCalled();
  });

  it('usuario sem bankrollAmount (null): nao cria wallet', async () => {
    txMock.getUserSettings.mockResolvedValue({
      userId: 'USER-NEW', bankrollAmount: null, bankrollV2Migrated: false,
    });
    txMock.listWalletsByUser.mockResolvedValue([]);

    const r = await walletService.migrateUserV1toV2('USER-NEW');

    expect(r.created).toBe(false);
    expect(txMock.createWallet).not.toHaveBeenCalled();
  });

  it('usuario com bankrollAmount=0: nao cria wallet', async () => {
    txMock.getUserSettings.mockResolvedValue({
      userId: 'USER-ZERO', bankrollAmount: '0', bankrollV2Migrated: false,
    });
    txMock.listWalletsByUser.mockResolvedValue([]);

    const r = await walletService.migrateUserV1toV2('USER-ZERO');

    expect(r.created).toBe(false);
  });

  it('NAO cria wallet_transaction durante migration (snapshots = audit trail v1)', async () => {
    txMock.getUserSettings.mockResolvedValue({
      userId: 'USER-LEG3', bankrollAmount: '500', bankrollV2Migrated: false,
    });
    txMock.listWalletsByUser.mockResolvedValue([]);
    txMock.createWallet.mockResolvedValue({ id: 'wlt_def', balance: '500' });
    txMock.backfillSnapshotsWalletId.mockResolvedValue(0);

    await walletService.migrateUserV1toV2('USER-LEG3');

    // Decisao explicita ADR-035 Opcao A: NAO criar wallet_transaction.
    expect(txMock.createWalletTransaction).not.toHaveBeenCalled();
  });

  it('defesa em profundidade: usuario com walletCount > 0 marca migrated e pula', async () => {
    txMock.getUserSettings.mockResolvedValue({
      userId: 'USER-PROT', bankrollAmount: '1000', bankrollV2Migrated: false,
    });
    txMock.listWalletsByUser.mockResolvedValue([
      { id: 'wlt_existing', name: 'GG' },
    ]);
    txMock.setUserBankrollV2Migrated.mockResolvedValue(true);

    const r = await walletService.migrateUserV1toV2('USER-PROT');

    expect(r.created).toBe(false);
    expect(txMock.createWallet).not.toHaveBeenCalled();
    expect(txMock.setUserBankrollV2Migrated).toHaveBeenCalled();
  });
});

// ===========================================================================
// updateWallet — campos imutaveis
// ===========================================================================

describe('walletService.updateWallet', () => {
  it('aceita atualizar name, color, displayOrder, bankrollRule, isShotPocket', async () => {
    txMock.getWalletById.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', status: 'active', nativeCurrency: 'USD', platform: 'GGNetwork',
    });
    txMock.findActiveWalletByName.mockResolvedValue(null);
    txMock.updateWallet.mockImplementation(async (id: string, patch: any) => ({
      id, ...patch,
    }));

    const r = await walletService.updateWallet('USER-0001', 'wlt_1', {
      name: 'New Name',
      color: '#000000',
      displayOrder: 5,
      bankrollRule: '2pct',
      isShotPocket: true,
    });

    expect(r.wallet.name).toBe('New Name');
  });

  it('rejeita tentativa de mudar nativeCurrency com 400', async () => {
    txMock.getWalletById.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', nativeCurrency: 'USD',
    });

    await expect(
      walletService.updateWallet('USER-0001', 'wlt_1', { nativeCurrency: 'BRL' } as any),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejeita tentativa de mudar platform com 400', async () => {
    txMock.getWalletById.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', platform: 'GGNetwork',
    });

    await expect(
      walletService.updateWallet('USER-0001', 'wlt_1', { platform: 'PokerStars' } as any),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejeita tentativa de mudar balance com 400 (so via tx)', async () => {
    txMock.getWalletById.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '100',
    });

    await expect(
      walletService.updateWallet('USER-0001', 'wlt_1', { balance: '500' } as any),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejeita tentativa de mudar status (use archive endpoint)', async () => {
    txMock.getWalletById.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', status: 'active',
    });

    await expect(
      walletService.updateWallet('USER-0001', 'wlt_1', { status: 'archived' } as any),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejeita rename para nome ja em uso por outra wallet ativa do mesmo user', async () => {
    txMock.getWalletById.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', name: 'GG Main',
    });
    txMock.findActiveWalletByName.mockResolvedValue({
      id: 'wlt_other', userId: 'USER-0001', name: 'Suprema X',
    });

    await expect(
      walletService.updateWallet('USER-0001', 'wlt_1', { name: 'Suprema X' }),
    ).rejects.toThrow(/duplica|name|existe/i);
  });
});

// ===========================================================================
// Limites & warnings
// ===========================================================================

describe('walletService — limites de produto', () => {
  it.todo('createWallet em paralelo (race condition) — segundo POST com mesmo nome serializa via SELECT FOR UPDATE');
  it.todo('createWallet com transferencia P1 reservada nao deve aceitar');
  it.todo('stop-loss configuravel — fora do P0');
});
