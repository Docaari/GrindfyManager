/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint FX-1 — RF-02: bcbPtaxAdapter
 *
 * Spec: Docs/specs/sprint-fx-1.md §RF-02
 * ADR : Docs/architecture/decisions/122-fx-multi-source-fallback-chain.md
 *
 * API esperada em server/services/fx/adapters/bcbPtaxAdapter.ts:
 *   fetchLatestBrl(): Promise<FxRow>
 *   fetchTimeseriesBrl(from: string, to: string): Promise<FxRow[]>
 *
 * Fixture: tests/fixtures/fx/bcb-ptax-sample.json
 *   {
 *     "value": [
 *       { "cotacaoCompra": 5.1198, "cotacaoVenda": 5.1234,
 *         "dataHoraCotacao": "2026-05-05 13:00:00.000",
 *         "tipoBoletim": "Fechamento" }
 *     ]
 *   }
 *
 * Regras de negocio:
 *   - Usa cotacaoVenda (rate de venda) — confirmado pm-spec
 *   - Weekend (value: []) → throws com codigo WEEKEND_NO_QUOTE
 *   - Network/5xx → throws FxFetchError com provider='bcb_ptax'
 *
 * Status RED: modulo nao existe.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

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
  return await import('../../../../server/services/fx/adapters/bcbPtaxAdapter');
}

// =============================================================================
// fetchLatestBrl
// =============================================================================
describe('bcbPtaxAdapter.fetchLatestBrl — RF-02 happy path', () => {
  it('parse OData response retorna FxRow BRL com source=bcb_ptax', async () => {
    const fixture = loadFixture('bcb-ptax-sample.json');
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: fixture }),
    );

    const mod = await loadAdapter();
    const row = await mod.fetchLatestBrl();

    expect(row).toBeDefined();
    expect(row.currency).toBe('BRL');
    expect(row.source).toBe('bcb_ptax');
    // ratePerUsd usa cotacaoVenda = 5.1234 (NAO compra 5.1198)
    expect(row.ratePerUsd).toBeCloseTo(5.1234, 4);
    expect(row.date).toBe('2026-05-05');
  });

  it('usa cotacaoVenda (mais conservador) e nao cotacaoCompra', async () => {
    const fixture = {
      value: [
        {
          cotacaoCompra: 4.9000,
          cotacaoVenda: 5.5000,
          dataHoraCotacao: '2026-05-05 13:00:00.000',
          tipoBoletim: 'Fechamento',
        },
      ],
    };
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: fixture }),
    );

    const mod = await loadAdapter();
    const row = await mod.fetchLatestBrl();
    // Deve pegar venda (5.5), nao compra (4.9)
    expect(row.ratePerUsd).toBeCloseTo(5.5, 2);
  });

  it('envia User-Agent GrindfyFxBot/1.0', async () => {
    const fixture = loadFixture('bcb-ptax-sample.json');
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: fixture }),
    );

    const mod = await loadAdapter();
    await mod.fetchLatestBrl();

    const init = fetchSpy.mock.calls[0][1] as any;
    expect(init).toBeDefined();
    const headers = init.headers ?? {};
    const ua = headers['User-Agent'] ?? headers['user-agent'] ?? headers.get?.('User-Agent');
    expect(String(ua)).toMatch(/GrindfyFxBot/);
  });

  it('URL chama olinda.bcb.gov.br PTAX OData', async () => {
    const fixture = loadFixture('bcb-ptax-sample.json');
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: fixture }),
    );

    const mod = await loadAdapter();
    await mod.fetchLatestBrl();
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toMatch(/olinda\.bcb\.gov\.br/);
    expect(url).toMatch(/PTAX/i);
  });
});

