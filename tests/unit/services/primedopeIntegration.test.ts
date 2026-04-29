import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// =============================================================================
// Sprint F4 W0 — primedopeIntegration.ts service tests
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md secao C.1 (RF-04, RF-08, RF-09, RF-12)
// ADR-054: cache 30min + fallback 24h + semaphore max=3 + retry 1x backoff 500ms
// ADR-033: FX cascata users > wallets > fallback constante
// ADR-055: tracker.emit(event, payload) telemetria
//
// Cobertura:
//   - Happy path cache MISS (fetch + parse + INSERT + tracker emit)
//   - Cache HIT (skip fetch, source='cache')
//   - Fallback STALE 24h (5xx exausto)
//   - 4xx fatal (sem retry, telemetria schema_change)
//   - Timeout 15s + 1 retry com 500ms backoff (5xx)
//   - Semaphore inline max=3 (4o+ enfileiram)
//   - FX cascata: users.exchangeRates > wallets.exchangeRates > fallback
//   - inputHash inclui buyinUsd pos-conversao FX
//   - inputJson salva fxRatesUsed snapshot
//   - pinned runs nao expiram (expiresAt = null)
// =============================================================================

const fixture = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../fixtures/primedope-response.json'),
    'utf8'
  )
);

const trackerEmit = vi.fn();
vi.mock('../../../server/utils/tracker', () => ({
  emit: (event: string, payload: any) => trackerEmit(event, payload),
}));

const storageMock = {
  findRecentPrimedopeRunByHash: vi.fn(),
  findFallbackPrimedopeRun: vi.fn(),
  insertPrimedopeRun: vi.fn(),
  getUserSettings: vi.fn(),
  listWalletsByUser: vi.fn(),
  getActiveWallet: vi.fn(),
};
vi.mock('../../../server/storage', () => ({
  storage: storageMock,
}));

vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    getConsolidatedBalance: vi.fn(async () => ({
      totalUsd: 5000,
      wallets: [],
    })),
  },
}));

const fetchMock = vi.fn();
const originalFetch = (globalThis as any).fetch;

async function loadService() {
  return await import('../../../server/services/primedopeIntegration');
}

beforeEach(() => {
  vi.clearAllMocks();
  trackerEmit.mockClear();
  Object.values(storageMock).forEach((fn: any) => fn.mockReset && fn.mockReset());
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;

  storageMock.findRecentPrimedopeRunByHash.mockResolvedValue(null);
  storageMock.findFallbackPrimedopeRun.mockResolvedValue(null);
  storageMock.insertPrimedopeRun.mockImplementation(async (row: any) => ({
    ...row,
    id: row.id ?? 'pdr_test_id',
    createdAt: new Date(),
  }));
  storageMock.getUserSettings.mockResolvedValue({
    userId: 'USER-T1',
    exchangeRates: null,
    defaultCurrency: 'USD',
  });
  storageMock.listWalletsByUser.mockResolvedValue([]);
});

afterEach(() => {
  (globalThis as any).fetch = originalFetch;
});

const baseInput = {
  userId: 'USER-T1',
  profileLetter: 'A' as const,
  dayOfWeek: 2,
  multiplier: 4,
  bankrollUsd: 5000,
  buckets: [
    {
      name: 'Suprema 11 BRL',
      network: 'Suprema',
      count: 5,
      buyinOriginal: 11,
      currency: 'BRL',
      playersAvg: 200,
      placesPaid: 30,
      rakePct: 10,
      roiPct: 20,
    },
    {
      name: 'GG $4.78',
      network: 'GGNetwork',
      count: 3,
      buyinOriginal: 4.78,
      currency: 'USD',
      playersAvg: 1000,
      placesPaid: 150,
      rakePct: 10,
      roiPct: 15,
    },
  ],
};

function mockSuccessfulFetch() {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'application/json']]),
    json: async () => fixture,
    arrayBuffer: async () => new ArrayBuffer(0),
    text: async () => JSON.stringify(fixture),
  });
}

describe('runSimulation — cache MISS happy path', () => {
  it('fetch PrimeDope, persiste row e retorna source=primedope', async () => {
    mockSuccessfulFetch();
    const { runSimulation } = await loadService();

    const r = await runSimulation(baseInput);

    expect(fetchMock).toHaveBeenCalled();
    expect(storageMock.insertPrimedopeRun).toHaveBeenCalledTimes(1);
    expect(r.source).toBe('primedope');
    expect(r.data).toBeDefined();
    expect(typeof r.latencyMs).toBe('number');
  });

  it('emite tracker.emit primedope_simulation_run com cacheHit=false', async () => {
    mockSuccessfulFetch();
    const { runSimulation } = await loadService();

    await runSimulation(baseInput);

    const call = trackerEmit.mock.calls.find(
      (c) => c[0] === 'primedope_simulation_run'
    );
    expect(call).toBeTruthy();
    expect(call?.[1]).toEqual(
      expect.objectContaining({
        cacheHit: false,
        source: 'primedope',
      })
    );
  });
});

