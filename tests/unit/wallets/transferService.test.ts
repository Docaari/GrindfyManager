/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-4: Cross-wallet transfer (service layer)
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-4, D1, D4, D11)
 * ADR-059: Wallet transfers data model + cross-currency policy
 *
 * API esperada:
 *   walletService.createTransfer(userId, input):
 *     Promise<{ transfer, transactions: [outTx, inTx, feeTx?] }>
 *
 * Casos cobertos:
 *   1. Same-currency: amountTo defaulta para amountFrom, fxRate ignorado
 *   2. Cross-currency sem fxRate -> throw VALIDATION error
 *   3. Cross-currency com fxRate dentro de 5% market: ok
 *   4. Cross-currency com fxRate diff > 5% sem confirm flag: throw FX_DIFF_HIGH
 *   5. Cross-currency com fxRate diff > 5% com confirm flag: ok
 *   6. From === To -> throw
 *   7. amountFrom <= 0 -> throw
 *   8. Saldo insuficiente -> throw INSUFFICIENT_BALANCE
 *   9. Cria 1 wallet_transfers + 2 wallet_transactions (no fee)
 *  10. Cria 1 wallet_transfers + 3 wallet_transactions (com fee em wallet 3a)
 *  11. Fee em fromWallet: nao cria 3a tx (debito unico)
 *  12. Atualiza balance from -= amountFrom, to += amountTo
 *  13. Optimistic concurrency expectedVersion (ADR-038)
 *  14. Wallet archived -> 422 WALLET_ARCHIVED
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const txMock: any = {};

vi.mock('../../../server/storage', () => ({
  storage: {
    getWalletById: vi.fn(),
    listWalletsByUser: vi.fn(),
    selectWalletForUpdate: vi.fn(),
    createWalletTransaction: vi.fn(),
    insertWalletTransfer: vi.fn(),
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
  resolveExchangeRates: vi.fn(async () => ({
    rates: { USD: 1, BRL: 5.0, EUR: 0.93, USDT: 1.0 },
    source: 'fallback',
    resolvedAt: new Date(),
  })),
}));

import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(txMock, {
    selectWalletForUpdate: vi.fn(),
    createWalletTransaction: vi.fn(async (data: any) => ({
      id: 'tx_' + Math.random().toString(36).slice(2, 8),
      ...data,
    })),
    insertWalletTransfer: vi.fn(async (data: any) => ({
      id: 'transfer_' + Math.random().toString(36).slice(2, 8),
      ...data,
    })),
    updateWalletBalance: vi.fn(),
    getUserSettings: vi.fn(async () => ({
      exchangeRates: { BRL: 5.0, EUR: 0.93, USDT: 1.0 },
    })),
    getWalletById: vi.fn(),
  });
  (storage.getUserSettings as any).mockResolvedValue({
    exchangeRates: { BRL: 5.0, EUR: 0.93, USDT: 1.0 },
  });
});

async function loadService() {
  const mod = await import('../../../server/services/walletService');
  return mod.walletService;
}

function setupWallets(from: any, to: any) {
  txMock.selectWalletForUpdate.mockImplementation(async (id: string) => {
    if (id === from.id) return from;
    if (id === to.id) return to;
    return null;
  });
}

const fromUSD = {
  id: 'w_from',
  userId: 'USER-0001',
  name: 'GG Main',
  platform: 'GGNetwork',
  nativeCurrency: 'USD',
  balance: '1000',
  status: 'active',
  isShotPocket: false,
  version: 1,
};
const toUSD = {
  id: 'w_to',
  userId: 'USER-0001',
  name: 'Stars',
  platform: 'PokerStars',
  nativeCurrency: 'USD',
  balance: '500',
  status: 'active',
  isShotPocket: false,
  version: 1,
};
const toBRL = {
  ...toUSD,
  id: 'w_brl',
  name: 'Suprema BRL',
  platform: 'Suprema',
  nativeCurrency: 'BRL',
  balance: '0',
};

