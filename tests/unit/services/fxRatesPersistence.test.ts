/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint FX-1 — RF-03: fxRatesPersistence
 *
 * Spec: Docs/specs/sprint-fx-1.md §RF-03
 * ADR : Docs/architecture/decisions/121-system-fx-rates-global-table.md
 *
 * API esperada em server/services/fx/fxRatesPersistence.ts:
 *   upsertDailyRates(date, rows[]): Promise<{ inserted, skipped }>
 *   getLatestSystemRates(): Promise<Record<string, SystemRate>>
 *   getRatesForDate(date): Promise<Record<string, SystemRate>>
 *   getRateHistory(currency, days, offset?): Promise<SystemRate[]>
 *   invalidateLatestCache(): void
 *   _resetCacheForTests(): void
 *
 * Storage queries devem ser delegados a `storage._systemFxRates_*` helpers.
 * Tests usam vi.mock no storage para isolar.
 *
 * Status RED: modulo nao existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock storage
// =============================================================================
vi.mock('../../../server/storage', () => ({
  storage: {
    insertSystemFxRates: vi.fn(),
    getSystemFxRatesLatest: vi.fn(),
    getSystemFxRatesForDate: vi.fn(),
    getSystemFxRatesHistory: vi.fn(),
  },
}));

import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

async function loadPersistence() {
  const mod = await import('../../../server/services/fx/fxRatesPersistence');
  // Reset cache antes de cada teste
  if (typeof (mod as any)._resetCacheForTests === 'function') {
    (mod as any)._resetCacheForTests();
  }
  return mod;
}

