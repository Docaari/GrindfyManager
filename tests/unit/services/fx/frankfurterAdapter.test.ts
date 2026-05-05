/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint FX-1 — RF-02: frankfurterAdapter
 *
 * Spec: Docs/specs/sprint-fx-1.md §RF-02
 * ADR : Docs/architecture/decisions/122-fx-multi-source-fallback-chain.md
 *
 * API esperada em server/services/fx/adapters/frankfurterAdapter.ts:
 *   fetchLatest(symbols: string[]): Promise<FxRow[]>
 *   fetchTimeseries(from: string, to: string, symbols: string[]): Promise<FxRow[]>
 *
 * `FxRow` shape (server/services/fx/adapters/types.ts):
 *   { currency: 'BRL' | 'EUR' | string,
 *     date: 'YYYY-MM-DD',
 *     ratePerUsd: number,
 *     source: 'bcb_ptax' | 'frankfurter' }
 *
 * Convencao QW-1 (ADR-033): rate per USD.
 *
 * Lessons aplicadas:
 *   #5  vi.fn nao constructor → mock fetch via vi.spyOn(global,'fetch')
 *   #14 vi.hoisted irrelevante (fetch eh global)
 *
 * Status RED: modulo nao existe ainda. Implementer cria server/services/fx/adapters/.
 *
 * Cenarios:
 *   1. fetchLatest happy path BRL+EUR → array com 2 rows shape valido + source='frankfurter'
 *   2. fetchLatest com 1 symbol → 1 row
 *   3. HTTP 5xx → throws FxFetchError com provider='frankfurter'
 *   4. Network error → throws
 *   5. Body invalido (sem rates) → throws
 *   6. User-Agent GrindfyFxBot/1.0 enviado
 *   7. URL contem base=USD&symbols=BRL,EUR
 *   8. fetchTimeseries 5d → array de FxRow agregando todos os daily rates
 *   9. fetchTimeseries omite weekends (gap no fixture sabado 2026-05-02 e domingo 2026-05-03)
 *  10. Timeout 30s respeitado (assert AbortSignal.timeout ou equivalente)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// =============================================================================
// Helpers
// =============================================================================
function loadFixture(name: string): any {
  return JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '../../../fixtures/fx', name),
      'utf8',
    ),
  );
}

function makeFetchResponse(opts: {
  ok: boolean;
  status?: number;
  body?: any;
}): any {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    statusText: opts.ok ? 'OK' : 'Internal Server Error',
    text: vi.fn(async () => JSON.stringify(opts.body ?? {})),
    json: vi.fn(async () => opts.body ?? {}),
    headers: new Map(),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function loadAdapter() {
  return await import('../../../../server/services/fx/adapters/frankfurterAdapter');
}

// =============================================================================
// fetchLatest
// =============================================================================
describe('frankfurterAdapter.fetchLatest — RF-02 happy path', () => {
  it('retorna array de FxRow com BRL+EUR e source=frankfurter', async () => {
    const fixture = loadFixture('frankfurter-latest-sample.json');
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: fixture }),
    );

    const mod = await loadAdapter();
    const rows = await mod.fetchLatest(['BRL', 'EUR']);

    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(2);

    const brl = rows.find((r: any) => r.currency === 'BRL');
    const eur = rows.find((r: any) => r.currency === 'EUR');
    expect(brl).toBeDefined();
    expect(eur).toBeDefined();
    expect(brl.ratePerUsd).toBeCloseTo(5.1234, 4);
    expect(eur.ratePerUsd).toBeCloseTo(0.9234, 4);
    expect(brl.source).toBe('frankfurter');
    expect(eur.source).toBe('frankfurter');
    expect(brl.date).toBe('2026-05-05');
    expect(eur.date).toBe('2026-05-05');
  });

  it('chamada com 1 symbol retorna 1 row', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({
        ok: true,
        body: { amount: 1, base: 'USD', date: '2026-05-05', rates: { BRL: 5.1234 } },
      }),
    );

    const mod = await loadAdapter();
    const rows = await mod.fetchLatest(['BRL']);
    expect(rows.length).toBe(1);
    expect(rows[0].currency).toBe('BRL');
  });

  it('inclui base=USD e symbols joined na URL', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({
        ok: true,
        body: { amount: 1, base: 'USD', date: '2026-05-05', rates: { BRL: 5.1234, EUR: 0.9234 } },
      }),
    );

    const mod = await loadAdapter();
    await mod.fetchLatest(['BRL', 'EUR']);

    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toMatch(/api\.frankfurter\.dev/);
    expect(url).toMatch(/base=USD/);
    // symbols pode estar como ?symbols=BRL,EUR ou similar
    expect(url).toMatch(/BRL/);
    expect(url).toMatch(/EUR/);
  });

  it('envia User-Agent GrindfyFxBot/1.0', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({
        ok: true,
        body: { amount: 1, base: 'USD', date: '2026-05-05', rates: { BRL: 5.1234 } },
      }),
    );

    const mod = await loadAdapter();
    await mod.fetchLatest(['BRL']);

    const init = fetchSpy.mock.calls[0][1] as any;
    expect(init).toBeDefined();
    const headers = init.headers ?? {};
    const ua = headers['User-Agent'] ?? headers['user-agent'] ?? headers.get?.('User-Agent');
    expect(String(ua)).toMatch(/GrindfyFxBot/);
  });
});

