import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Bankroll-2.1 — walletService.recordWalletTransaction (RF-05)
// Optimistic concurrency via expectedPreviousBalance.
//
// Spec: Docs/specs/wallet-balance-mode.md (RF-05)
// ADR: Docs/architecture/decisions/038-wallet-tx-optimistic-concurrency.md
//
// CONTRATO ASSUMIDO PELO TEST-WRITER (resolve ambiguidades para Implementer):
// 1. RecordWalletTransactionInput ganha campo opcional:
//    expectedPreviousBalance?: number
// 2. Erro lancado em divergencia: makeError com:
//    - statusCode: 409
//    - code: 'balance_mismatch'
//    - currentBalance: <number>  (parseDecimal do balance lido em SELECT FOR UPDATE)
// 3. Validacao roda APOS selectWalletForUpdate (garantia de leitura serializada).
// 4. Epsilon 0.01: |actual - expected| > 0.01 -> rejeita.
//                  |actual - expected| <= 0.01 -> aceita (drift toleravel).
// 5. expectedPreviousBalance ausente/undefined: ZERO mudanca de comportamento
//    vs. v2 atual (backward-compat 100%, RF-07).
// 6. Wallet archived check continua acontecendo ANTES do balance check
//    (sequence diagram, ADR-038 caminho feliz).
// =============================================================================

const txMock: any = {};

vi.mock('../../../server/storage', () => ({
  storage: {
    createWallet: vi.fn(),
    getWalletById: vi.fn(),
    listWalletsByUser: vi.fn(),
    countActiveWalletsByUser: vi.fn(),
    findActiveWalletByName: vi.fn(),
    updateWallet: vi.fn(),
    archiveWallet: vi.fn(),
    selectWalletForUpdate: vi.fn(),
    createWalletTransaction: vi.fn(),
    listWalletTransactions: vi.fn(),
    getLastWalletTransaction: vi.fn(),
    insertBankrollSnapshot: vi.fn(),
    getActiveWalletsByUser: vi.fn(),
    getUserSettings: vi.fn(),
    setUserBankrollV2Migrated: vi.fn(),
    backfillSnapshotsWalletId: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(txMock, {
    createWallet: vi.fn(),
    selectWalletForUpdate: vi.fn(),
    createWalletTransaction: vi.fn(async (input: any) => ({ id: 'wtx', ...input })),
    insertBankrollSnapshot: vi.fn(async () => ({ id: 'snap' })),
    updateWalletBalance: vi.fn(),
    countActiveWalletsByUser: vi.fn(async () => 0),
    findActiveWalletByName: vi.fn(async () => null),
    getLastWalletTransaction: vi.fn(async () => null),
    getUserSettings: vi.fn(async () => ({ exchangeRates: {} })),
    archiveWallet: vi.fn(),
    updateWallet: vi.fn(),
    getWalletById: vi.fn(),
    setUserBankrollV2Migrated: vi.fn(),
    backfillSnapshotsWalletId: vi.fn(),
    listWalletsByUser: vi.fn(async () => []),
    getActiveWalletsByUser: vi.fn(async () => []),
  });
});

const baseInput = {
  direction: 'in' as const,
  nativeAmount: 50,
  reason: 'deposit',
  occurredAt: new Date('2026-04-26T20:00:00Z'),
};

// =============================================================================
// Happy paths
// =============================================================================

describe('walletService.recordWalletTransaction — expectedPreviousBalance match', () => {
  it('expectedPreviousBalance == wallet.balance: resolve com transaction', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '100', status: 'active',
      nativeCurrency: 'USD',
    });

    const r = await walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
      ...baseInput,
      expectedPreviousBalance: 100,
    } as any);

    expect(r.transaction).toBeDefined();
    expect(r.wallet).toBeDefined();
    // Invariante audit ADR-017 mantida
    const txCall = txMock.createWalletTransaction.mock.calls[0][0];
    expect(parseFloat(txCall.previousNativeBalance)).toBe(100);
    expect(parseFloat(txCall.newNativeBalance)).toBe(150);
  });

  it('expectedPreviousBalance dentro do epsilon 0.01: resolve (drift toleravel)', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '99.995', status: 'active',
      nativeCurrency: 'USD',
    });

    // Diff = 0.005 < 0.01 -> aceita
    const r = await walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
      ...baseInput,
      expectedPreviousBalance: 100,
    } as any);

    expect(r.transaction).toBeDefined();
  });

  it('expectedPreviousBalance no limite exato do epsilon (0.01): aceita (boundary inclusive)', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '99.99', status: 'active',
      nativeCurrency: 'USD',
    });

    // Diff = 0.01 == 0.01 -> aceita (epsilon e <=)
    const r = await walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
      ...baseInput,
      expectedPreviousBalance: 100,
    } as any);

    expect(r.transaction).toBeDefined();
  });
});

// =============================================================================
// Drift detectado — rejeita com erro tipado
// =============================================================================