// =============================================================================
// upsertDailyRates
// =============================================================================
describe('fxRatesPersistence.upsertDailyRates — RF-03', () => {
  it('insere rows novas retorna { inserted, skipped }', async () => {
    (storage.insertSystemFxRates as any).mockResolvedValue({ inserted: 2, skipped: 0 });

    const mod = await loadPersistence();
    const result = await mod.upsertDailyRates('2026-05-05', [
      { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.1234, source: 'bcb_ptax' },
      { currency: 'EUR', date: '2026-05-05', ratePerUsd: 0.9234, source: 'frankfurter' },
    ]);

    expect(result.inserted).toBe(2);
    expect(result.skipped).toBe(0);
    expect(storage.insertSystemFxRates).toHaveBeenCalledOnce();
  });

  it('re-upsert mesma (date, currency) → ON CONFLICT DO NOTHING (skipped)', async () => {
    (storage.insertSystemFxRates as any).mockResolvedValue({ inserted: 0, skipped: 2 });

    const mod = await loadPersistence();
    const result = await mod.upsertDailyRates('2026-05-05', [
      { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.1234, source: 'bcb_ptax' },
      { currency: 'EUR', date: '2026-05-05', ratePerUsd: 0.9234, source: 'frankfurter' },
    ]);

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it('rows vazias retorna { inserted: 0, skipped: 0 } (sem chamar DB)', async () => {
    const mod = await loadPersistence();
    const result = await mod.upsertDailyRates('2026-05-05', []);
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('rows USD sao filtradas antes de inserir (USD nao eh inserido na tabela)', async () => {
    (storage.insertSystemFxRates as any).mockResolvedValue({ inserted: 1, skipped: 0 });

    const mod = await loadPersistence();
    await mod.upsertDailyRates('2026-05-05', [
      { currency: 'USD', date: '2026-05-05', ratePerUsd: 1, source: 'manual' },
      { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.1234, source: 'bcb_ptax' },
    ]);

    const insertedRows = (storage.insertSystemFxRates as any).mock.calls[0][0];
    const usdRow = insertedRows.find((r: any) => r.currency === 'USD');
    expect(usdRow).toBeUndefined();
  });
});

// =============================================================================
// getLatestSystemRates
// =============================================================================
describe('fxRatesPersistence.getLatestSystemRates — RF-03', () => {
  it('retorna map { BRL, EUR } com SystemRate por currency', async () => {
    (storage.getSystemFxRatesLatest as any).mockResolvedValue([
      { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.1234, source: 'bcb_ptax', fetchedAt: new Date('2026-05-05T17:00:00Z') },
      { currency: 'EUR', date: '2026-05-05', ratePerUsd: 0.9234, source: 'frankfurter', fetchedAt: new Date('2026-05-05T17:00:00Z') },
    ]);

    const mod = await loadPersistence();
    const result = await mod.getLatestSystemRates();

    expect(result.BRL).toBeDefined();
    expect(result.EUR).toBeDefined();
    expect(result.BRL.ratePerUsd).toBeCloseTo(5.1234, 4);
    expect(result.EUR.ratePerUsd).toBeCloseTo(0.9234, 4);
    expect(result.BRL.source).toBe('bcb_ptax');
    expect(result.EUR.source).toBe('frankfurter');
  });

  it('cache 5min: 2 calls em sequencia = 1 query no storage', async () => {
    (storage.getSystemFxRatesLatest as any).mockResolvedValue([
      { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.1234, source: 'bcb_ptax', fetchedAt: new Date() },
    ]);

    const mod = await loadPersistence();
    await mod.getLatestSystemRates();
    await mod.getLatestSystemRates();
    await mod.getLatestSystemRates();

    expect((storage.getSystemFxRatesLatest as any).mock.calls.length).toBe(1);
  });

  it('invalidateLatestCache() força re-query', async () => {
    (storage.getSystemFxRatesLatest as any).mockResolvedValue([
      { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.1234, source: 'bcb_ptax', fetchedAt: new Date() },
    ]);

    const mod = await loadPersistence();
    await mod.getLatestSystemRates();
    mod.invalidateLatestCache();
    await mod.getLatestSystemRates();

    expect((storage.getSystemFxRatesLatest as any).mock.calls.length).toBe(2);
  });

  it('DB vazia retorna {} (sem rates)', async () => {
    (storage.getSystemFxRatesLatest as any).mockResolvedValue([]);

    const mod = await loadPersistence();
    const result = await mod.getLatestSystemRates();
    expect(result).toEqual({});
  });

  it('_resetCacheForTests zera Map sem tocar DB', async () => {
    (storage.getSystemFxRatesLatest as any).mockResolvedValue([]);

    const mod = await loadPersistence();
    await mod.getLatestSystemRates();
    const callsBefore = (storage.getSystemFxRatesLatest as any).mock.calls.length;

    (mod as any)._resetCacheForTests();
    // Reset NAO deve invocar storage
    expect((storage.getSystemFxRatesLatest as any).mock.calls.length).toBe(callsBefore);

    // Proxima call refaz query
    await mod.getLatestSystemRates();
    expect((storage.getSystemFxRatesLatest as any).mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

// =============================================================================
// getRatesForDate
// =============================================================================
describe('fxRatesPersistence.getRatesForDate — RF-03', () => {
  it('data com rate retorna map daquela data', async () => {
    (storage.getSystemFxRatesForDate as any).mockResolvedValue([
      { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.1234, source: 'bcb_ptax', fetchedAt: new Date() },
      { currency: 'EUR', date: '2026-05-05', ratePerUsd: 0.9234, source: 'frankfurter', fetchedAt: new Date() },
    ]);

    const mod = await loadPersistence();
    const result = await mod.getRatesForDate('2026-05-05');

    expect(result.BRL.ratePerUsd).toBeCloseTo(5.1234, 4);
    expect(result.EUR.ratePerUsd).toBeCloseTo(0.9234, 4);
    expect(storage.getSystemFxRatesForDate).toHaveBeenCalledWith('2026-05-05');
  });

  it('domingo (sem rate) → fallback descending: retorna sexta-feira', async () => {
    // Storage helper deve fazer LATERAL `WHERE date <= ? ORDER BY date DESC LIMIT 1`
    (storage.getSystemFxRatesForDate as any).mockResolvedValue([
      { currency: 'BRL', date: '2026-05-01', ratePerUsd: 5.1100, source: 'bcb_ptax', fetchedAt: new Date() },
      { currency: 'EUR', date: '2026-05-01', ratePerUsd: 0.9220, source: 'frankfurter', fetchedAt: new Date() },
    ]);

    const mod = await loadPersistence();
    const result = await mod.getRatesForDate('2026-05-03'); // domingo

    expect(result.BRL.date).toBe('2026-05-01');
    expect(result.BRL.ratePerUsd).toBeCloseTo(5.1100, 4);
  });

  it('data sem rate E sem dias anteriores → retorna {} (caller faz fallback)', async () => {
    (storage.getSystemFxRatesForDate as any).mockResolvedValue([]);

    const mod = await loadPersistence();
    const result = await mod.getRatesForDate('2026-01-01');
    expect(result).toEqual({});
  });
});

// =============================================================================
// getRateHistory
// =============================================================================
describe('fxRatesPersistence.getRateHistory — RF-03', () => {
  it('currency BRL days 30 retorna ate 30 rows ordenadas date DESC', async () => {
    const mockRows = Array.from({ length: 30 }, (_, i) => ({
      currency: 'BRL',
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      ratePerUsd: 5 + i * 0.001,
      source: 'bcb_ptax',
      fetchedAt: new Date(),
    }));

    (storage.getSystemFxRatesHistory as any).mockResolvedValue(mockRows);

    const mod = await loadPersistence();
    const rows = await mod.getRateHistory('BRL', 30);

    expect(rows.length).toBe(30);
    expect(storage.getSystemFxRatesHistory).toHaveBeenCalledWith('BRL', 30, 0);
  });

  it('aceita offset para paginacao', async () => {
    (storage.getSystemFxRatesHistory as any).mockResolvedValue([]);

    const mod = await loadPersistence();
    await mod.getRateHistory('BRL', 30, 60);
    expect(storage.getSystemFxRatesHistory).toHaveBeenCalledWith('BRL', 30, 60);
  });
});
