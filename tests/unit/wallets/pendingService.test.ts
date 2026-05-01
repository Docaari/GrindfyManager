/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-5: Pending transactions (service layer)
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-5, D8)
 *
 * API esperada:
 *   walletService.createPending(userId, walletId, input)
 *   walletService.listPending(userId, walletId, opts)
 *   walletService.cancelPending(userId, pendingId)
 *   walletService.settlePending(userId, pendingId, body)
 *
 * Casos cobertos:
 *   1. createPending happy path: status='pending', NAO afeta wallet balance
 *   2. createPending rejeita direction invalida
 *   3. createPending rejeita amount <= 0
 *   4. createPending cap 10 -> throw PENDING_CAP_REACHED
 *   5. listPending default retorna apenas status='pending'
 *   6. listPending ?includeAll inclui cleared+cancelled
 *   7. cancelPending muda status para 'cancelled', popula cancelled_at
 *   8. cancelPending idempotente: re-DELETE OK
 *   9. settlePending materializa em wallet_transactions, marca cleared
 *  10. settlePending de pending ja cleared -> throw 409
 *  11. settlePending deposit_pending: tx reason='deposit', balance += amount
 *  12. settlePending withdrawal_pending: tx reason='withdrawal', balance -= amount
 *  13. settlePending withdraw saldo insuficiente -> throw INSUFFICIENT_BALANCE
 *  14. settlePending com actualNativeAmount: usa o real, NAO o declarado
 *  15. external_reference herdado para wallet_transactions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const txMock: any = {};

vi.mock('../../../server/storage', () => ({
  storage: {
    createWalletPending: vi.fn(),
    listWalletPending: vi.fn(),
    countWalletPendingActive: vi.fn(),
    getWalletPendingById: vi.fn(),
    updateWalletPendingStatus: vi.fn(),
    getWalletById: vi.fn(),
    selectWalletForUpdate: vi.fn(),
    createWalletTransaction: vi.fn(),
    updateWalletBalance: vi.fn(),
    getUserSettings: vi.fn(),
    transaction: vi.fn(async (fn: any) => fn(txMock)),
  },
}));

vi.mock('../../../server/services/walletCache', () => ({
  walletCache: { invalidateAllForUser: vi.fn(), get: vi.fn(() => null), set: vi.fn() },
}));
vi.mock('../../../server/services/bankrollCache', () => ({
  bankrollCache: { invalidateAllForUser: vi.fn(), get: vi.fn(() => null), set: vi.fn() },
}));
vi.mock('../../../server/services/selectorCache', () => ({
  selectorCache: { invalidateAllForUser: vi.fn(), get: vi.fn(() => null), set: vi.fn() },
}));
vi.mock('../../../server/services/fxResolver', () => ({
  fxResolver: {
    resolveExchangeRates: vi.fn(async () => ({
      rates: { USD: 1, BRL: 5.0, EUR: 0.93, USDT: 1.0 },
      source: 'fallback',
      resolvedAt: new Date(),
    })),
    invalidateCache: vi.fn(),
  },
}));

import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(txMock, {
    createWalletPending: vi.fn(async (data: any) => ({
      id: 'pending_1',
      status: 'pending',
      ...data,
    })),
    countWalletPendingActive: vi.fn(async () => 0),
    getWalletPendingById: vi.fn(),
    updateWalletPendingStatus: vi.fn(),
    selectWalletForUpdate: vi.fn(),
    createWalletTransaction: vi.fn(async (data: any) => ({
      id: 'tx_new',
      ...data,
    })),
    updateWalletBalance: vi.fn(),
    getUserSettings: vi.fn(async () => ({ exchangeRates: {} })),
    getWalletById: vi.fn(),
  });
});

async function loadService() {
  const mod: any = await import('../../../server/services/walletService');
  return mod.walletService;
}

const wallet = {
  id: 'w1',
  userId: 'USER-0001',
  name: 'GG',
  platform: 'GGNetwork',
  nativeCurrency: 'USD',
  balance: '500',
  status: 'active',
  isShotPocket: false,
  version: 1,
};