describe('walletService.recordWalletTransaction — expectedPreviousBalance mismatch', () => {
  it('diff > 0.01: rejeita com statusCode=409, code=balance_mismatch, currentBalance=<actual>', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '99', status: 'active',
      nativeCurrency: 'USD',
    });

    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
        ...baseInput,
        expectedPreviousBalance: 100,
      } as any),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'balance_mismatch',
      currentBalance: 99,
    });

    // Importante: createWalletTransaction NAO foi chamado (rollback antes do INSERT)
    expect(txMock.createWalletTransaction).not.toHaveBeenCalled();
    expect(txMock.insertBankrollSnapshot).not.toHaveBeenCalled();
    expect(txMock.updateWalletBalance).not.toHaveBeenCalled();
  });

  it('diff grande (saldo evoluiu muito): currentBalance reflete o valor real do DB', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '1247.50', status: 'active',
      nativeCurrency: 'USD',
    });

    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
        ...baseInput,
        expectedPreviousBalance: 1180,
      } as any),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'balance_mismatch',
      currentBalance: 1247.5,
    });
  });

  it('balance retornado como string decimal (parseDecimal aplicado em currentBalance)', async () => {
    // Drizzle decimal column volta como string. Precisamos de parseDecimal antes
    // de comparar e antes de expor no erro.
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '50.25', status: 'active',
      nativeCurrency: 'USD',
    });

    let caught: any = null;
    try {
      await walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
        ...baseInput,
        expectedPreviousBalance: 100,
      } as any);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeTruthy();
    expect(caught.statusCode).toBe(409);
    expect(typeof caught.currentBalance).toBe('number');
    expect(caught.currentBalance).toBe(50.25);
  });
});

// =============================================================================
// Backward-compat — sem expectedPreviousBalance (RF-07)
// =============================================================================

describe('walletService.recordWalletTransaction — backward-compat (sem expectedPreviousBalance)', () => {
  it('sem expectedPreviousBalance: resolve normalmente sem rodar check', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '100', status: 'active',
      nativeCurrency: 'USD',
    });

    const r = await walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
      ...baseInput,
    });

    expect(r.transaction).toBeDefined();
    expect(r.wallet).toBeDefined();
  });

  it('expectedPreviousBalance: undefined explicito: resolve normalmente', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '100', status: 'active',
      nativeCurrency: 'USD',
    });

    const r = await walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
      ...baseInput,
      expectedPreviousBalance: undefined,
    } as any);

    expect(r.transaction).toBeDefined();
  });

  // Edge: 0 NAO e undefined; comportamento valida zero como valor real
  it('expectedPreviousBalance=0 com balance=0: resolve (zero NAO e tratado como ausente)', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '0', status: 'active',
      nativeCurrency: 'USD',
    });

    const r = await walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
      ...baseInput,
      nativeAmount: 500,
      expectedPreviousBalance: 0,
    } as any);

    expect(r.transaction).toBeDefined();
  });

  it('expectedPreviousBalance=0 com balance=10: rejeita (zero e valor concreto, NAO ausencia)', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '10', status: 'active',
      nativeCurrency: 'USD',
    });

    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
        ...baseInput,
        expectedPreviousBalance: 0,
      } as any),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'balance_mismatch',
      currentBalance: 10,
    });
  });
});

// =============================================================================
// Ordem das verificacoes
// =============================================================================

describe('walletService.recordWalletTransaction — ordem das checagens', () => {
  it('check de expectedPreviousBalance roda APOS selectWalletForUpdate', async () => {
    const callOrder: string[] = [];
    txMock.selectWalletForUpdate.mockImplementation(async () => {
      callOrder.push('selectWalletForUpdate');
      return { id: 'wlt_1', userId: 'USER-0001', balance: '99', status: 'active', nativeCurrency: 'USD' };
    });
    txMock.createWalletTransaction.mockImplementation(async (input: any) => {
      callOrder.push('createWalletTransaction');
      return { id: 'wtx', ...input };
    });

    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
        ...baseInput,
        expectedPreviousBalance: 100,
      } as any),
    ).rejects.toMatchObject({ statusCode: 409, code: 'balance_mismatch' });

    // selectWalletForUpdate foi o primeiro evento; createWalletTransaction NUNCA aconteceu.
    expect(callOrder[0]).toBe('selectWalletForUpdate');
    expect(callOrder).not.toContain('createWalletTransaction');
  });

  it('wallet archived (409 wallet_archived) precede expectedPreviousBalance check', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '999', status: 'archived',
      nativeCurrency: 'USD',
    });

    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
        ...baseInput,
        // expected NAO bate com 999 — mas archive deve disparar primeiro
        expectedPreviousBalance: 100,
      } as any),
    ).rejects.toMatchObject({
      statusCode: 409,
      // Code esperado: wallet_archived (precedencia sobre balance_mismatch).
      code: 'wallet_archived',
    });
  });
});

// =============================================================================
// Tipo do input
// =============================================================================

describe('RecordWalletTransactionInput — tipo expectedPreviousBalance', () => {
  it('aceita number como expectedPreviousBalance', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1', userId: 'USER-0001', balance: '100', status: 'active',
      nativeCurrency: 'USD',
    });

    // typeof === 'number' deve passar pelo check do service
    const r = await walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
      ...baseInput,
      expectedPreviousBalance: 100,
    } as any);
    expect(r.transaction).toBeDefined();
  });
});
