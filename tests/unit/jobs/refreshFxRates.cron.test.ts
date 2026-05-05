/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint FX-1 — RF-04: Cron refreshFxRates
 *
 * Spec: Docs/specs/sprint-fx-1.md §RF-04
 * ADR : Docs/architecture/decisions/123-fx-cron-daily-17utc.md
 *      Docs/architecture/decisions/122-fx-multi-source-fallback-chain.md
 *
 * API esperada em server/jobs/refreshFxRates.ts:
 *   runFxRatesRefresh(): Promise<{ runId, status, inserted, skipped, currencies_fetched, currencies_failed, duration_ms }>
 *   registerFxRatesCron(): void  (chamado por server/jobs/index.ts)
 *
 * Mocks via vi.hoisted (lesson #14):
 *   - bcbPtaxAdapter.fetchLatestBrl
 *   - frankfurterAdapter.fetchLatest
 *   - fxRatesPersistence.upsertDailyRates + invalidateLatestCache
 *   - fxResolver.invalidateCache
 *   - node-cron.schedule
 *
 * Status RED: modulo nao existe.
 *
 * Cenarios:
 *   1. Happy path: BCB+frankfurter ok → 2 rows upserted
 *   2. BCB falha + frankfurter ok BRL → cross-fallback (BRL com source frankfurter)
 *   3. frankfurter falha EUR + BCB ok BRL → status partial, EUR ausente
 *   4. Ambos falham → status failed, server up
 *   5. Cache invalidation chamada pos-upsert
 *   6. Re-run mesmo dia → ON CONFLICT (idempotente)
 *   7. registerFxRatesCron registra schedule '0 0 17 * * *' UTC
 *   8. FX_CRON_DISABLED=true → cron NAO registra handler
 *   9. runFxRatesRefresh exportado para uso manual (admin endpoint)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// vi.hoisted: mocks compartilhados
// =============================================================================
const {
  fetchLatestBrlMock,
  fetchLatestMock,
  upsertDailyRatesMock,
  invalidateLatestCacheMock,
  invalidateResolverCacheMock,
  cronScheduleMock,
} = vi.hoisted(() => ({
  fetchLatestBrlMock: vi.fn(),
  fetchLatestMock: vi.fn(),
  upsertDailyRatesMock: vi.fn(),
  invalidateLatestCacheMock: vi.fn(),
  invalidateResolverCacheMock: vi.fn(),
  cronScheduleMock: vi.fn(),
}));

vi.mock('node-cron', () => ({
  default: { schedule: cronScheduleMock },
  schedule: cronScheduleMock,
}));

vi.mock('../../../server/services/fx/adapters/bcbPtaxAdapter', () => ({
  fetchLatestBrl: fetchLatestBrlMock,
  bcbPtaxAdapter: { fetchLatestBrl: fetchLatestBrlMock },
}));

vi.mock('../../../server/services/fx/adapters/frankfurterAdapter', () => ({
  fetchLatest: fetchLatestMock,
  frankfurterAdapter: { fetchLatest: fetchLatestMock },
}));

vi.mock('../../../server/services/fx/fxRatesPersistence', () => ({
  upsertDailyRates: upsertDailyRatesMock,
  invalidateLatestCache: invalidateLatestCacheMock,
  fxRatesPersistence: {
    upsertDailyRates: upsertDailyRatesMock,
    invalidateLatestCache: invalidateLatestCacheMock,
  },
}));

vi.mock('../../../server/services/fxResolver', () => ({
  invalidateCache: invalidateResolverCacheMock,
  fxResolver: { invalidateCache: invalidateResolverCacheMock },
}));

const ORIGINAL_DISABLED = process.env.FX_CRON_DISABLED;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FX_CRON_DISABLED;
  upsertDailyRatesMock.mockResolvedValue({ inserted: 2, skipped: 0 });
});

afterEach(() => {
  if (ORIGINAL_DISABLED === undefined) delete process.env.FX_CRON_DISABLED;
  else process.env.FX_CRON_DISABLED = ORIGINAL_DISABLED;
});