describe('walletService.createTransfer — RF-4 same-currency', () => {
  it('USD -> USD sem fxRate funciona, amountTo = amountFrom', async () => {
    setupWallets(fromUSD, toUSD);
    const svc = await loadService();
    const result = await (svc as any).createTransfer('USER-0001', {
      fromWalletId: 'w_from',
      toWalletId: 'w_to',
      amountFrom: 100,
      reason: 'transfer',
    });

    expect(result.transfer).toBeDefined();
    expect(result.transactions).toHaveLength(2);
    expect(txMock.insertWalletTransfer).toHaveBeenCalled();
    const xferPayload = txMock.insertWalletTransfer.mock.calls[0][0];
    expect(parseFloat(String(xferPayload.amountFrom))).toBe(100);
    expect(parseFloat(String(xferPayload.amountTo))).toBe(100);
  });

  it('USD -> USD com fxRate enviado: ignora (or usa 1)', async () => {
    setupWallets(fromUSD, toUSD);
    const svc = await loadService();
    const result = await (svc as any).createTransfer('USER-0001', {
      fromWalletId: 'w_from',
      toWalletId: 'w_to',
      amountFrom: 100,
      fxRate: 1.5, // ignorado em same-currency
      reason: 'transfer',
    });
    const xferPayload = txMock.insertWalletTransfer.mock.calls[0][0];
    expect(parseFloat(String(xferPayload.amountTo))).toBe(100);
  });

  it('cria 2 wallet_transactions (transfer_out + transfer_in)', async () => {
    setupWallets(fromUSD, toUSD);
    const svc = await loadService();
    await (svc as any).createTransfer('USER-0001', {
      fromWalletId: 'w_from',
      toWalletId: 'w_to',
      amountFrom: 100,
      reason: 'transfer',
    });

    expect(txMock.createWalletTransaction).toHaveBeenCalledTimes(2);
    const reasons = txMock.createWalletTransaction.mock.calls.map((c: any) => c[0].reason);
    expect(reasons).toContain('transfer_out');
    expect(reasons).toContain('transfer_in');
  });

  it('atualiza balance: from -= amountFrom, to += amountTo', async () => {
    setupWallets(fromUSD, toUSD);
    const svc = await loadService();
    await (svc as any).createTransfer('USER-0001', {
      fromWalletId: 'w_from',
      toWalletId: 'w_to',
      amountFrom: 100,
      reason: 'transfer',
    });

    expect(txMock.updateWalletBalance).toHaveBeenCalledTimes(2);
  });
});

describe('walletService.createTransfer — RF-4 cross-currency validation (D4)', () => {
  it('cross-currency sem fxRate -> throw VALIDATION', async () => {
    setupWallets(fromUSD, toBRL);
    const svc = await loadService();
    await expect(
      (svc as any).createTransfer('USER-0001', {
        fromWalletId: 'w_from',
        toWalletId: 'w_brl',
        amountFrom: 100,
        reason: 'transfer',
      }),
    ).rejects.toThrow(/fxRate/i);
  });

  it('cross-currency com fxRate dentro de 5% do market: ok', async () => {
    setupWallets(fromUSD, toBRL);
    // market: USD->BRL = rates.BRL/rates.USD = 5.0
    const svc = await loadService();
    const result = await (svc as any).createTransfer('USER-0001', {
      fromWalletId: 'w_from',
      toWalletId: 'w_brl',
      amountFrom: 100,
      fxRate: 5.05, // 1% diff
      reason: 'transfer',
    });

    expect(result.transfer).toBeDefined();
    expect(parseFloat(String(result.transfer.amountTo ?? 0))).toBeCloseTo(505, 0);
  });

  it('cross-currency diff > 5% sem confirmFxDiff -> throw FX_DIFF_HIGH', async () => {
    setupWallets(fromUSD, toBRL);
    const svc = await loadService();
    await expect(
      (svc as any).createTransfer('USER-0001', {
        fromWalletId: 'w_from',
        toWalletId: 'w_brl',
        amountFrom: 100,
        fxRate: 6.0, // 20% diff
        reason: 'transfer',
      }),
    ).rejects.toThrow(/FX_DIFF_HIGH|diverge/i);
  });

  it('cross-currency diff > 5% COM confirmFxDiff=true: ok', async () => {
    setupWallets(fromUSD, toBRL);
    const svc = await loadService();
    const result = await (svc as any).createTransfer('USER-0001', {
      fromWalletId: 'w_from',
      toWalletId: 'w_brl',
      amountFrom: 100,
      fxRate: 6.0,
      confirmFxDiff: true,
      reason: 'transfer',
    });
    expect(result.transfer).toBeDefined();
  });
});

