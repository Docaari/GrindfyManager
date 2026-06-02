/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Fase D #8 — Painel BRM/RoR ao vivo
 *
 * Spec : Docs/specs/sprint-fase-d-brm-ror-2026-06-02.md (RF-01, RF-02)
 * ADR  : 236 (D-1 buildBankrollHealth com injecao de deps)
 *
 * Cobertura: orquestracao buildBankrollHealth(userId, deps?).
 *   - banca null (sem wallets) → no_bankroll, engine NAO roda.
 *   - banca {totalUsd} REAL + tiers snake_case REAIS → engine roda.
 *   - dataSufficiency: none (sem historico), low (<200 mas RODA engine), ok (>=200).
 *   - groups montados do shape snake_case (avg_buy_in/avg_field/roi_adjusted/count/type).
 *   - isPKO derivado de type==='PKO'.
 *   - tiers invalidos (count 0, avg_buy_in NaN) descartados dos groups MAS
 *     contam? sampleSize = soma de count de TODOS os tiers (RF-01).
 *   - sampleSize = soma dos counts.
 *   - bisOfMargin = totalUsd / weightedAvgBuyIn.
 *   - weeks=52 passado ao engine.
 *   - engine throw → degrada (log antes #9, riskOfRuinPct null).
 *   - storage throw → degrada.
 *   - RoR extremo ~100 → classification risky; RoR 0 → healthy.
 *
 * Lessons aplicadas:
 *   #3  shape REAL — getCurrentBankroll null OU {totalUsd,...}; tiers snake_case.
 *   #6  FX→USD: historico ja USD (storage filtra currency='USD'); banca ja USD.
 *   #9  log antes do fallback (espia console.error em throws).
 *   #11 honestidade: amostra fraca → low (RODA engine + marca), nunca esconde-via-fabricar.
 *   #34 injecao de deps testavel (ADR-236 D-1 contract).
 *
 * Status RED: server/services/bankrollHealth.ts NAO existe → loadService() null.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Dynamic import (lesson #14/#26)
// ---------------------------------------------------------------------------
async function loadService(): Promise<any | null> {
  try {
    const mod = await import('../../server/services/bankrollHealth');
    return mod.buildBankrollHealth ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fixtures — SHAPES REAIS (lesson #3)
// ---------------------------------------------------------------------------

/** Shape REAL de getCurrentBankroll quando HA wallets (storage.ts:13259). */
function makeBankroll(totalUsd: number) {
  return {
    totalUsd,
    walletsCount: 2,
    bisAvailable: 250,
    deltaPct7d: 1.2,
    sparkline: [4800, 4900, 5000],
  };
}

/**
 * Shape REAL de um tier de getHistoricalStatsByUser (storage.ts:12735) —
 * snake_case INTERNO: avg_buy_in / avg_field / roi_adjusted / count / type.
 * Mock idealizado camelCase QUEBRARIA (lesson #3).
 */
function makeTier(over: Partial<any> = {}) {
  return {
    tier: 'low',
    type: 'Vanilla',
    count: 300,
    avg_buy_in: 20,
    avg_field: 500,
    roi_adjusted: 0.1,
    ...over,
  };
}

/** Shape REAL de getHistoricalStatsByUser. */
function makeHistory(tiers: any[]) {
  return {
    tiers,
    totals: {
      tournaments: tiers.reduce((s, t) => s + (t.count ?? 0), 0),
      dateRange: { from: '2025-01-01', to: '2026-06-01' },
      duplicatesRemoved: 0,
    },
  };
}

/** Retorno REAL de runMonteCarloSimulation (varianceEngine VarianceSimulationResult). */
function makeEngineResult(over: Partial<any> = {}) {
  return {
    ev: 6000,
    stdDev: 7200,
    roi: { mean: 0.1, median: 0.08 },
    totalTournaments: 300,
    totalInvested: 6000,
    riskOfRuin: { pct: 3.2, bankrollUsd: 5000, ruinSims: 320, totalSims: 10000 },
    ...over,
  };
}

function makeDeps(over: Partial<any> = {}) {
  return {
    getCurrentBankroll: vi.fn().mockResolvedValue(makeBankroll(5000)),
    getHistoricalStatsByUser: vi.fn().mockResolvedValue(makeHistory([makeTier()])),
    runSimulation: vi.fn().mockReturnValue(makeEngineResult()),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// no_bankroll (RF-02 / RF-03)
// =============================================================================
describe('buildBankrollHealth — banca ausente (no_bankroll)', () => {
  it('getCurrentBankroll null (sem wallets) → no_bankroll, engine NAO roda', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps({
      getCurrentBankroll: vi.fn().mockResolvedValue(null),
    });
    const r = await build('USER-1', deps);

    expect(r.dataSufficiency).toBe('no_bankroll');
    expect(r.riskOfRuinPct).toBeNull();
    expect(r.classification).toBeNull();
    expect(r.bankrollUsd).toBe(0);
    expect(deps.runSimulation).not.toHaveBeenCalled();
  });

  it('banca totalUsd 0 → no_bankroll, engine NAO roda', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps({
      getCurrentBankroll: vi.fn().mockResolvedValue(makeBankroll(0)),
    });
    const r = await build('USER-1', deps);

    expect(r.dataSufficiency).toBe('no_bankroll');
    expect(deps.runSimulation).not.toHaveBeenCalled();
  });
});

// =============================================================================
// none (sem historico) (RF-02)
// =============================================================================
describe('buildBankrollHealth — sem historico (none)', () => {
  it('tiers vazio → none, engine NAO roda, rorPct null', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps({
      getHistoricalStatsByUser: vi.fn().mockResolvedValue(makeHistory([])),
    });
    const r = await build('USER-1', deps);

    expect(r.dataSufficiency).toBe('none');
    expect(r.riskOfRuinPct).toBeNull();
    expect(r.classification).toBeNull();
    expect(r.sampleSize).toBe(0);
    expect(deps.runSimulation).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Happy path ok (RF-01)
// =============================================================================
describe('buildBankrollHealth — happy path (ok)', () => {
  it('banca 5000 + 1 tier count 300 → engine roda, payload completo, ok', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps();
    const r = await build('USER-1', deps);

    expect(r.dataSufficiency).toBe('ok');
    expect(r.bankrollUsd).toBe(5000);
    expect(r.riskOfRuinPct).toBe(3.2);
    expect(r.stdDev).toBe(7200);
    expect(r.roiMean).toBe(0.1);
    expect(r.classification).toBe('healthy'); // 3.2 < 5
    expect(r.sampleSize).toBe(300);
    expect(r.groupsUsed).toBe(1);
    expect(deps.runSimulation).toHaveBeenCalledTimes(1);
  });

  it('passa weeks=52 ao engine (verificavel via spy)', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps();
    await build('USER-1', deps);

    const arg = deps.runSimulation.mock.calls[0][0];
    expect(arg.weeks).toBe(52);
  });

  it('monta groups a partir do shape snake_case REAL (lesson #3)', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps({
      getHistoricalStatsByUser: vi.fn().mockResolvedValue(
        makeHistory([
          makeTier({ tier: 'high', type: 'PKO', count: 250, avg_buy_in: 109, avg_field: 1200, roi_adjusted: 0.18 }),
        ]),
      ),
    });
    await build('USER-1', deps);

    const arg = deps.runSimulation.mock.calls[0][0];
    expect(Array.isArray(arg.groups)).toBe(true);
    expect(arg.groups).toHaveLength(1);
    const g = arg.groups[0];
    // buyIn/field/roi/count vem das chaves snake_case mapeadas
    expect(g.buyIn).toBe(109);
    expect(g.field).toBe(1200);
    expect(g.roi).toBe(0.18);
    expect(g.count).toBe(250);
    // isPKO derivado de type==='PKO'
    expect(g.isPKO).toBe(true);
  });

  it('isPKO false quando type !== PKO', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps({
      getHistoricalStatsByUser: vi.fn().mockResolvedValue(
        makeHistory([makeTier({ type: 'Vanilla' })]),
      ),
    });
    await build('USER-1', deps);

    const g = deps.runSimulation.mock.calls[0][0].groups[0];
    expect(g.isPKO).toBe(false);
  });

  it('multiplos tiers validos → todos entram em groups; sampleSize = soma dos counts', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps({
      getHistoricalStatsByUser: vi.fn().mockResolvedValue(
        makeHistory([
          makeTier({ tier: 'low', count: 120 }),
          makeTier({ tier: 'mid', avg_buy_in: 55, count: 130 }),
        ]),
      ),
    });
    const r = await build('USER-1', deps);

    expect(deps.runSimulation.mock.calls[0][0].groups).toHaveLength(2);
    expect(r.groupsUsed).toBe(2);
    expect(r.sampleSize).toBe(250);
  });

  it('bankrollUsd no payload == getCurrentBankroll().totalUsd', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps({
      getCurrentBankroll: vi.fn().mockResolvedValue(makeBankroll(7350.5)),
    });
    const r = await build('USER-1', deps);
    expect(r.bankrollUsd).toBe(7350.5);
  });

  it('bisOfMargin = totalUsd / weightedAvgBuyIn (1 tier: 5000/20 = 250)', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps(); // banca 5000, tier avg_buy_in 20
    const r = await build('USER-1', deps);
    expect(r.bisOfMargin).toBeCloseTo(250, 5);
  });
});

// =============================================================================
// low (amostra pequena RODA engine) (RF-02 / lesson #11)
// =============================================================================
describe('buildBankrollHealth — amostra pequena (low)', () => {
  it('sample 50 → low, RODA engine, rorPct presente (nao esconde, marca)', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps({
      getHistoricalStatsByUser: vi.fn().mockResolvedValue(makeHistory([makeTier({ count: 50 })])),
    });
    const r = await build('USER-1', deps);

    expect(r.dataSufficiency).toBe('low');
    expect(r.riskOfRuinPct).not.toBeNull();
    expect(deps.runSimulation).toHaveBeenCalledTimes(1);
  });

  it('sample 3 (muito pequena) → low, numero exibido (engine roda)', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps({
      getHistoricalStatsByUser: vi.fn().mockResolvedValue(makeHistory([makeTier({ count: 3 })])),
    });
    const r = await build('USER-1', deps);

    expect(r.dataSufficiency).toBe('low');
    expect(r.riskOfRuinPct).not.toBeNull();
  });

  it('sample 199 → low; 200 → ok (boundary)', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const r199 = await build('USER-1', makeDeps({
      getHistoricalStatsByUser: vi.fn().mockResolvedValue(makeHistory([makeTier({ count: 199 })])),
    }));
    expect(r199.dataSufficiency).toBe('low');

    const r200 = await build('USER-1', makeDeps({
      getHistoricalStatsByUser: vi.fn().mockResolvedValue(makeHistory([makeTier({ count: 200 })])),
    }));
    expect(r200.dataSufficiency).toBe('ok');
  });
});