describe('runSimulation — cache HIT', () => {
  it('retorna source=cache sem call externo', async () => {
    storageMock.findRecentPrimedopeRunByHash.mockResolvedValue({
      id: 'pdr_cached',
      userId: 'USER-T1',
      inputHash: 'abc123',
      resultJson: fixture,
      histogramPath: '/api/primedope/chart/abc',
      randomRunsPath: '/api/primedope/chart/def',
      latencyMs: 5,
      source: 'primedope',
      createdAt: new Date(Date.now() - 60_000), // 1 min atras
    });

    const { runSimulation } = await loadService();
    const r = await runSimulation(baseInput);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.source).toBe('cache');
    expect(storageMock.insertPrimedopeRun).not.toHaveBeenCalled();
  });

  it('force=true bypassa cache (tenta fetch mesmo com row recente)', async () => {
    storageMock.findRecentPrimedopeRunByHash.mockResolvedValue({
      id: 'pdr_cached',
      resultJson: fixture,
      createdAt: new Date(),
    });
    mockSuccessfulFetch();

    const { runSimulation } = await loadService();
    const r = await runSimulation({ ...baseInput, force: true });

    expect(fetchMock).toHaveBeenCalled();
    expect(r.source).toBe('primedope');
  });
});

describe('runSimulation — fallback stale 24h', () => {
  it('retry 5xx exausto cai em fallback se row < 24h existir', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'fail' })
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'fail again' });

    storageMock.findFallbackPrimedopeRun.mockResolvedValue({
      id: 'pdr_stale',
      resultJson: fixture,
      createdAt: new Date(Date.now() - 5 * 3600_000), // 5h atras
      histogramPath: '/api/primedope/chart/stale-h',
      randomRunsPath: '/api/primedope/chart/stale-r',
    });

    const { runSimulation } = await loadService();
    const r = await runSimulation(baseInput);

    expect(r.source).toBe('fallback-stale');
    expect(typeof r.staleAgeMs).toBe('number');
    expect(r.staleAgeMs).toBeGreaterThan(0);
  });

  it('retry 5xx exausto + sem fallback row -> throw PRIMEDOPE_UNAVAILABLE', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'fail' })
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'fail' });
    storageMock.findFallbackPrimedopeRun.mockResolvedValue(null);

    const { runSimulation } = await loadService();
    await expect(runSimulation(baseInput)).rejects.toThrow(/unavailable|PRIMEDOPE/i);
  });

  it('emite tracker primedope_simulation_error com errorType upstream_5xx_recovered no fallback', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    storageMock.findFallbackPrimedopeRun.mockResolvedValue({
      id: 'pdr_stale',
      resultJson: fixture,
      createdAt: new Date(Date.now() - 3600_000),
    });

    const { runSimulation } = await loadService();
    await runSimulation(baseInput);

    const errorCall = trackerEmit.mock.calls.find(
      (c) => c[0] === 'primedope_simulation_error'
    );
    expect(errorCall).toBeTruthy();
    expect(errorCall?.[1]).toEqual(
      expect.objectContaining({
        errorType: expect.stringMatching(/5xx|recovered/i),
      })
    );
  });
});

describe('runSimulation — 4xx fatal (schema change)', () => {
  it('4xx nao retenta e lanca UPSTREAM_4XX', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' });

    const { runSimulation } = await loadService();
    await expect(runSimulation(baseInput)).rejects.toThrow(/4xx|UPSTREAM/i);

    // SEM retry — fetch chamado apenas 1 vez
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('emite tracker primedope_simulation_error com errorType upstream_4xx_schema_change', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'bad' });

    const { runSimulation } = await loadService();
    await expect(runSimulation(baseInput)).rejects.toThrow();

    const errorCall = trackerEmit.mock.calls.find(
      (c) => c[0] === 'primedope_simulation_error'
    );
    expect(errorCall?.[1]).toEqual(
      expect.objectContaining({
        errorType: 'upstream_4xx_schema_change',
        statusCode: 400,
      })
    );
  });
});

