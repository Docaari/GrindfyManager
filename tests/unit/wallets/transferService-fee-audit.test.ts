/**
 * Sprint Bankroll-3 — Round 3 FIX-1
 * Test-Writer (TDD - Green phase test, validacao do fix do reviewer)
 *
 * Reviewer round 2 identificou HIGH NOVO: audit trail divergente quando
 * fee paga da fromWallet. Criava transfer_out com newNativeBalance =
 * fromBalance - amountFrom, mas DB ficava em fromBalance - amountFrom - feeAmount
 * (divergencia de feeAmount entre ultima tx e wallets.balance).
 *
 * Fix: somar feeAmount ao transfer_out.nativeAmount (debito unico).
 * - tx.newNativeBalance bate com wallets.balance final
 * - storage.updateWalletBalance NAO chamado em separado para fromWallet
 * - length === 2 preservado (compativel com transferService.test.ts:401)
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

describe('walletService.createTransfer — Round 3 FIX-1: audit trail fee fromWallet', () => {
  beforeEach(() => {
    txMock.selectWalletForUpdate.mockImplementation(async (id: string) => {
      if (id === fromUSD.id) return fromUSD;
      if (id === toUSD.id) return toUSD;
      return null;
    });
  });

  it('fee na fromWallet: tx.newNativeBalance bate com balance final no DB (debito unico)', async () => {
    const svc = await loadService();
    await (svc as any).createTransfer('USER-0001', {
      fromWalletId: 'w_from',
      toWalletId: 'w_to',
      amountFrom: 100,
      feeAmount: 5,
      feeCurrency: 'USD',
      feeWalletId: 'w_from', // mesma wallet do origem
      reason: 'transfer',
    });

    // Length === 2 preservado (compativel com transferService.test.ts:401)
    expect(txMock.createWalletTransaction).toHaveBeenCalledTimes(2);

    const calls = txMock.createWalletTransaction.mock.calls.map((c: any) => c[0]);
    const txOut = calls.find((c: any) => c.reason === 'transfer_out');
    expect(txOut).toBeDefined();

    // Audit core: nativeAmount inclui fee (debito unico)
    expect(parseFloat(String(txOut.nativeAmount))).toBe(105);
    expect(parseFloat(String(txOut.previousNativeBalance))).toBe(1000);
    expect(parseFloat(String(txOut.newNativeBalance))).toBe(895);

    // updateWalletBalance chamado apenas 2x (uma para from, uma para to);
    // SEM 3a chamada extra para fromWallet com -feeAmount adicional.
    expect(txMock.updateWalletBalance).toHaveBeenCalledTimes(2);

    // O update de fromWallet bate com newNativeBalance da tx (consistencia)
    const fromUpdateCall = txMock.updateWalletBalance.mock.calls.find(
      (c: any) => c[0] === 'w_from',
    );
    expect(fromUpdateCall).toBeDefined();
    expect(Number(fromUpdateCall[1])).toBe(895);
  });

  it('saldo insuficiente para amountFrom + fee na mesma wallet -> INSUFFICIENT_BALANCE', async () => {
    // fromBalance=1000, amountFrom=998, fee=5 -> total=1003 > 1000
    const svc = await loadService();
    await expect(
      (svc as any).createTransfer('USER-0001', {
        fromWalletId: 'w_from',
        toWalletId: 'w_to',
        amountFrom: 998,
        feeAmount: 5,
        feeCurrency: 'USD',
        feeWalletId: 'w_from',
        reason: 'transfer',
      }),
    ).rejects.toThrow(/INSUFFICIENT_BALANCE|saldo/i);
  });
});