// =============================================================================
// Tiers invalidos descartados dos groups (RF-01)
// =============================================================================
describe('buildBankrollHealth — tiers invalidos', () => {
  it('tier count 0 → descartado dos groups (mas conta no sampleSize? = 0 contribui 0)', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps({
      getHistoricalStatsByUser: vi.fn().mockResolvedValue(
        makeHistory([
          makeTier({ tier: 'low', count: 300 }),
          makeTier({ tier: 'mid', count: 0 }), // invalido
        ]),
      ),
    });
    const r = await build('USER-1', deps);

    // so 1 group valido vai ao engine
    expect(deps.runSimulation.mock.calls[0][0].groups).toHaveLength(1);
    expect(r.groupsUsed).toBe(1);
    // sampleSize soma TODOS os tiers (300 + 0)
    expect(r.sampleSize).toBe(300);
  });

  it('tier avg_buy_in NaN → descartado dos groups', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps({
      getHistoricalStatsByUser: vi.fn().mockResolvedValue(
        makeHistory([
          makeTier({ tier: 'low', count: 250 }),
          makeTier({ tier: 'mid', count: 100, avg_buy_in: NaN }), // invalido
        ]),
      ),
    });
    const r = await build('USER-1', deps);

    expect(deps.runSimulation.mock.calls[0][0].groups).toHaveLength(1);
    expect(r.groupsUsed).toBe(1);
    // sampleSize honesto: 250 + 100 = 350
    expect(r.sampleSize).toBe(350);
  });

  it('TODOS os tiers invalidos (count 0) → nenhum group valido → none, engine NAO roda', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps({
      getHistoricalStatsByUser: vi.fn().mockResolvedValue(
        makeHistory([makeTier({ count: 0 }), makeTier({ count: 0 })]),
      ),
    });
    const r = await build('USER-1', deps);

    expect(r.dataSufficiency).toBe('none');
    expect(deps.runSimulation).not.toHaveBeenCalled();
    expect(r.riskOfRuinPct).toBeNull();
  });
});