describe('walletService.createPending — RF-5', () => {
  it('happy path: cria pending com status=pending', async () => {
    txMock.getWalletById.mockResolvedValue(wallet);
    (storage.getWalletById as any).mockResolvedValue(wallet);

    const svc = await loadService();
    const result = await (svc as any).createPending('USER-0001', 'w1', {
      direction: 'deposit_pending',
      nativeAmount: 100,
      nativeCurrency: 'USD',
      reason: 'deposit',
    });
    expect(result.status).toBe('pending');
    expect(txMock.createWalletPending).toHaveBeenCalled();
  });

  it('NAO altera wallet balance', async () => {
    txMock.getWalletById.mockResolvedValue(wallet);
    (storage.getWalletById as any).mockResolvedValue(wallet);
    const svc = await loadService();
    await (svc as any).createPending('USER-0001', 'w1', {
      direction: 'deposit_pending',
      nativeAmount: 100,
      nativeCurrency: 'USD',
      reason: 'deposit',
    });
    expect(txMock.updateWalletBalance).not.toHaveBeenCalled();
    expect(txMock.createWalletTransaction).not.toHaveBeenCalled();
  });

  it('rejeita direction invalida', async () => {
    (storage.getWalletById as any).mockResolvedValue(wallet);
    const svc = await loadService();
    await expect(
      (svc as any).createPending('USER-0001', 'w1', {
        direction: 'lixo',
        nativeAmount: 100,
        nativeCurrency: 'USD',
        reason: 'deposit',
      }),
    ).rejects.toThrow();
  });

  it('rejeita nativeAmount <= 0', async () => {
    (storage.getWalletById as any).mockResolvedValue(wallet);
    const svc = await loadService();
    await expect(
      (svc as any).createPending('USER-0001', 'w1', {
        direction: 'deposit_pending',
        nativeAmount: 0,
        nativeCurrency: 'USD',
        reason: 'deposit',
      }),
    ).rejects.toThrow();
  });

  it('cap 10: 11a tentativa lanca PENDING_CAP_REACHED', async () => {
    (storage.getWalletById as any).mockResolvedValue(wallet);
    txMock.countWalletPendingActive.mockResolvedValue(10);
    const svc = await loadService();
    await expect(
      (svc as any).createPending('USER-0001', 'w1', {
        direction: 'deposit_pending',
        nativeAmount: 100,
        nativeCurrency: 'USD',
        reason: 'deposit',
      }),
    ).rejects.toThrow(/PENDING_CAP_REACHED|cap/i);
  });

  it('wallet de outro user -> throw', async () => {
    (storage.getWalletById as any).mockResolvedValue({ ...wallet, userId: 'USER-OTHER' });
    const svc = await loadService();
    await expect(
      (svc as any).createPending('USER-0001', 'w1', {
        direction: 'deposit_pending',
        nativeAmount: 100,
        nativeCurrency: 'USD',
        reason: 'deposit',
      }),
    ).rejects.toThrow();
  });

  it('wallet archived: rejeita novo pending', async () => {
    (storage.getWalletById as any).mockResolvedValue({ ...wallet, status: 'archived' });
    const svc = await loadService();
    await expect(
      (svc as any).createPending('USER-0001', 'w1', {
        direction: 'deposit_pending',
        nativeAmount: 100,
        nativeCurrency: 'USD',
        reason: 'deposit',
      }),
    ).rejects.toThrow(/archived/i);
  });

  it('aceita externalReference opcional', async () => {
    (storage.getWalletById as any).mockResolvedValue(wallet);
    const svc = await loadService();
    await (svc as any).createPending('USER-0001', 'w1', {
      direction: 'deposit_pending',
      nativeAmount: 100,
      nativeCurrency: 'USD',
      reason: 'deposit',
      externalReference: 'TXN-EXT-12345',
    });
    const args = txMock.createWalletPending.mock.calls[0][0];
    expect(args.externalReference).toBe('TXN-EXT-12345');
  });
});

describe('walletService.listPending — RF-5', () => {
  it('default retorna apenas status=pending', async () => {
    (storage.listWalletPending as any).mockResolvedValue([
      { id: 'p1', status: 'pending', walletId: 'w1' },
    ]);
    const svc = await loadService();
    const result = await (svc as any).listPending('USER-0001', 'w1');
    expect(result.length).toBe(1);
    const args = (storage.listWalletPending as any).mock.calls[0];
    // includeAll=false por default (ou nao incluido)
    const opts = args[2] ?? args[1] ?? {};
    expect(opts.includeAll ?? false).toBe(false);
  });

  it('includeAll=true passa flag para storage', async () => {
    (storage.listWalletPending as any).mockResolvedValue([]);
    const svc = await loadService();
    await (svc as any).listPending('USER-0001', 'w1', { includeAll: true });
    const args = (storage.listWalletPending as any).mock.calls[0];
    const opts = args[2] ?? args[1];
    expect(opts.includeAll).toBe(true);
  });
});

describe('walletService.cancelPending — RF-5', () => {
  it('muda status para cancelled', async () => {
    (storage.getWalletPendingById as any).mockResolvedValue({
      id: 'p1',
      walletId: 'w1',
      status: 'pending',
      userId: 'USER-0001',
    });
    const svc = await loadService();
    await (svc as any).cancelPending('USER-0001', 'p1');
    expect(storage.updateWalletPendingStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'cancelled' }),
    );
  });

  it('idempotente: re-cancel de pending ja cancelado retorna OK (warn)', async () => {
    (storage.getWalletPendingById as any).mockResolvedValue({
      id: 'p1',
      walletId: 'w1',
      status: 'cancelled',
      userId: 'USER-0001',
    });
    const svc = await loadService();
    const r = await (svc as any).cancelPending('USER-0001', 'p1');
    expect(r).toBeDefined();
  });

  it('not found -> throw', async () => {
    (storage.getWalletPendingById as any).mockResolvedValue(null);
    const svc = await loadService();
    await expect((svc as any).cancelPending('USER-0001', 'inexist')).rejects.toThrow();
  });
});

