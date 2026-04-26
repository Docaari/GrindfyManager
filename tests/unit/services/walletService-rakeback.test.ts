import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Bankroll-3 — walletService.recordWalletTransaction (rakeback)
//
// Spec: Docs/specs/rakeback-reporting.md
// ADR : Docs/architecture/decisions/039-rakeback-as-wallet-tx-reason.md
// Sequence: Docs/architecture/flows/bankroll/sequence-rakeback-report.mermaid
//
// CONTRATO REAL DA IMPLEMENTACAO (server/services/walletService.ts):
// 1. Rakeback usa o mesmo fluxo de recordWalletTransaction.
// 2. Wallet archived check ocorre PRIMEIRO (precedencia sobre rakeback validation).
// 3. Defesa em profundidade: reason='rakeback' && direction='out' ->
//    makeError(400, 'invalid_rakeback_direction').
// 4. Persistencia:
//      - createWalletTransaction com reason='rakeback', direction='in',
//        nativeCurrency da wallet, fxRateUSDPerNative aplicado;
//      - updateWalletBalance incrementa pelo nativeAmount;
//      - insertBankrollSnapshot com reason='rakeback'.
// 5. Wallet de outro usuario => selectWalletForUpdate retorna null =>
//    makeError(404, 'wallet_not_found').
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
    createWalletTransaction: vi.fn(async (input: any) => ({ id: 'wtx_1', ...input })),
    insertBankrollSnapshot: vi.fn(async () => ({ id: 'snap_1' })),
    updateWalletBalance: vi.fn(),
    countActiveWalletsByUser: vi.fn(async () => 0),
    findActiveWalletByName: vi.fn(async () => null),
    getLastWalletTransaction: vi.fn(async () => null),
    getUserSettings: vi.fn(async () => ({ exchangeRates: { BRL: 5.0 } })),
    archiveWallet: vi.fn(),
    updateWallet: vi.fn(),
    getWalletById: vi.fn(),
    setUserBankrollV2Migrated: vi.fn(),
    backfillSnapshotsWalletId: vi.fn(),
    listWalletsByUser: vi.fn(async () => []),
    getActiveWalletsByUser: vi.fn(async () => []),
  });
});

const baseRakebackInput = {
  direction: 'in' as const,
  nativeAmount: 50,
  reason: 'rakeback',
  occurredAt: new Date('2026-04-26T18:30:00Z'),
};

// =============================================================================
// 1. Happy path
// =============================================================================

describe('walletService.recordWalletTransaction — rakeback happy path (RF-02)', () => {
  it('cria transacao com reason=rakeback e direction=in', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1',
      userId: 'USER-0001',
      balance: '1000',
      status: 'active',
      nativeCurrency: 'BRL',
    });

    const r = await walletService.recordWalletTransaction(
      'USER-0001',
      'wlt_1',
      baseRakebackInput as any,
    );

    expect(r.transaction).toBeDefined();
    expect(r.wallet).toBeDefined();
    const txArgs = txMock.createWalletTransaction.mock.calls[0][0];
    expect(txArgs.reason).toBe('rakeback');
    expect(txArgs.direction).toBe('in');
    expect(txArgs.nativeCurrency).toBe('BRL');
    expect(parseFloat(txArgs.nativeAmount)).toBe(50);
  });

  it('atualiza balance somando nativeAmount (1000 -> 1050)', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1',
      userId: 'USER-0001',
      balance: '1000',
      status: 'active',
      nativeCurrency: 'BRL',
    });

    await walletService.recordWalletTransaction(
      'USER-0001',
      'wlt_1',
      baseRakebackInput as any,
    );

    expect(txMock.updateWalletBalance).toHaveBeenCalledWith('wlt_1', 1050);
    const txArgs = txMock.createWalletTransaction.mock.calls[0][0];
    expect(parseFloat(txArgs.previousNativeBalance)).toBe(1000);
    expect(parseFloat(txArgs.newNativeBalance)).toBe(1050);
  });

  it('espelha em bankroll_snapshots com reason=rakeback', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1',
      userId: 'USER-0001',
      balance: '1000',
      status: 'active',
      nativeCurrency: 'BRL',
    });

    await walletService.recordWalletTransaction(
      'USER-0001',
      'wlt_1',
      baseRakebackInput as any,
    );

    expect(txMock.insertBankrollSnapshot).toHaveBeenCalledTimes(1);
    const snapArgs = txMock.insertBankrollSnapshot.mock.calls[0][0];
    expect(snapArgs.reason).toBe('rakeback');
    expect(snapArgs.walletId).toBe('wlt_1');
    expect(snapArgs.nativeCurrency).toBe('BRL');
  });

  it('aplica fxRate da wallet (BRL com taxa 5.0 -> usdAmount = nativeAmount/5)', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1',
      userId: 'USER-0001',
      balance: '0',
      status: 'active',
      nativeCurrency: 'BRL',
    });

    await walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
      ...baseRakebackInput,
      nativeAmount: 50,
    } as any);

    const txArgs = txMock.createWalletTransaction.mock.calls[0][0];
    expect(parseFloat(txArgs.fxRateUSDPerNative)).toBe(5);
    expect(parseFloat(txArgs.usdAmount)).toBeCloseTo(10, 2);
  });
});