// =============================================================================
// Classificacao a partir do RoR do engine (RF-04)
// =============================================================================
describe('buildBankrollHealth — classificacao do RoR do engine', () => {
  it('RoR extremo ~100 → classification risky', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps({
      runSimulation: vi.fn().mockReturnValue(
        makeEngineResult({ riskOfRuin: { pct: 99.7, bankrollUsd: 50, ruinSims: 9970, totalSims: 10000 } }),
      ),
    });
    const r = await build('USER-1', deps);
    expect(r.riskOfRuinPct).toBe(99.7);
    expect(r.classification).toBe('risky');
  });

  it('RoR 0 (banca enorme) → classification healthy', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps({
      runSimulation: vi.fn().mockReturnValue(
        makeEngineResult({ riskOfRuin: { pct: 0, bankrollUsd: 999999, ruinSims: 0, totalSims: 10000 } }),
      ),
    });
    const r = await build('USER-1', deps);
    expect(r.riskOfRuinPct).toBe(0);
    expect(r.classification).toBe('healthy');
  });

  it('engine retorna riskOfRuin undefined → rorPct null, classification null (null-safe)', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const deps = makeDeps({
      runSimulation: vi.fn().mockReturnValue(makeEngineResult({ riskOfRuin: undefined })),
    });
    const r = await build('USER-1', deps);
    expect(r.riskOfRuinPct).toBeNull();
    expect(r.classification).toBeNull();
  });
});