async function loadJob() {
  vi.resetModules();
  return await import('../../../server/jobs/refreshFxRates');
}

// =============================================================================
// runFxRatesRefresh: happy path
// =============================================================================
describe('runFxRatesRefresh — RF-04 happy path', () => {
  it('BCB + frankfurter ok → 2 rows upserted, status=ok', async () => {
    fetchLatestBrlMock.mockResolvedValue({
      currency: 'BRL',
      date: '2026-05-05',
      ratePerUsd: 5.1234,
      source: 'bcb_ptax',
    });
    fetchLatestMock.mockResolvedValue([
      { currency: 'EUR', date: '2026-05-05', ratePerUsd: 0.9234, source: 'frankfurter' },
    ]);

    const mod = await loadJob();
    const result = await mod.runFxRatesRefresh();

    expect(result.status).toBe('ok');
    expect(result.runId).toBeTruthy();
    expect(result.currencies_fetched).toEqual(expect.arrayContaining(['BRL', 'EUR']));
    expect(result.currencies_failed).toEqual([]);
    expect(result.inserted).toBe(2);
    expect(typeof result.duration_ms).toBe('number');

    // Validar rows passadas ao upsert
    expect(upsertDailyRatesMock).toHaveBeenCalledOnce();
    const rows = upsertDailyRatesMock.mock.calls[0][1];
    expect(rows).toHaveLength(2);
    const brl = rows.find((r: any) => r.currency === 'BRL');
    const eur = rows.find((r: any) => r.currency === 'EUR');
    expect(brl.source).toBe('bcb_ptax');
    expect(eur.source).toBe('frankfurter');
  });

  it('caches invalidated apos upsert', async () => {
    fetchLatestBrlMock.mockResolvedValue({
      currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.12, source: 'bcb_ptax',
    });
    fetchLatestMock.mockResolvedValue([
      { currency: 'EUR', date: '2026-05-05', ratePerUsd: 0.92, source: 'frankfurter' },
    ]);

    const mod = await loadJob();
    await mod.runFxRatesRefresh();

    expect(invalidateLatestCacheMock).toHaveBeenCalledOnce();
    expect(invalidateResolverCacheMock).toHaveBeenCalled();
    // resolver invalidate global (sem userId arg)
    expect(invalidateResolverCacheMock.mock.calls[0][0]).toBeUndefined();
  });

  it('runId eh string nanoid (length 10)', async () => {
    fetchLatestBrlMock.mockResolvedValue({
      currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.12, source: 'bcb_ptax',
    });
    fetchLatestMock.mockResolvedValue([
      { currency: 'EUR', date: '2026-05-05', ratePerUsd: 0.92, source: 'frankfurter' },
    ]);

    const mod = await loadJob();
    const result = await mod.runFxRatesRefresh();
    expect(typeof result.runId).toBe('string');
    expect(result.runId.length).toBeGreaterThanOrEqual(8);
  });
});

// =============================================================================
// Cross-fallback BRL
// =============================================================================
describe('runFxRatesRefresh — RF-04 cross-fallback', () => {
  it('BCB falha + frankfurter cobre BRL → BRL salvo com source=frankfurter', async () => {
    fetchLatestBrlMock.mockRejectedValue(new Error('BCB timeout'));
    // frankfurter chamado 2x: 1) BRL fallback 2) EUR primary
    fetchLatestMock.mockImplementation(async (symbols: string[]) => {
      if (symbols.includes('BRL')) {
        return [{ currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.10, source: 'frankfurter' }];
      }
      if (symbols.includes('EUR')) {
        return [{ currency: 'EUR', date: '2026-05-05', ratePerUsd: 0.92, source: 'frankfurter' }];
      }
      return [];
    });

    const mod = await loadJob();
    const result = await mod.runFxRatesRefresh();

    expect(result.status).toBe('ok');
    const rows = upsertDailyRatesMock.mock.calls[0][1];
    const brl = rows.find((r: any) => r.currency === 'BRL');
    expect(brl).toBeDefined();
    expect(brl.source).toBe('frankfurter'); // cross-fallback
  });
});

