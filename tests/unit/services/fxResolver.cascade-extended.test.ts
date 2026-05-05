/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint FX-1 — RF-05: fxResolver cascata estendida com camada `system`
 *
 * Spec: Docs/specs/sprint-fx-1.md §RF-05
 * ADR : Docs/architecture/decisions/121-system-fx-rates-global-table.md
 *
 * Esta cascata estende ADR-061. Nova ordem:
 *   1. users.exchangeRates (override per-user) — se existe e tem currency
 *   2. system_fx_rates (latest) — NOVO (via fxRatesPersistence.getLatestSystemRates)
 *   3. wallets.exchangeRates (compat ADR-034) — para currencies que system nao tem
 *   4. FALLBACK_FX_RATES constants
 *
 * source field extendido: 'user' | 'system' | 'wallets' | 'fallback' | 'mixed'
 *
 * FALLBACK_FX_RATES reduzido:
 *   { USD: 1, BRL: 5.0, EUR: 0.93 }  (sem CNY/GBP/USDT/BTC)
 *
 * Status RED: extensao do server/services/fxResolver.ts (modulo existe mas
 * sem camada system). Implementer adiciona getLatestSystemRates lookup.
 *
 * Mocks:
 *   - storage.getUserSettings, storage.listWalletsByUser
 *   - fxRatesPersistence.getLatestSystemRates
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================
vi.mock('../../../server/storage', () => ({
  storage: {
    getUserSettings: vi.fn(),
    listWalletsByUser: vi.fn(),
  },
}));

const { getLatestSystemRatesMock } = vi.hoisted(() => ({
  getLatestSystemRatesMock: vi.fn(),
}));

vi.mock('../../../server/services/fx/fxRatesPersistence', () => ({
  getLatestSystemRates: getLatestSystemRatesMock,
  fxRatesPersistence: { getLatestSystemRates: getLatestSystemRatesMock },
}));

import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getUserSettings as any).mockResolvedValue({});
  (storage.listWalletsByUser as any).mockResolvedValue([]);
  getLatestSystemRatesMock.mockResolvedValue({});
});

async function loadFx() {
  const mod: any = await import('../../../server/services/fxResolver');
  if (typeof mod._resetCacheForTests === 'function') mod._resetCacheForTests();
  return mod;
}

// =============================================================================
// FALLBACK_FX_RATES reduzido
// =============================================================================
describe('fxResolver.FALLBACK_FX_RATES — RF-05 reduzido', () => {
  it('apos FX-1 contem apenas USD, BRL, EUR (sem CNY/GBP/USDT/BTC)', async () => {
    const mod = await loadFx();
    expect(mod.FALLBACK_FX_RATES.USD).toBe(1);
    expect(mod.FALLBACK_FX_RATES.BRL).toBeCloseTo(5.0, 2);
    expect(mod.FALLBACK_FX_RATES.EUR).toBeCloseTo(0.93, 2);
    // Removidos
    expect(mod.FALLBACK_FX_RATES.CNY).toBeUndefined();
    expect(mod.FALLBACK_FX_RATES.GBP).toBeUndefined();
    expect(mod.FALLBACK_FX_RATES.USDT).toBeUndefined();
    expect(mod.FALLBACK_FX_RATES.BTC).toBeUndefined();
  });
});