// =============================================================================
// Degradacao graciosa: engine/storage throw (RF-03 / lesson #9)
// =============================================================================
describe('buildBankrollHealth — degradacao graciosa', () => {
  it('engine throw → degrada (log antes #9), retorna sem rorPct, sem crash', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = makeDeps({
      runSimulation: vi.fn().mockImplementation(() => {
        throw new Error('MC boom');
      }),
    });

    const r = await build('USER-1', deps);

    // log ANTES do fallback (lesson #9)
    expect(errSpy).toHaveBeenCalled();
    // degradado: nao quebra, RoR null
    expect(r.riskOfRuinPct).toBeNull();
    expect(r.classification).toBeNull();
    errSpy.mockRestore();
  });

  it('getCurrentBankroll throw → degrada (log antes), nao 500/crash', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = makeDeps({
      getCurrentBankroll: vi.fn().mockRejectedValue(new Error('db down')),
    });

    const r = await build('USER-1', deps);

    expect(errSpy).toHaveBeenCalled();
    expect(r.riskOfRuinPct).toBeNull();
    errSpy.mockRestore();
  });

  it('getHistoricalStatsByUser throw → degrada (log antes)', async () => {
    const build = await loadService();
    expect(build).not.toBeNull();

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = makeDeps({
      getHistoricalStatsByUser: vi.fn().mockRejectedValue(new Error('hist boom')),
    });

    const r = await build('USER-1', deps);

    expect(errSpy).toHaveBeenCalled();
    expect(r.riskOfRuinPct).toBeNull();
    errSpy.mockRestore();
  });
});
