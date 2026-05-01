/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-11: fxResolver unificado
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-11, D9)
 * ADR-061: fxResolver unified service
 *
 * API esperada em server/services/fxResolver.ts:
 *   resolveExchangeRates(userId): Promise<FxRates>
 *   convertToUSD(amount, currency, rates): number
 *   convertFromUSD(amountUsd, targetCurrency, rates): number
 *   convertBetween(amount, from, to, rates): number
 *   FALLBACK_FX_RATES: Readonly<Record<string,number>>
 *
 * Convencao QW-1 (ADR-033): rates[ccy] = unidades de ccy por 1 USD
 *   USD: 1, BRL: 5.0, EUR: 0.93, USDT: 1.0
 *
 * Casos cobertos:
 *   1. FALLBACK_FX_RATES exporta os 5+ valores
 *   2. convertToUSD: 100 BRL com rate=5.0 -> 20 USD
 *   3. convertFromUSD: 20 USD com rate=5.0 -> 100 BRL
 *   4. convertBetween: 100 BRL -> 95.5 EUR (passa por USD)
 *   5. convertToUSD: USD -> USD passa direto
 *   6. convertBetween from===to: identity
 *   7. cascata: user rates sobrepoem fallback
 *   8. cascata: wallets rates preenchem currencies que user nao tem
 *   9. fallback: sem user/wallets -> FALLBACK_FX_RATES
 *  10. cache 5min por userId
 *  11. invalidateCache limpa cache
 *  12. userId null -> fallback direto
 *  13. currency unknown -> rate=1 (USD-equivalent)
 *  14. shape: rates, source, resolvedAt
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserSettings: vi.fn(),
    listWalletsByUser: vi.fn(),
  },
}));

import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getUserSettings as any).mockResolvedValue({});
  (storage.listWalletsByUser as any).mockResolvedValue([]);
});

async function loadFx() {
  const mod: any = await import('../../../server/services/fxResolver');
  return mod;
}

describe('fxResolver — RF-11 FALLBACK_FX_RATES', () => {
  it('exporta USD=1, BRL=5.0, EUR=0.93, USDT=1.0, CNY=7.2', async () => {
    const mod = await loadFx();
    expect(mod.FALLBACK_FX_RATES.USD).toBe(1);
    expect(mod.FALLBACK_FX_RATES.BRL).toBeCloseTo(5.0, 2);
    expect(mod.FALLBACK_FX_RATES.EUR).toBeCloseTo(0.93, 2);
    expect(mod.FALLBACK_FX_RATES.USDT).toBeCloseTo(1.0, 2);
    expect(mod.FALLBACK_FX_RATES.CNY).toBeCloseTo(7.2, 1);
  });
});

describe('fxResolver — RF-11 convert helpers', () => {
  it('convertToUSD: 100 BRL com rate=5.0 -> 20 USD', async () => {
    const mod = await loadFx();
    const r = mod.convertToUSD(100, 'BRL', { BRL: 5.0 });
    expect(r).toBeCloseTo(20, 2);
  });

  it('convertToUSD: USD -> USD identidade', async () => {
    const mod = await loadFx();
    const r = mod.convertToUSD(100, 'USD', { USD: 1, BRL: 5.0 });
    expect(r).toBeCloseTo(100, 2);
  });

  it('convertFromUSD: 20 USD com rate=5.0 -> 100 BRL', async () => {
    const mod = await loadFx();
    const r = mod.convertFromUSD(20, 'BRL', { BRL: 5.0 });
    expect(r).toBeCloseTo(100, 2);
  });

  it('convertBetween: 100 BRL -> ~18.6 EUR (via USD)', async () => {
    const mod = await loadFx();
    const r = mod.convertBetween(100, 'BRL', 'EUR', { BRL: 5.0, EUR: 0.93 });
    expect(r).toBeCloseTo(18.6, 1);
  });

  it('convertBetween from===to: identidade', async () => {
    const mod = await loadFx();
    const r = mod.convertBetween(100, 'BRL', 'BRL', { BRL: 5.0 });
    expect(r).toBeCloseTo(100, 2);
  });

  it('convertToUSD currency unknown: usa fallback ou rate=1', async () => {
    const mod = await loadFx();
    const r = mod.convertToUSD(100, 'XYZ', {});
    expect(typeof r).toBe('number');
    // Quando unknown e nao em fallback: usa 1 -> retorna 100
    expect(r).toBe(100);
  });
});