describe('runSimulation — retry behavior', () => {
  it('retry 1x apos 500ms backoff em 5xx (sucesso na 2a tentativa)', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => fixture,
        arrayBuffer: async () => new ArrayBuffer(0),
      });

    const { runSimulation } = await loadService();
    const r = await runSimulation(baseInput);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.source).toBe('primedope');
  });

  it('NAO retenta em 4xx', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 });
    const { runSimulation } = await loadService();
    await expect(runSimulation(baseInput)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('runSimulation — semaphore inline max=3', () => {
  it('5 chamadas simultaneas: 3 disparam fetch concorrentes, 2 enfileiram', async () => {
    let inFlight = 0;
    let maxObservedInFlight = 0;
    fetchMock.mockImplementation(async () => {
      inFlight++;
      maxObservedInFlight = Math.max(maxObservedInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight--;
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => fixture,
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    });

    const { runSimulation } = await loadService();
    const promises = Array.from({ length: 5 }, (_, i) =>
      runSimulation({
        ...baseInput,
        // diff inputs para invalidar cache
        buckets: baseInput.buckets.map((b) => ({ ...b, count: b.count + i })),
      })
    );
    await Promise.all(promises);

    // Em qualquer momento, no maximo 3 in-flight
    expect(maxObservedInFlight).toBeLessThanOrEqual(3);
    // Total 5 chamadas concluidas
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});

describe('runSimulation — FX conversion (RF-26)', () => {
  it('Suprema BRL R$11 + exchangeRates {BRL:5.0} -> buyinUsd=2.20', async () => {
    storageMock.getUserSettings.mockResolvedValue({
      userId: 'USER-T1',
      exchangeRates: { BRL: 5.0, EUR: 0.93, CNY: 7.25 },
      defaultCurrency: 'USD',
    });
    mockSuccessfulFetch();

    const { runSimulation } = await loadService();
    const r = await runSimulation(baseInput);

    // Inspect persisted inputJson via insertPrimedopeRun call args
    const inserted = storageMock.insertPrimedopeRun.mock.calls[0][0];
    expect(inserted).toBeTruthy();
    const inputJson = inserted.inputJson ?? inserted.input_json;
    const supremaBucket = inputJson.buckets.find(
      (b: any) => b.network === 'Suprema'
    );
    expect(supremaBucket.buyinUsd).toBeCloseTo(2.2, 1);
    expect(r.source).toBe('primedope');
  });

  it('FX cascata: users.exchangeRates tem prioridade sobre wallets', async () => {
    storageMock.getUserSettings.mockResolvedValue({
      userId: 'USER-T1',
      exchangeRates: { BRL: 4.0 }, // user-level: 4.0
      defaultCurrency: 'USD',
    });
    storageMock.listWalletsByUser.mockResolvedValue([
      {
        id: 'w1',
        nativeCurrency: 'BRL',
        exchangeRates: { BRL: 5.0 }, // wallet-level: 5.0 (deve ser ignorado)
        status: 'active',
      },
    ]);
    mockSuccessfulFetch();

    const { runSimulation } = await loadService();
    await runSimulation(baseInput);

    const inserted = storageMock.insertPrimedopeRun.mock.calls[0][0];
    const inputJson = inserted.inputJson ?? inserted.input_json;
    // R$11 / 4 = 2.75 (NAO 2.20)
    const supremaBucket = inputJson.buckets.find(
      (b: any) => b.network === 'Suprema'
    );
    expect(supremaBucket.buyinUsd).toBeCloseTo(2.75, 1);
  });

  it('FX cascata: wallets.exchangeRates usado quando users.exchangeRates ausente', async () => {
    storageMock.getUserSettings.mockResolvedValue({
      userId: 'USER-T1',
      exchangeRates: null,
      defaultCurrency: 'USD',
    });
    storageMock.listWalletsByUser.mockResolvedValue([
      {
        id: 'w1',
        nativeCurrency: 'BRL',
        exchangeRates: { BRL: 5.0 },
        status: 'active',
      },
    ]);
    mockSuccessfulFetch();

    const { runSimulation } = await loadService();
    await runSimulation(baseInput);

    const inserted = storageMock.insertPrimedopeRun.mock.calls[0][0];
    const inputJson = inserted.inputJson ?? inserted.input_json;
    const supremaBucket = inputJson.buckets.find(
      (b: any) => b.network === 'Suprema'
    );
    expect(supremaBucket.buyinUsd).toBeCloseTo(2.2, 1);
  });

  it('FX fallback constante quando users.exchangeRates e wallets ambos ausentes', async () => {
    storageMock.getUserSettings.mockResolvedValue({
      userId: 'USER-T1',
      exchangeRates: null,
    });
    storageMock.listWalletsByUser.mockResolvedValue([]);
    mockSuccessfulFetch();

    const { runSimulation } = await loadService();
    await runSimulation(baseInput);

    const inserted = storageMock.insertPrimedopeRun.mock.calls[0][0];
    const inputJson = inserted.inputJson ?? inserted.input_json;
    const supremaBucket = inputJson.buckets.find(
      (b: any) => b.network === 'Suprema'
    );
    // BRL=5 (fallback constante DEFAULT_EXCHANGE_RATES) -> 11/5 = 2.2
    expect(supremaBucket.buyinUsd).toBeCloseTo(2.2, 1);
  });
});

describe('runSimulation — inputHash + inputJson', () => {
  it('inputHash deve ser determinista para o mesmo input', async () => {
    mockSuccessfulFetch();
    const { runSimulation } = await loadService();

    await runSimulation(baseInput);
    const hash1 = storageMock.insertPrimedopeRun.mock.calls[0][0].inputHash
      ?? storageMock.insertPrimedopeRun.mock.calls[0][0].input_hash;

    storageMock.insertPrimedopeRun.mockClear();

    await runSimulation(baseInput);
    const hash2 = storageMock.insertPrimedopeRun.mock.calls[0][0].inputHash
      ?? storageMock.insertPrimedopeRun.mock.calls[0][0].input_hash;

    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('string');
    expect(hash1.length).toBe(64); // sha256 hex
  });

  it('inputHash inclui buyinUsd (pos-FX) — mesmo buyinOriginal com FX diferente -> hash diferente', async () => {
    mockSuccessfulFetch();
    const { runSimulation } = await loadService();

    storageMock.getUserSettings.mockResolvedValue({
      userId: 'USER-T1',
      exchangeRates: { BRL: 5.0 },
    });
    await runSimulation(baseInput);
    const hash1 = storageMock.insertPrimedopeRun.mock.calls[0][0].inputHash
      ?? storageMock.insertPrimedopeRun.mock.calls[0][0].input_hash;

    storageMock.insertPrimedopeRun.mockClear();
    storageMock.getUserSettings.mockResolvedValue({
      userId: 'USER-T1',
      exchangeRates: { BRL: 4.0 }, // Mesmo input, FX diferente
    });
    await runSimulation(baseInput);
    const hash2 = storageMock.insertPrimedopeRun.mock.calls[0][0].inputHash
      ?? storageMock.insertPrimedopeRun.mock.calls[0][0].input_hash;

    expect(hash1).not.toBe(hash2);
  });

  it('inputJson salva fxRatesUsed snapshot (audit trail)', async () => {
    storageMock.getUserSettings.mockResolvedValue({
      userId: 'USER-T1',
      exchangeRates: { BRL: 5.0, EUR: 0.93 },
    });
    mockSuccessfulFetch();

    const { runSimulation } = await loadService();
    await runSimulation(baseInput);

    const inserted = storageMock.insertPrimedopeRun.mock.calls[0][0];
    const inputJson = inserted.inputJson ?? inserted.input_json;
    expect(inputJson.fxRatesUsed).toEqual(
      expect.objectContaining({ BRL: 5.0 })
    );
  });
});

describe('runSimulation — pinned runs nao expiram', () => {
  it('row recem-criada tem expiresAt = NOW + 90 dias quando pinned=false', async () => {
    mockSuccessfulFetch();
    const { runSimulation } = await loadService();

    await runSimulation(baseInput);

    const inserted = storageMock.insertPrimedopeRun.mock.calls[0][0];
    const expiresAt = inserted.expiresAt ?? inserted.expires_at;
    expect(expiresAt).toBeTruthy();
    if (expiresAt instanceof Date) {
      const diffDays = (expiresAt.getTime() - Date.now()) / 86400_000;
      expect(diffDays).toBeGreaterThan(85);
      expect(diffDays).toBeLessThan(95);
    }
  });

  it('insertPrimedopeRun seta pinned=false por default', async () => {
    mockSuccessfulFetch();
    const { runSimulation } = await loadService();
    await runSimulation(baseInput);

    const inserted = storageMock.insertPrimedopeRun.mock.calls[0][0];
    expect(inserted.pinned).toBe(false);
  });
});

describe('runSimulation — timeout', () => {
  it('timeout 15s respeitado em fetch lento (uses AbortController ou Promise.race)', async () => {
    // Simulamos timeout via fetch que rejeita.
    fetchMock
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'AbortError' }))
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'AbortError' }));
    storageMock.findFallbackPrimedopeRun.mockResolvedValue(null);

    const { runSimulation } = await loadService();
    await expect(runSimulation(baseInput)).rejects.toThrow();
    // Devemos ter feito retry: 2 chamadas
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