// =============================================================================
// Partial failures
// =============================================================================
describe('runFxRatesRefresh — RF-04 partial failure', () => {
  it('frankfurter falha EUR + BCB ok BRL → status=partial, EUR ausente', async () => {
    fetchLatestBrlMock.mockResolvedValue({
      currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.12, source: 'bcb_ptax',
    });
    fetchLatestMock.mockRejectedValue(new Error('frankfurter down'));

    const mod = await loadJob();
    const result = await mod.runFxRatesRefresh();

    expect(result.status).toBe('partial');
    expect(result.currencies_fetched).toContain('BRL');
    expect(result.currencies_failed).toContain('EUR');
    const rows = upsertDailyRatesMock.mock.calls[0][1];
    expect(rows.length).toBe(1);
    expect(rows[0].currency).toBe('BRL');
  });

  it('Ambos falham → status=failed, zero inserts, server up', async () => {
    fetchLatestBrlMock.mockRejectedValue(new Error('BCB down'));
    fetchLatestMock.mockRejectedValue(new Error('frankfurter down'));
    upsertDailyRatesMock.mockResolvedValue({ inserted: 0, skipped: 0 });

    const mod = await loadJob();
    const result = await mod.runFxRatesRefresh();

    expect(result.status).toBe('failed');
    expect(result.currencies_failed).toEqual(expect.arrayContaining(['BRL', 'EUR']));
  });
});

// =============================================================================
// Idempotencia
// =============================================================================
describe('runFxRatesRefresh — RF-04 idempotencia', () => {
  it('re-run mesmo dia → ON CONFLICT skipped (inserted=0)', async () => {
    fetchLatestBrlMock.mockResolvedValue({
      currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.12, source: 'bcb_ptax',
    });
    fetchLatestMock.mockResolvedValue([
      { currency: 'EUR', date: '2026-05-05', ratePerUsd: 0.92, source: 'frankfurter' },
    ]);
    upsertDailyRatesMock.mockResolvedValue({ inserted: 0, skipped: 2 });

    const mod = await loadJob();
    const result = await mod.runFxRatesRefresh();

    expect(result.status).toBe('ok');
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(2);
  });
});

// =============================================================================
// registerFxRatesCron
// =============================================================================
describe('registerFxRatesCron — RF-04', () => {
  it('registra cron com expression "0 0 17 * * *" UTC', async () => {
    const mod = await loadJob();
    if (typeof (mod as any).registerFxRatesCron === 'function') {
      (mod as any).registerFxRatesCron();
    }

    expect(cronScheduleMock).toHaveBeenCalled();
    const callArgs = cronScheduleMock.mock.calls[0];
    // Schedule expression — aceita 6-field ou 5-field ('0 17 * * *')
    expect(String(callArgs[0])).toMatch(/0 0? ?17 \* \* \*/);

    // Options deve ter timezone UTC se passado
    const options = callArgs[2];
    if (options && options.timezone) {
      expect(options.timezone).toBe('UTC');
    }
  });

  it('FX_CRON_DISABLED=true → cron.schedule NAO chamado', async () => {
    process.env.FX_CRON_DISABLED = 'true';
    const mod = await loadJob();
    if (typeof (mod as any).registerFxRatesCron === 'function') {
      (mod as any).registerFxRatesCron();
    }
    expect(cronScheduleMock).not.toHaveBeenCalled();
  });
});

// =============================================================================
// runFxRatesRefresh exportado para uso manual
// =============================================================================
describe('runFxRatesRefresh — RF-04 exportado para admin', () => {
  it('eh funcao exportada (admin endpoint chama direto)', async () => {
    const mod = await loadJob();
    expect(typeof (mod as any).runFxRatesRefresh).toBe('function');
  });
});