// =============================================================================
// 2. Wallet archived
// =============================================================================

describe('walletService.recordWalletTransaction — rakeback em wallet archived', () => {
  it('rejeita com 409 wallet_archived', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1',
      userId: 'USER-0001',
      balance: '500',
      status: 'archived',
      nativeCurrency: 'BRL',
    });

    await expect(
      walletService.recordWalletTransaction(
        'USER-0001',
        'wlt_1',
        baseRakebackInput as any,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'wallet_archived',
    });
  });

  it('archived check tem precedencia sobre rakeback validation (precedencia ADR-039)', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1',
      userId: 'USER-0001',
      balance: '500',
      status: 'archived',
      nativeCurrency: 'BRL',
    });

    // Mesmo enviando direction=out (que tambem seria erro rakeback),
    // o codigo de erro deve ser wallet_archived (precede).
    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
        ...baseRakebackInput,
        direction: 'out',
      } as any),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'wallet_archived',
    });
  });

  it('quando archived, nao chama createWalletTransaction nem insertBankrollSnapshot', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1',
      userId: 'USER-0001',
      balance: '500',
      status: 'archived',
      nativeCurrency: 'BRL',
    });

    await expect(
      walletService.recordWalletTransaction(
        'USER-0001',
        'wlt_1',
        baseRakebackInput as any,
      ),
    ).rejects.toMatchObject({ code: 'wallet_archived' });

    expect(txMock.createWalletTransaction).not.toHaveBeenCalled();
    expect(txMock.insertBankrollSnapshot).not.toHaveBeenCalled();
    expect(txMock.updateWalletBalance).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 3. Wallet de outro usuario
// =============================================================================

describe('walletService.recordWalletTransaction — rakeback em wallet de outro usuario', () => {
  it('selectWalletForUpdate retorna null -> 404 wallet_not_found', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue(null);

    await expect(
      walletService.recordWalletTransaction(
        'USER-0001',
        'wlt_other',
        baseRakebackInput as any,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'wallet_not_found',
    });
  });

  it('quando wallet inexistente, nao persiste nada', async () => {
    txMock.selectWalletForUpdate.mockResolvedValue(null);

    await expect(
      walletService.recordWalletTransaction(
        'USER-0001',
        'wlt_other',
        baseRakebackInput as any,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(txMock.createWalletTransaction).not.toHaveBeenCalled();
    expect(txMock.insertBankrollSnapshot).not.toHaveBeenCalled();
    expect(txMock.updateWalletBalance).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 4. Defesa em profundidade — direction='out' com reason='rakeback'
// =============================================================================

describe('walletService.recordWalletTransaction — defesa em profundidade (rakeback + out)', () => {
  it("reason='rakeback' + direction='out' -> 400 invalid_rakeback_direction", async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1',
      userId: 'USER-0001',
      balance: '1000',
      status: 'active',
      nativeCurrency: 'BRL',
    });

    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
        ...baseRakebackInput,
        direction: 'out',
      } as any),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'invalid_rakeback_direction',
    });
  });

  it("rakeback + out NAO chega a persistir (createWalletTransaction nao chamado)", async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1',
      userId: 'USER-0001',
      balance: '1000',
      status: 'active',
      nativeCurrency: 'BRL',
    });

    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
        ...baseRakebackInput,
        direction: 'out',
      } as any),
    ).rejects.toMatchObject({ code: 'invalid_rakeback_direction' });

    expect(txMock.createWalletTransaction).not.toHaveBeenCalled();
    expect(txMock.insertBankrollSnapshot).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 5. Backward-compat — outros reasons inalterados
// =============================================================================

describe('walletService.recordWalletTransaction — outros reasons sem regressao (RF-08)', () => {
  it("deposit (in/out) continua funcionando apos adicao de rakeback", async () => {
    txMock.selectWalletForUpdate.mockResolvedValue({
      id: 'wlt_1',
      userId: 'USER-0001',
      balance: '0',
      status: 'active',
      nativeCurrency: 'USD',
    });

    const r = await walletService.recordWalletTransaction('USER-0001', 'wlt_1', {
      direction: 'in',
      nativeAmount: 100,
      reason: 'deposit',
      occurredAt: new Date('2026-04-26T18:30:00Z'),
    } as any);

    expect(r.transaction).toBeDefined();
    const txArgs = txMock.createWalletTransaction.mock.calls[0][0];
    expect(txArgs.reason).toBe('deposit');
    expect(txArgs.direction).toBe('in');
  });
});