describe('bcbPtaxAdapter.fetchLatestBrl — RF-02 weekend e errors', () => {
  it('weekend (value vazio) → throws com codigo WEEKEND_NO_QUOTE', async () => {
    const fixture = loadFixture('bcb-ptax-weekend-empty.json');
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: fixture }),
    );

    const mod = await loadAdapter();
    await expect(mod.fetchLatestBrl()).rejects.toMatchObject({
      code: 'WEEKEND_NO_QUOTE',
    });
  });

  it('HTTP 5xx → throws FxFetchError com provider=bcb_ptax', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: false, status: 503, body: { error: 'unavailable' } }),
    );

    const mod = await loadAdapter();
    await expect(mod.fetchLatestBrl()).rejects.toMatchObject({
      provider: 'bcb_ptax',
    });
  });

  it('Network error → throws', async () => {
    vi.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('ECONNRESET'));

    const mod = await loadAdapter();
    await expect(mod.fetchLatestBrl()).rejects.toThrow();
  });

  it('Body shape invalido (sem value) → throws', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: { foo: 'bar' } }),
    );

    const mod = await loadAdapter();
    await expect(mod.fetchLatestBrl()).rejects.toThrow();
  });

  it('cotacaoVenda nao numerico → throws', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({
        ok: true,
        body: {
          value: [
            { cotacaoCompra: 5.1, cotacaoVenda: 'NaN', dataHoraCotacao: '2026-05-05 13:00:00.000' },
          ],
        },
      }),
    );

    const mod = await loadAdapter();
    await expect(mod.fetchLatestBrl()).rejects.toThrow();
  });
});

// =============================================================================
// fetchTimeseriesBrl
// =============================================================================
describe('bcbPtaxAdapter.fetchTimeseriesBrl — RF-02', () => {
  it('range 2 dias retorna 2 rows BRL com source=bcb_ptax', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({
        ok: true,
        body: {
          value: [
            {
              cotacaoCompra: 5.1100,
              cotacaoVenda: 5.1200,
              dataHoraCotacao: '2026-05-04 13:00:00.000',
              tipoBoletim: 'Fechamento',
            },
            {
              cotacaoCompra: 5.1198,
              cotacaoVenda: 5.1234,
              dataHoraCotacao: '2026-05-05 13:00:00.000',
              tipoBoletim: 'Fechamento',
            },
          ],
        },
      }),
    );

    const mod = await loadAdapter();
    const rows = await mod.fetchTimeseriesBrl('2026-05-04', '2026-05-05');

    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(r.currency).toBe('BRL');
      expect(r.source).toBe('bcb_ptax');
    }
    expect(rows[0].ratePerUsd).toBeCloseTo(5.1200, 4);
    expect(rows[1].ratePerUsd).toBeCloseTo(5.1234, 4);
  });

  it('range com weekend → omite domingo/sabado (BCB nao publica)', async () => {
    // BCB OData simplesmente omite weekends do array
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({
        ok: true,
        body: {
          value: [
            {
              cotacaoCompra: 5.1,
              cotacaoVenda: 5.12,
              dataHoraCotacao: '2026-05-01 13:00:00.000',
              tipoBoletim: 'Fechamento',
            },
            {
              cotacaoCompra: 5.11,
              cotacaoVenda: 5.13,
              dataHoraCotacao: '2026-05-04 13:00:00.000',
              tipoBoletim: 'Fechamento',
            },
          ],
        },
      }),
    );

    const mod = await loadAdapter();
    const rows = await mod.fetchTimeseriesBrl('2026-05-01', '2026-05-05');
    const dates = rows.map((r: any) => r.date);
    expect(dates).toContain('2026-05-01');
    expect(dates).toContain('2026-05-04');
    expect(dates).not.toContain('2026-05-02'); // sabado
    expect(dates).not.toContain('2026-05-03'); // domingo
  });

  it('HTTP 5xx → throws FxFetchError provider=bcb_ptax', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: false, status: 503, body: {} }),
    );

    const mod = await loadAdapter();
    await expect(
      mod.fetchTimeseriesBrl('2026-05-01', '2026-05-05'),
    ).rejects.toMatchObject({ provider: 'bcb_ptax' });
  });

  it('value vazio (range sem working days) → array vazio (nao throws)', async () => {
    // Para timeseries, range sem dados (range muito curto + weekend) eh aceitavel
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: { value: [] } }),
    );

    const mod = await loadAdapter();
    const rows = await mod.fetchTimeseriesBrl('2026-05-02', '2026-05-03');
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(0);
  });
});