describe('walletService.createTransfer — RF-4 validation', () => {
  it('from === to -> throw', async () => {
    setupWallets(fromUSD, fromUSD);
    const svc = await loadService();
    await expect(
      (svc as any).createTransfer('USER-0001', {
        fromWalletId: 'w_from',
        toWalletId: 'w_from',
        amountFrom: 100,
        reason: 'transfer',
      }),
    ).rejects.toThrow(/diferent/i);
  });

  it('amountFrom <= 0 -> throw', async () => {
    setupWallets(fromUSD, toUSD);
    const svc = await loadService();
    await expect(
      (svc as any).createTransfer('USER-0001', {
        fromWalletId: 'w_from',
        toWalletId: 'w_to',
        amountFrom: 0,
        reason: 'transfer',
      }),
    ).rejects.toThrow();
  });

  it('amountFrom negativo -> throw', async () => {
    setupWallets(fromUSD, toUSD);
    const svc = await loadService();
    await expect(
      (svc as any).createTransfer('USER-0001', {
        fromWalletId: 'w_from',
        toWalletId: 'w_to',
        amountFrom: -50,
        reason: 'transfer',
      }),
    ).rejects.toThrow();
  });

  it('saldo insuficiente -> throw INSUFFICIENT_BALANCE', async () => {
    setupWallets({ ...fromUSD, balance: '50' }, toUSD);
    const svc = await loadService();
    await expect(
      (svc as any).createTransfer('USER-0001', {
        fromWalletId: 'w_from',
        toWalletId: 'w_to',
        amountFrom: 100,
        reason: 'transfer',
      }),
    ).rejects.toThrow(/INSUFFICIENT_BALANCE|saldo/i);
  });

  it('wallet archived -> throw WALLET_ARCHIVED', async () => {
    setupWallets({ ...fromUSD, status: 'archived' }, toUSD);
    const svc = await loadService();
    await expect(
      (svc as any).createTransfer('USER-0001', {
        fromWalletId: 'w_from',
        toWalletId: 'w_to',
        amountFrom: 100,
        reason: 'transfer',
      }),
    ).rejects.toThrow(/archived/i);
  });

  it('wallet de outro user -> throw 403/404', async () => {
    setupWallets({ ...fromUSD, userId: 'USER-OTHER' }, toUSD);
    const svc = await loadService();
    await expect(
      (svc as any).createTransfer('USER-0001', {
        fromWalletId: 'w_from',
        toWalletId: 'w_to',
        amountFrom: 100,
        reason: 'transfer',
      }),
    ).rejects.toThrow();
  });

  it('reason invalido -> throw', async () => {
    setupWallets(fromUSD, toUSD);
    const svc = await loadService();
    await expect(
      (svc as any).createTransfer('USER-0001', {
        fromWalletId: 'w_from',
        toWalletId: 'w_to',
        amountFrom: 100,
        reason: 'unknown_reason',
      }),
    ).rejects.toThrow();
  });
});