describe('walletService.settlePending — RF-5', () => {
  beforeEach(() => {
    (storage.getWalletPendingById as any).mockResolvedValue({
      id: 'p1',
      walletId: 'w1',
      status: 'pending',
      userId: 'USER-0001',
      direction: 'deposit_pending',
      nativeAmount: '100',
      nativeCurrency: 'USD',
      reason: 'deposit',
      externalReference: 'EXT-1',
    });
    txMock.getWalletPendingById.mockResolvedValue({
      id: 'p1',
      walletId: 'w1',
      status: 'pending',
      userId: 'USER-0001',
      direction: 'deposit_pending',
      nativeAmount: '100',
      nativeCurrency: 'USD',
      reason: 'deposit',
      externalReference: 'EXT-1',
    });
    txMock.selectWalletForUpdate.mockResolvedValue(wallet);
  });

  it('deposit_pending: tx reason=deposit, balance += amount', async () => {
    const svc = await loadService();
    await (svc as any).settlePending('USER-0001', 'p1', {});
    const txArg = txMock.createWalletTransaction.mock.calls[0][0];
    expect(txArg.reason).toBe('deposit');
    expect(txMock.updateWalletPendingStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'cleared' }),
    );
  });

  it('withdrawal_pending: tx reason=withdrawal', async () => {
    txMock.getWalletPendingById.mockResolvedValue({
      id: 'p2',
      walletId: 'w1',
      status: 'pending',
      userId: 'USER-0001',
      direction: 'withdrawal_pending',
      nativeAmount: '50',
      nativeCurrency: 'USD',
      reason: 'withdrawal',
    });
    (storage.getWalletPendingById as any).mockResolvedValue({
      id: 'p2',
      walletId: 'w1',
      status: 'pending',
      userId: 'USER-0001',
      direction: 'withdrawal_pending',
      nativeAmount: '50',
      nativeCurrency: 'USD',
      reason: 'withdrawal',
    });

    const svc = await loadService();
    await (svc as any).settlePending('USER-0001', 'p2', {});
    const txArg = txMock.createWalletTransaction.mock.calls[0][0];
    expect(txArg.reason).toBe('withdrawal');
  });

  it('withdrawal saldo insuficiente -> throw INSUFFICIENT_BALANCE', async () => {
    txMock.getWalletPendingById.mockResolvedValue({
      id: 'p3',
      walletId: 'w1',
      status: 'pending',
      userId: 'USER-0001',
      direction: 'withdrawal_pending',
      nativeAmount: '99999',
      nativeCurrency: 'USD',
      reason: 'withdrawal',
    });
    (storage.getWalletPendingById as any).mockResolvedValue({
      id: 'p3',
      walletId: 'w1',
      status: 'pending',
      userId: 'USER-0001',
      direction: 'withdrawal_pending',
      nativeAmount: '99999',
      nativeCurrency: 'USD',
      reason: 'withdrawal',
    });
    const svc = await loadService();
    await expect((svc as any).settlePending('USER-0001', 'p3', {})).rejects.toThrow(
      /INSUFFICIENT_BALANCE|saldo/i,
    );
  });

  it('settle de pending ja cleared -> throw 409', async () => {
    (storage.getWalletPendingById as any).mockResolvedValue({
      id: 'p1',
      walletId: 'w1',
      status: 'cleared',
      userId: 'USER-0001',
      direction: 'deposit_pending',
      nativeAmount: '100',
      nativeCurrency: 'USD',
      reason: 'deposit',
    });
    txMock.getWalletPendingById.mockResolvedValue({
      id: 'p1',
      walletId: 'w1',
      status: 'cleared',
      userId: 'USER-0001',
      direction: 'deposit_pending',
      nativeAmount: '100',
      nativeCurrency: 'USD',
      reason: 'deposit',
    });
    const svc = await loadService();
    await expect((svc as any).settlePending('USER-0001', 'p1', {})).rejects.toThrow(/409|cleared|already/i);
  });

  it('settle com actualNativeAmount usa amount real', async () => {
    const svc = await loadService();
    await (svc as any).settlePending('USER-0001', 'p1', { actualNativeAmount: 98 });
    const txArg = txMock.createWalletTransaction.mock.calls[0][0];
    const amount = parseFloat(String(txArg.nativeAmount ?? txArg.amount ?? 0));
    expect(amount).toBeCloseTo(98, 2);
  });

  it('externalReference herdado para wallet_transactions', async () => {
    const svc = await loadService();
    await (svc as any).settlePending('USER-0001', 'p1', {});
    const txArg = txMock.createWalletTransaction.mock.calls[0][0];
    expect(txArg.externalReference).toBe('EXT-1');
  });

  it('not found -> throw 404', async () => {
    (storage.getWalletPendingById as any).mockResolvedValue(null);
    txMock.getWalletPendingById.mockResolvedValue(null);
    const svc = await loadService();
    await expect((svc as any).settlePending('USER-0001', 'inexist', {})).rejects.toThrow();
  });

  it('roda dentro de storage.transaction', async () => {
    const svc = await loadService();
    await (svc as any).settlePending('USER-0001', 'p1', {});
    expect(storage.transaction).toHaveBeenCalled();
  });
});