// =============================================================================
// Cascata: system layer
// =============================================================================
describe('fxResolver — RF-05 cascata system', () => {
  it('user vazio + system populated → source=system, rates=system', async () => {
    (storage.getUserSettings as any).mockResolvedValue({});
    getLatestSystemRatesMock.mockResolvedValue({
      BRL: { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.1234, source: 'bcb_ptax', fetchedAt: new Date() },
      EUR: { currency: 'EUR', date: '2026-05-05', ratePerUsd: 0.9234, source: 'frankfurter', fetchedAt: new Date() },
    });

    const mod = await loadFx();
    const result = await mod.resolveExchangeRates('USER-0001');

    expect(result.source).toBe('system');
    expect(result.rates.BRL).toBeCloseTo(5.1234, 4);
    expect(result.rates.EUR).toBeCloseTo(0.9234, 4);
    expect(result.rates.USD).toBe(1);
  });

  it('user override BRL=5.5 + system BRL=5.0 → BRL=5.5 (user precede system)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      exchangeRates: { BRL: 5.5 },
    });
    getLatestSystemRatesMock.mockResolvedValue({
      BRL: { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.0, source: 'bcb_ptax', fetchedAt: new Date() },
      EUR: { currency: 'EUR', date: '2026-05-05', ratePerUsd: 0.93, source: 'frankfurter', fetchedAt: new Date() },
    });

    const mod = await loadFx();
    const result = await mod.resolveExchangeRates('USER-0001');

    expect(result.rates.BRL).toBeCloseTo(5.5, 2);
    expect(result.rates.EUR).toBeCloseTo(0.93, 2);
    // source: user OR mixed (depende contrato implementer; valida que NAO eh 'system')
    expect(['user', 'mixed']).toContain(result.source);
  });

  it('user vazio + system vazio + wallet com BRL=4.9 → source=wallets', async () => {
    (storage.getUserSettings as any).mockResolvedValue({});
    getLatestSystemRatesMock.mockResolvedValue({});
    (storage.listWalletsByUser as any).mockResolvedValue([
      { id: 'w1', exchangeRates: { BRL: 4.9 } },
    ]);

    const mod = await loadFx();
    const result = await mod.resolveExchangeRates('USER-0001');

    expect(result.source).toBe('wallets');
    expect(result.rates.BRL).toBeCloseTo(4.9, 2);
  });

  it('user vazio + system vazio + wallet vazia → source=fallback (BRL=5.0 EUR=0.93)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({});
    getLatestSystemRatesMock.mockResolvedValue({});
    (storage.listWalletsByUser as any).mockResolvedValue([]);

    const mod = await loadFx();
    const result = await mod.resolveExchangeRates('USER-0001');

    expect(result.source).toBe('fallback');
    expect(result.rates.BRL).toBeCloseTo(5.0, 2);
    expect(result.rates.EUR).toBeCloseTo(0.93, 2);
  });

  it('wallet legada CNY=7.2 + system BRL/EUR → CNY preservado, source primario=system', async () => {
    (storage.getUserSettings as any).mockResolvedValue({});
    getLatestSystemRatesMock.mockResolvedValue({
      BRL: { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.1234, source: 'bcb_ptax', fetchedAt: new Date() },
      EUR: { currency: 'EUR', date: '2026-05-05', ratePerUsd: 0.9234, source: 'frankfurter', fetchedAt: new Date() },
    });
    (storage.listWalletsByUser as any).mockResolvedValue([
      { id: 'w1', exchangeRates: { CNY: 7.2 } },
    ]);

    const mod = await loadFx();
    const result = await mod.resolveExchangeRates('USER-0001');

    expect(result.rates.BRL).toBeCloseTo(5.1234, 4); // system
    expect(result.rates.CNY).toBeCloseTo(7.2, 2); // wallet compat
    expect(result.source).toBe('system'); // BRL/EUR sao primary
  });

  it('user override parcial (so EUR) + system BRL+EUR → EUR=user, BRL=system', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      exchangeRates: { EUR: 0.95 },
    });
    getLatestSystemRatesMock.mockResolvedValue({
      BRL: { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.1234, source: 'bcb_ptax', fetchedAt: new Date() },
      EUR: { currency: 'EUR', date: '2026-05-05', ratePerUsd: 0.9234, source: 'frankfurter', fetchedAt: new Date() },
    });

    const mod = await loadFx();
    const result = await mod.resolveExchangeRates('USER-0001');

    expect(result.rates.EUR).toBeCloseTo(0.95, 2); // user
    expect(result.rates.BRL).toBeCloseTo(5.1234, 4); // system
    // source pode ser 'user' (porque tem override) ou 'mixed' — definir em contrato
    expect(['user', 'mixed']).toContain(result.source);
  });
});

// =============================================================================
// Cache extendido
// =============================================================================
describe('fxResolver — RF-05 cache 5min', () => {
  it('cache mantido apos extensao (2a chamada nao re-fetch system)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({});
    getLatestSystemRatesMock.mockResolvedValue({
      BRL: { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.12, source: 'bcb_ptax', fetchedAt: new Date() },
    });

    const mod = await loadFx();
    await mod.resolveExchangeRates('USER-CACHE-A');
    await mod.resolveExchangeRates('USER-CACHE-A');

    // System rates fetched 1x (cache user-level hit)
    expect(getLatestSystemRatesMock.mock.calls.length).toBe(1);
  });

  it('invalidateCache(userId) força re-fetch do user e do system', async () => {
    (storage.getUserSettings as any).mockResolvedValue({});
    getLatestSystemRatesMock.mockResolvedValue({
      BRL: { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.12, source: 'bcb_ptax', fetchedAt: new Date() },
    });

    const mod = await loadFx();
    await mod.resolveExchangeRates('USER-CACHE-B');
    mod.invalidateCache('USER-CACHE-B');
    await mod.resolveExchangeRates('USER-CACHE-B');

    expect(getLatestSystemRatesMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('invalidateCache() sem userId zera cache global', async () => {
    (storage.getUserSettings as any).mockResolvedValue({});
    getLatestSystemRatesMock.mockResolvedValue({});

    const mod = await loadFx();
    await mod.resolveExchangeRates('USER-A');
    await mod.resolveExchangeRates('USER-B');

    mod.invalidateCache();

    await mod.resolveExchangeRates('USER-A');
    await mod.resolveExchangeRates('USER-B');

    // Apos invalidate global, ambos refazem queries
    expect(getLatestSystemRatesMock.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});

// =============================================================================
// convertBetween com system rates
// =============================================================================
describe('fxResolver — RF-05 convertBetween com system rates', () => {
  it('100 BRL → ~18.6 EUR usando system rates 5.0/0.93', async () => {
    const mod = await loadFx();
    const r = mod.convertBetween(100, 'BRL', 'EUR', { BRL: 5.0, EUR: 0.93 });
    expect(r).toBeCloseTo(18.6, 1);
  });
});