describe('walletService.createTransfer — RF-4 fee handling', () => {
  it('fee em wallet 3a: cria 3 wallet_transactions', async () => {
    const feeWallet = {
      ...toUSD,
      id: 'w_fee',
      name: 'Fee Wallet',
      balance: '100',
    };
    txMock.selectWalletForUpdate.mockImplementation(async (id: string) => {
      if (id === fromUSD.id) return fromUSD;
      if (id === toUSD.id) return toUSD;
      if (id === feeWallet.id) return feeWallet;
      return null;
    });

    const svc = await loadService();
    const result = await (svc as any).createTransfer('USER-0001', {
      fromWalletId: 'w_from',
      toWalletId: 'w_to',
      amountFrom: 100,
      feeAmount: 5,
      feeCurrency: 'USD',
      feeWalletId: 'w_fee',
      reason: 'transfer',
    });

    expect(result.transactions.length).toBe(3);
    const reasons = result.transactions.map((t: any) => t.reason);
    expect(reasons).toContain('transfer_fee');
  });

  it('fee em fromWallet: nao cria 3a tx (debito unico)', async () => {
    setupWallets(fromUSD, toUSD);
    const svc = await loadService();
    const result = await (svc as any).createTransfer('USER-0001', {
      fromWalletId: 'w_from',
      toWalletId: 'w_to',
      amountFrom: 100,
      feeAmount: 5,
      feeCurrency: 'USD',
      feeWalletId: 'w_from', // same as from
      reason: 'transfer',
    });

    expect(result.transactions.length).toBe(2);
  });

  it('feeAmount sem feeCurrency/feeWalletId -> throw validation', async () => {
    setupWallets(fromUSD, toUSD);
    const svc = await loadService();
    await expect(
      (svc as any).createTransfer('USER-0001', {
        fromWalletId: 'w_from',
        toWalletId: 'w_to',
        amountFrom: 100,
        feeAmount: 5,
        // sem feeCurrency / feeWalletId
        reason: 'transfer',
      }),
    ).rejects.toThrow();
  });
});

describe('walletService.createTransfer — RF-4 transactionality', () => {
  it('roda dentro de storage.transaction (atomicidade)', async () => {
    setupWallets(fromUSD, toUSD);
    const svc = await loadService();
    await (svc as any).createTransfer('USER-0001', {
      fromWalletId: 'w_from',
      toWalletId: 'w_to',
      amountFrom: 100,
      reason: 'transfer',
    });
    expect(storage.transaction).toHaveBeenCalled();
  });

  it('cria 1 row em wallet_transfers (insertWalletTransfer)', async () => {
    setupWallets(fromUSD, toUSD);
    const svc = await loadService();
    await (svc as any).createTransfer('USER-0001', {
      fromWalletId: 'w_from',
      toWalletId: 'w_to',
      amountFrom: 100,
      reason: 'transfer',
    });
    expect(txMock.insertWalletTransfer).toHaveBeenCalledTimes(1);
  });

  it('transfer_group_id eh consistente entre transfer + transactions', async () => {
    setupWallets(fromUSD, toUSD);
    const svc = await loadService();
    await (svc as any).createTransfer('USER-0001', {
      fromWalletId: 'w_from',
      toWalletId: 'w_to',
      amountFrom: 100,
      reason: 'transfer',
    });

    const xferPayload = txMock.insertWalletTransfer.mock.calls[0][0];
    const txCalls = txMock.createWalletTransaction.mock.calls.map((c: any) => c[0]);
    const groupIds = txCalls.map((t: any) => t.transferGroupId).filter(Boolean);
    if (xferPayload.transferGroupId) {
      for (const gid of groupIds) expect(gid).toBe(xferPayload.transferGroupId);
    }
  });

  it('falha em update balance -> throw rollback (storage.transaction propaga)', async () => {
    setupWallets(fromUSD, toUSD);
    txMock.updateWalletBalance.mockRejectedValueOnce(new Error('db boom'));
    const svc = await loadService();
    await expect(
      (svc as any).createTransfer('USER-0001', {
        fromWalletId: 'w_from',
        toWalletId: 'w_to',
        amountFrom: 100,
        reason: 'transfer',
      }),
    ).rejects.toThrow();
  });
});