describe('frankfurterAdapter.fetchLatest — RF-02 error handling', () => {
  it('HTTP 5xx → lanca FxFetchError com provider=frankfurter', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: false, status: 503, body: { error: 'unavailable' } }),
    );

    const mod = await loadAdapter();
    await expect(mod.fetchLatest(['BRL', 'EUR'])).rejects.toMatchObject({
      provider: 'frankfurter',
    });
  });

  it('HTTP 4xx → lanca FxFetchError', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: false, status: 400, body: { error: 'bad request' } }),
    );

    const mod = await loadAdapter();
    await expect(mod.fetchLatest(['BRL'])).rejects.toThrow();
  });

  it('Network error (fetch reject) → lanca FxFetchError', async () => {
    vi.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('ETIMEDOUT'));

    const mod = await loadAdapter();
    await expect(mod.fetchLatest(['BRL'])).rejects.toThrow();
  });

  it('Body invalido (sem chave rates) → lanca FxFetchError', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: { amount: 1, base: 'USD', date: '2026-05-05' } }),
    );

    const mod = await loadAdapter();
    await expect(mod.fetchLatest(['BRL'])).rejects.toThrow();
  });

  it('Body com rates vazio → array vazio (nao throw)', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({
        ok: true,
        body: { amount: 1, base: 'USD', date: '2026-05-05', rates: {} },
      }),
    );

    const mod = await loadAdapter();
    const rows = await mod.fetchLatest(['BRL']);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(0);
  });
});

// =============================================================================
// fetchTimeseries
// =============================================================================
describe('frankfurterAdapter.fetchTimeseries — RF-02 happy path', () => {
  it('5 dias com gap weekend retorna apenas working days', async () => {
    const fixture = loadFixture('frankfurter-timeseries-sample.json');
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: fixture }),
    );

    const mod = await loadAdapter();
    const rows = await mod.fetchTimeseries('2026-05-01', '2026-05-05', ['BRL', 'EUR']);

    expect(Array.isArray(rows)).toBe(true);
    // Fixture tem apenas 3 datas (01, 04, 05) — sabado 02 e domingo 03 omitidos
    // 3 datas × 2 currencies = 6 rows
    expect(rows.length).toBe(6);

    const dates = Array.from(new Set(rows.map((r: any) => r.date))).sort();
    expect(dates).toEqual(['2026-05-01', '2026-05-04', '2026-05-05']);
    // Nenhuma row em 2026-05-02 (sabado) ou 2026-05-03 (domingo)
    expect(dates).not.toContain('2026-05-02');
    expect(dates).not.toContain('2026-05-03');
  });

  it('cada row tem source=frankfurter', async () => {
    const fixture = loadFixture('frankfurter-timeseries-sample.json');
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: fixture }),
    );

    const mod = await loadAdapter();
    const rows = await mod.fetchTimeseries('2026-05-01', '2026-05-05', ['BRL', 'EUR']);

    for (const r of rows) {
      expect(r.source).toBe('frankfurter');
      expect(typeof r.ratePerUsd).toBe('number');
      expect(r.ratePerUsd).toBeGreaterThan(0);
    }
  });

  it('URL inclui range from..to', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({
        ok: true,
        body: { amount: 1, base: 'USD', start_date: '2026-05-01', end_date: '2026-05-05', rates: {} },
      }),
    );

    const mod = await loadAdapter();
    await mod.fetchTimeseries('2026-05-01', '2026-05-05', ['BRL']);
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toMatch(/2026-05-01/);
    expect(url).toMatch(/2026-05-05/);
  });
});

describe('frankfurterAdapter.fetchTimeseries — RF-02 errors', () => {
  it('HTTP 5xx → lanca FxFetchError', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: false, status: 503, body: { error: 'down' } }),
    );

    const mod = await loadAdapter();
    await expect(
      mod.fetchTimeseries('2026-05-01', '2026-05-05', ['BRL']),
    ).rejects.toThrow();
  });

  it('Body sem rates → throws', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({
        ok: true,
        body: { amount: 1, base: 'USD' },
      }),
    );

    const mod = await loadAdapter();
    await expect(
      mod.fetchTimeseries('2026-05-01', '2026-05-05', ['BRL']),
    ).rejects.toThrow();
  });
});