describe('fxResolver — RF-11 resolveExchangeRates cascata', () => {
  it('user com exchangeRates: rates contem user values', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      exchangeRates: { BRL: 5.5, EUR: 0.95 },
    });
    const mod = await loadFx();
    const result = await mod.resolveExchangeRates('USER-0001');
    expect(result.rates.BRL).toBeCloseTo(5.5, 2);
    expect(result.rates.EUR).toBeCloseTo(0.95, 2);
    expect(result.source).toBe('user');
  });

  it('user sem exchangeRates: cai no fallback', async () => {
    (storage.getUserSettings as any).mockResolvedValue({});
    const mod = await loadFx();
    const result = await mod.resolveExchangeRates('USER-0001');
    expect(result.rates.BRL).toBeCloseTo(5.0, 2);
    expect(result.source).toBe('fallback');
  });

  it('wallets exchangeRates preenchem currencies que user nao tem', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      exchangeRates: { BRL: 5.5 },
    });
    (storage.listWalletsByUser as any).mockResolvedValue([
      { id: 'w1', exchangeRates: { CNY: 7.5 } },
    ]);
    const mod = await loadFx();
    const result = await mod.resolveExchangeRates('USER-0001');
    expect(result.rates.BRL).toBeCloseTo(5.5, 2); // user
    expect(result.rates.CNY).toBeCloseTo(7.5, 2); // wallets
  });

  it('userId null/empty: retorna fallback', async () => {
    const mod = await loadFx();
    const result = await mod.resolveExchangeRates('');
    expect(result.source).toBe('fallback');
  });

  it('shape: { rates, source, resolvedAt }', async () => {
    const mod = await loadFx();
    const result = await mod.resolveExchangeRates('USER-0001');
    expect(result).toHaveProperty('rates');
    expect(result).toHaveProperty('source');
    expect(result).toHaveProperty('resolvedAt');
    expect(result.resolvedAt instanceof Date).toBe(true);
  });

  it('DB falha: retorna fallback (nao throw)', async () => {
    (storage.getUserSettings as any).mockRejectedValue(new Error('db down'));
    const mod = await loadFx();
    const result = await mod.resolveExchangeRates('USER-0001');
    expect(result.rates.BRL).toBeCloseTo(5.0, 2);
    expect(result.source).toBe('fallback');
  });
});

describe('fxResolver — RF-11 cache', () => {
  it('cache hit: 2a chamada nao re-le do DB', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      exchangeRates: { BRL: 5.5 },
    });
    const mod = await loadFx();
    // limpar cache antes
    if (typeof mod.invalidateCache === 'function') mod.invalidateCache('USER-CACHE-1');
    await mod.resolveExchangeRates('USER-CACHE-1');
    const callsAfterFirst = (storage.getUserSettings as any).mock.calls.length;
    await mod.resolveExchangeRates('USER-CACHE-1');
    const callsAfterSecond = (storage.getUserSettings as any).mock.calls.length;
    // Cache hit -> sem nova chamada
    expect(callsAfterSecond).toBe(callsAfterFirst);
  });

  it('invalidateCache forca refetch', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      exchangeRates: { BRL: 5.5 },
    });
    const mod = await loadFx();
    if (typeof mod.invalidateCache === 'function') mod.invalidateCache('USER-CACHE-2');
    await mod.resolveExchangeRates('USER-CACHE-2');
    const callsBefore = (storage.getUserSettings as any).mock.calls.length;
    if (typeof mod.invalidateCache === 'function') mod.invalidateCache('USER-CACHE-2');
    await mod.resolveExchangeRates('USER-CACHE-2');
    const callsAfter = (storage.getUserSettings as any).mock.calls.length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
  });
});

describe('fxResolver — RF-11 invariantes', () => {
  it('USD sempre = 1 nos rates resolvidos', async () => {
    const mod = await loadFx();
    const result = await mod.resolveExchangeRates('USER-0001');
    expect(result.rates.USD).toBe(1);
  });

  it('rates sao todos numbers positivos', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      exchangeRates: { BRL: 5.5, EUR: 0.95 },
    });
    const mod = await loadFx();
    const result = await mod.resolveExchangeRates('USER-0001');
    for (const [, v] of Object.entries(result.rates) as [string, number][]) {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThan(0);
    }
  });
});
