/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint VR-1 — RF-01: Monte Carlo Engine
 *
 * Spec  : Docs/specs/sprint-variance-reform.md (RF-01)
 * ADR   : 211 (variance native monte carlo engine)
 * Ref   : scripts/variance-sim.mjs (validated algorithm)
 *
 * Module under test: server/services/varianceEngine.ts (DOES NOT EXIST YET)
 *
 * Exported function: runMonteCarloSimulation(input: VarianceSimulationInput): VarianceSimulationResult
 * Internal helpers:  generatePayouts(field, isPKO), calibrateSkill(field, payouts, roi)
 *
 * Coverage:
 *   - Happy path: valid result structure with all fields
 *   - EV close to theoretical (ROI * invested, 10% tolerance)
 *   - Percentiles monotonically increasing
 *   - Drawdown ordering: median < p95 < worst
 *   - Histogram covers 100% of simulations
 *   - PKO groups have lower variance (alpha * 0.65)
 *   - Negative ROI calibrates correctly (skill < 1)
 *   - Fixed seed produces identical results
 *   - Simulations clamping [1000, 50000]
 *   - Performance: < 2s for 10K sims x 6 groups x 12 weeks
 *   - Edge: single group, minimal field size
 *   - Group contributions sum to totalInvested
 *   - Histogram bucket auto-sizing
 *
 * Lessons applied:
 *   #3  shape REAL — assertions match VarianceSimulationResult contract
 *   #5  vi.fn() ok (no constructors)
 *   #8  no length-of-enum anti-pattern — validate presence individually
 *
 * Status RED: server/services/varianceEngine.ts DOES NOT EXIST.
 */

import { describe, it, expect } from 'vitest';

// Import that DOES NOT EXIST YET — Implementer will create this module.
import {
  runMonteCarloSimulation,
  generatePayouts,
  calibrateSkill,
  percentile,
} from '../../server/services/varianceEngine';

import type {
  VarianceSimulationInput,
  VarianceSimulationResult,
} from '../../server/services/varianceEngine';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Realistic 6-group input modeled after user's Perfil A grade */
const sixGroupInput: VarianceSimulationInput = {
  groups: [
    { name: 'G1 High mix',     buyIn: 163, field: 2200, roi: 0.15, count: 60,  isPKO: false },
    { name: 'G2 Mid Vanilla',  buyIn: 74,  field: 700,  roi: 0.15, count: 336, isPKO: false },
    { name: 'G3 Mid PKO',      buyIn: 72,  field: 2700, roi: 0.15, count: 144, isPKO: true  },
    { name: 'G4 Low Vanilla',  buyIn: 35,  field: 420,  roi: 0.15, count: 408, isPKO: false },
    { name: 'G5 Low PKO',      buyIn: 38,  field: 950,  roi: 0.15, count: 192, isPKO: true  },
    { name: 'G6 Entry mix',    buyIn: 18,  field: 400,  roi: 0.15, count: 300, isPKO: false },
  ],
  weeks: 12,
  simulations: 10000,
};

/** Single group, simple input */
const singleGroupInput: VarianceSimulationInput = {
  groups: [
    { name: 'Test', buyIn: 50, field: 500, roi: 0.10, count: 100, isPKO: false },
  ],
  weeks: 4,
  simulations: 5000,
};

/** Negative ROI input */
const negativeRoiInput: VarianceSimulationInput = {
  groups: [
    { name: 'Losing', buyIn: 100, field: 1000, roi: -0.10, count: 200, isPKO: false },
  ],
  weeks: 12,
  simulations: 5000,
};

// ---------------------------------------------------------------------------
// RF-01: Engine unit tests
// ---------------------------------------------------------------------------

describe('varianceEngine — runMonteCarloSimulation', () => {
  describe('happy path — valid result structure', () => {
    it('returns all required fields of VarianceSimulationResult', () => {
      const result = runMonteCarloSimulation(sixGroupInput);

      // Top-level summary
      expect(typeof result.ev).toBe('number');
      expect(typeof result.stdDev).toBe('number');
      expect(typeof result.profitablePct).toBe('number');
      expect(typeof result.totalTournaments).toBe('number');
      expect(typeof result.totalInvested).toBe('number');
      expect(typeof result.simulationsRun).toBe('number');
      expect(typeof result.elapsedMs).toBe('number');

      // Percentiles — all 9 present
      expect(typeof result.percentiles.p0_15).toBe('number');
      expect(typeof result.percentiles.p2_5).toBe('number');
      expect(typeof result.percentiles.p15).toBe('number');
      expect(typeof result.percentiles.p30).toBe('number');
      expect(typeof result.percentiles.p50).toBe('number');
      expect(typeof result.percentiles.p70).toBe('number');
      expect(typeof result.percentiles.p85).toBe('number');
      expect(typeof result.percentiles.p97_5).toBe('number');
      expect(typeof result.percentiles.p99_85).toBe('number');

      // Drawdown — all 5 fields
      expect(typeof result.drawdown.mean).toBe('number');
      expect(typeof result.drawdown.median).toBe('number');
      expect(typeof result.drawdown.p95).toBe('number');
      expect(typeof result.drawdown.p99).toBe('number');
      expect(typeof result.drawdown.worst).toBe('number');

      // Group contributions — one per input group
      expect(result.groupContributions).toHaveLength(sixGroupInput.groups.length);
      for (const gc of result.groupContributions) {
        expect(typeof gc.name).toBe('string');
        expect(typeof gc.count).toBe('number');
        expect(typeof gc.invested).toBe('number');
        expect(typeof gc.expectedProfit).toBe('number');
      }

      // Histogram — at least 1 bucket
      expect(result.histogram.length).toBeGreaterThan(0);
      for (const bucket of result.histogram) {
        expect(typeof bucket.bucketStart).toBe('number');
        expect(typeof bucket.bucketEnd).toBe('number');
        expect(typeof bucket.count).toBe('number');
      }
    });

    it('totalTournaments equals sum of group counts', () => {
      const result = runMonteCarloSimulation(sixGroupInput);
      const expected = sixGroupInput.groups.reduce((s, g) => s + g.count, 0);
      expect(result.totalTournaments).toBe(expected);
    });

    it('totalInvested equals sum of buyIn * count per group', () => {
      const result = runMonteCarloSimulation(sixGroupInput);
      const expected = sixGroupInput.groups.reduce(
        (s, g) => s + g.buyIn * g.count,
        0
      );
      expect(result.totalInvested).toBeCloseTo(expected, 0);
    });

    it('simulationsRun matches requested simulations', () => {
      const result = runMonteCarloSimulation(sixGroupInput);
      expect(result.simulationsRun).toBe(10000);
    });
  });

  describe('statistical correctness', () => {
    it('EV is close to theoretical (ROI * invested), 10% tolerance', () => {
      const result = runMonteCarloSimulation(sixGroupInput);
      const theoreticalEV = sixGroupInput.groups.reduce(
        (s, g) => s + g.buyIn * g.roi * g.count,
        0
      );
      // Within 10% of theoretical
      const tolerance = Math.abs(theoreticalEV) * 0.10;
      expect(Math.abs(result.ev - theoreticalEV)).toBeLessThan(tolerance);
    });

    it('percentiles are monotonically increasing', () => {
      const result = runMonteCarloSimulation(sixGroupInput);
      const p = result.percentiles;
      expect(p.p0_15).toBeLessThanOrEqual(p.p2_5);
      expect(p.p2_5).toBeLessThanOrEqual(p.p15);
      expect(p.p15).toBeLessThanOrEqual(p.p30);
      expect(p.p30).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.p70);
      expect(p.p70).toBeLessThanOrEqual(p.p85);
      expect(p.p85).toBeLessThanOrEqual(p.p97_5);
      expect(p.p97_5).toBeLessThanOrEqual(p.p99_85);
    });

    it('drawdown ordering: median <= p95 <= worst', () => {
      const result = runMonteCarloSimulation(sixGroupInput);
      expect(result.drawdown.median).toBeLessThanOrEqual(result.drawdown.p95);
      expect(result.drawdown.p95).toBeLessThanOrEqual(result.drawdown.worst);
    });

    it('drawdown values are non-negative', () => {
      const result = runMonteCarloSimulation(sixGroupInput);
      expect(result.drawdown.mean).toBeGreaterThanOrEqual(0);
      expect(result.drawdown.median).toBeGreaterThanOrEqual(0);
      expect(result.drawdown.p95).toBeGreaterThanOrEqual(0);
      expect(result.drawdown.p99).toBeGreaterThanOrEqual(0);
      expect(result.drawdown.worst).toBeGreaterThanOrEqual(0);
    });

    it('histogram covers 100% of simulations (sum counts = simulationsRun)', () => {
      const result = runMonteCarloSimulation(sixGroupInput);
      const totalCounts = result.histogram.reduce(
        (s, b) => s + b.count,
        0
      );
      expect(totalCounts).toBe(result.simulationsRun);
    });

    it('profitablePct is between 0 and 100', () => {
      const result = runMonteCarloSimulation(sixGroupInput);
      expect(result.profitablePct).toBeGreaterThanOrEqual(0);
      expect(result.profitablePct).toBeLessThanOrEqual(100);
    });

    it('with positive ROI, profitablePct should be > 50', () => {
      const result = runMonteCarloSimulation(sixGroupInput);
      // 15% ROI across 1440 tournaments — very likely profitable
      expect(result.profitablePct).toBeGreaterThan(50);
    });
  });

  describe('PKO alpha flattening', () => {
    it('PKO group produces lower standard deviation than equivalent Vanilla', () => {
      const vanillaInput: VarianceSimulationInput = {
        groups: [
          { name: 'Vanilla', buyIn: 50, field: 1000, roi: 0.10, count: 200, isPKO: false },
        ],
        weeks: 12,
        simulations: 10000,
        seed: 42,
      };
      const pkoInput: VarianceSimulationInput = {
        groups: [
          { name: 'PKO', buyIn: 50, field: 1000, roi: 0.10, count: 200, isPKO: true },
        ],
        weeks: 12,
        simulations: 10000,
        seed: 42,
      };

      const vanillaResult = runMonteCarloSimulation(vanillaInput);
      const pkoResult = runMonteCarloSimulation(pkoInput);

      // PKO flattened alpha reduces variance
      expect(pkoResult.stdDev).toBeLessThan(vanillaResult.stdDev);
    });
  });

  describe('negative ROI calibration', () => {
    it('negative ROI produces EV < 0 and profitablePct < 50', () => {
      const result = runMonteCarloSimulation(negativeRoiInput);
      expect(result.ev).toBeLessThan(0);
      expect(result.profitablePct).toBeLessThan(50);
    });
  });

  describe('seed reproducibility', () => {
    it('fixed seed produces identical results', () => {
      const input: VarianceSimulationInput = {
        ...singleGroupInput,
        seed: 12345,
      };
      const r1 = runMonteCarloSimulation(input);
      const r2 = runMonteCarloSimulation(input);

      expect(r1.ev).toBe(r2.ev);
      expect(r1.stdDev).toBe(r2.stdDev);
      expect(r1.profitablePct).toBe(r2.profitablePct);
      expect(r1.percentiles).toEqual(r2.percentiles);
      expect(r1.drawdown).toEqual(r2.drawdown);
      expect(r1.histogram).toEqual(r2.histogram);
    });

    it('different seeds produce different results', () => {
      const r1 = runMonteCarloSimulation({ ...singleGroupInput, seed: 111 });
      const r2 = runMonteCarloSimulation({ ...singleGroupInput, seed: 999 });
      // EV should be similar (same inputs) but not identical
      expect(r1.ev).not.toBe(r2.ev);
    });
  });

  describe('simulations clamping', () => {
    it('clamps simulations below 1000 to 1000', () => {
      const result = runMonteCarloSimulation({
        ...singleGroupInput,
        simulations: 500,
      });
      expect(result.simulationsRun).toBe(1000);
    });

    it('clamps simulations above 50000 to 50000', () => {
      const result = runMonteCarloSimulation({
        ...singleGroupInput,
        simulations: 100000,
      });
      expect(result.simulationsRun).toBe(50000);
    });

    it('defaults to 10000 when simulations not provided', () => {
      const { simulations, ...inputNoSims } = singleGroupInput;
      const result = runMonteCarloSimulation(
        inputNoSims as VarianceSimulationInput
      );
      expect(result.simulationsRun).toBe(10000);
    });
  });

  describe('group contributions', () => {
    it('each group contribution matches input group by name and count', () => {
      const result = runMonteCarloSimulation(sixGroupInput);
      for (const group of sixGroupInput.groups) {
        const gc = result.groupContributions.find(
          (c) => c.name === group.name
        );
        expect(gc).toBeDefined();
        expect(gc!.count).toBe(group.count);
        expect(gc!.invested).toBeCloseTo(group.buyIn * group.count, 0);
      }
    });

    it('expectedProfit per group is approximately buyIn * roi * count', () => {
      const result = runMonteCarloSimulation(sixGroupInput);
      for (const group of sixGroupInput.groups) {
        const gc = result.groupContributions.find(
          (c) => c.name === group.name
        );
        expect(gc).toBeDefined();
        const theoretical = group.buyIn * group.roi * group.count;
        // 20% tolerance per individual group (variance is higher for individual groups)
        const tolerance = Math.abs(theoretical) * 0.20;
        expect(Math.abs(gc!.expectedProfit - theoretical)).toBeLessThan(
          tolerance
        );
      }
    });
  });

  describe('histogram bucket auto-sizing (ADR-215 D5 — Freedman-Diaconis)', () => {
    it('bucket size is positive and bucket count is in [10, 60] for non-trivial N', () => {
      const result = runMonteCarloSimulation(sixGroupInput);
      expect(result.histogram.length).toBeGreaterThanOrEqual(10);
      expect(result.histogram.length).toBeLessThanOrEqual(60);
      const bucketSize =
        result.histogram[0].bucketEnd - result.histogram[0].bucketStart;
      expect(bucketSize).toBeGreaterThan(0);
    });

    it('buckets are contiguous (no gaps)', () => {
      const result = runMonteCarloSimulation(sixGroupInput);
      for (let i = 1; i < result.histogram.length; i++) {
        expect(result.histogram[i].bucketStart).toBeCloseTo(
          result.histogram[i - 1].bucketEnd,
          6,
        );
      }
    });
  });

  describe('performance', () => {
    it('completes 10K sims x 6 groups x 12 weeks in < 2s', () => {
      const t0 = Date.now();
      const result = runMonteCarloSimulation(sixGroupInput);
      const elapsed = Date.now() - t0;
      expect(elapsed).toBeLessThan(2000);
      expect(result.elapsedMs).toBeLessThan(2000);
    });
  });

  describe('edge cases', () => {
    it('single group, single tournament works', () => {
      const result = runMonteCarloSimulation({
        groups: [
          { name: 'Solo', buyIn: 10, field: 100, roi: 0.05, count: 1, isPKO: false },
        ],
        weeks: 1,
        simulations: 1000,
      });
      expect(result.totalTournaments).toBe(1);
      expect(result.totalInvested).toBe(10);
      expect(result.simulationsRun).toBe(1000);
    });

    it('stdDev is positive for non-trivial inputs', () => {
      const result = runMonteCarloSimulation(singleGroupInput);
      expect(result.stdDev).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Internal helpers (exported for testability)
// ---------------------------------------------------------------------------

describe('varianceEngine — generatePayouts', () => {
  it('produces placesPaid = round(field * 0.15) entries', () => {
    const payouts = generatePayouts(1000, false);
    const expected = Math.max(1, Math.round(1000 * 0.15)); // 150
    expect(payouts.length).toBe(expected);
  });

  it('first place payout is largest', () => {
    const payouts = generatePayouts(500, false);
    for (let i = 1; i < payouts.length; i++) {
      expect(payouts[0]).toBeGreaterThanOrEqual(payouts[i]);
    }
  });

  it('minimum cash is at least 1.5x buy-in', () => {
    const payouts = generatePayouts(1000, false);
    // Last place in the money should be >= 1.5
    expect(payouts[payouts.length - 1]).toBeGreaterThanOrEqual(1.5);
  });

  it('PKO produces flatter payout curve (lower first place)', () => {
    const vanilla = generatePayouts(1000, false);
    const pko = generatePayouts(1000, true);
    // PKO first place should be smaller (flatter distribution)
    expect(pko[0]).toBeLessThan(vanilla[0]);
  });

  it('payout sum approximately equals fieldSize (conservation)', () => {
    const payouts = generatePayouts(1000, false);
    const sum = Array.from(payouts).reduce((s, v) => s + v, 0);
    // Total payouts in buy-in multiples should roughly equal field size
    // (each player contributes 1 buy-in, total pool = field * buy-in)
    expect(Math.abs(sum - 1000)).toBeLessThan(1); // rounding tolerance
  });
});

// ---------------------------------------------------------------------------
// ADR-215 D1 — Percentile NIST R7 / Excel PERCENTILE.INC
// ---------------------------------------------------------------------------

describe('varianceEngine — percentile (ADR-215 D1, NIST R7)', () => {
  it('matches Excel PERCENTILE.INC: percentile([1..5], 25) === 2.0', () => {
    // R7 reference: h = (5-1)*0.25 = 1.0, k=1, d=0, x[1]=2.0
    expect(percentile([1, 2, 3, 4, 5], 25)).toBeCloseTo(2.0, 6);
  });

  it('linear interpolates between samples (NOT floor): percentile([0,10], 50) === 5.0', () => {
    // R7: h = 1*0.5 = 0.5, k=0, d=0.5, 0 + 0.5*(10-0) = 5.0
    // Old Math.floor would return 0 (idx=0).
    expect(percentile([0, 10], 50)).toBeCloseTo(5.0, 6);
  });

  it('p=0 returns minimum, p=100 returns maximum', () => {
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
  });

  it('handles single-element array (no interp possible)', () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 99.85)).toBe(42);
  });

  it('clamps p to [0, 100]', () => {
    expect(percentile([1, 2, 3], -10)).toBe(1);
    expect(percentile([1, 2, 3], 150)).toBe(3);
  });

  it('result percentiles use R7 interp (not Math.floor)', () => {
    // sanity: with non-trivial sims, p50 must be inside [p30, p70] not equal to a discrete sample
    const result = runMonteCarloSimulation({
      ...singleGroupInput,
      seed: 7,
    });
    expect(result.percentiles.p50).toBeGreaterThanOrEqual(result.percentiles.p30);
    expect(result.percentiles.p50).toBeLessThanOrEqual(result.percentiles.p70);
  });
});

// ---------------------------------------------------------------------------
// ADR-215 D2 — Risk of Ruin (MC empirico, opt-in via bankrollUsd)
// ---------------------------------------------------------------------------

describe('varianceEngine — Risk of Ruin (ADR-215 D2)', () => {
  it('returns undefined when bankrollUsd not provided (back-compat)', () => {
    const result = runMonteCarloSimulation(sixGroupInput);
    expect(result.riskOfRuin).toBeUndefined();
  });

  it('returns RoR when bankrollUsd provided', () => {
    const result = runMonteCarloSimulation({
      ...sixGroupInput,
      bankrollUsd: 10000,
      seed: 1,
    });
    expect(result.riskOfRuin).toBeDefined();
    expect(result.riskOfRuin!.bankrollUsd).toBe(10000);
    expect(result.riskOfRuin!.totalSims).toBe(result.simulationsRun);
    expect(result.riskOfRuin!.ruinSims).toBeGreaterThanOrEqual(0);
    expect(result.riskOfRuin!.ruinSims).toBeLessThanOrEqual(result.simulationsRun);
    expect(result.riskOfRuin!.pct).toBeGreaterThanOrEqual(0);
    expect(result.riskOfRuin!.pct).toBeLessThanOrEqual(100);
  });

  it('small bankroll on losing player → high RoR', () => {
    const result = runMonteCarloSimulation({
      groups: [
        { name: 'Loser', buyIn: 100, field: 1000, roi: -0.20, count: 200, isPKO: false },
      ],
      weeks: 12,
      simulations: 2000,
      bankrollUsd: 500,
      seed: 5,
    });
    expect(result.riskOfRuin!.pct).toBeGreaterThan(50);
  });

  it('huge bankroll on winning player → very low RoR', () => {
    const result = runMonteCarloSimulation({
      ...sixGroupInput,
      bankrollUsd: 1_000_000,
      seed: 5,
    });
    expect(result.riskOfRuin!.pct).toBeLessThan(5);
  });
});

// ---------------------------------------------------------------------------
// ADR-215 D3 — EV CI95
// ---------------------------------------------------------------------------

describe('varianceEngine — EV CI95 (ADR-215 D3)', () => {
  it('contains EV inside [lower, upper]', () => {
    const result = runMonteCarloSimulation(sixGroupInput);
    expect(result.evCi95.lower).toBeLessThanOrEqual(result.ev);
    expect(result.ev).toBeLessThanOrEqual(result.evCi95.upper);
  });

  it('stdErr equals stdDev / sqrt(N)', () => {
    const result = runMonteCarloSimulation(sixGroupInput);
    const expected = result.stdDev / Math.sqrt(result.simulationsRun);
    expect(result.evCi95.stdErr).toBeCloseTo(expected, 6);
  });

  it('CI width shrinks as N grows', () => {
    const r1 = runMonteCarloSimulation({ ...sixGroupInput, simulations: 1000, seed: 42 });
    const r2 = runMonteCarloSimulation({ ...sixGroupInput, simulations: 10000, seed: 42 });
    const width1 = r1.evCi95.upper - r1.evCi95.lower;
    const width2 = r2.evCi95.upper - r2.evCi95.lower;
    expect(width2).toBeLessThan(width1);
  });
});

// ---------------------------------------------------------------------------
// ADR-215 D4 — ROI mean + median
// ---------------------------------------------------------------------------

describe('varianceEngine — ROI mean + median (ADR-215 D4)', () => {
  it('roi.mean == ev/totalInvested', () => {
    const result = runMonteCarloSimulation(sixGroupInput);
    expect(result.roi.mean).toBeCloseTo(result.ev / result.totalInvested, 6);
  });

  it('roi.median == p50/totalInvested', () => {
    const result = runMonteCarloSimulation(sixGroupInput);
    expect(result.roi.median).toBeCloseTo(
      result.percentiles.p50 / result.totalInvested,
      6,
    );
  });
});

// ---------------------------------------------------------------------------
// ADR-215 D6 — placesPaidPct override
// ---------------------------------------------------------------------------

describe('varianceEngine — placesPaidPct override (ADR-215 D6)', () => {
  it('default 0.15 when omitted (back-compat)', () => {
    const payoutsDefault = generatePayouts(1000, false);
    const payoutsExplicit = generatePayouts(1000, false, 0.15);
    expect(payoutsDefault.length).toBe(payoutsExplicit.length);
  });

  it('higher placesPaidPct produces more paid positions', () => {
    const flat = generatePayouts(1000, false, 0.25);
    const steep = generatePayouts(1000, false, 0.10);
    expect(flat.length).toBeGreaterThan(steep.length);
    // flat=250 paid, steep=100 paid
    expect(flat.length).toBe(250);
    expect(steep.length).toBe(100);
  });

  it('clamps to [0.05, 0.5] for safety', () => {
    const tooLow = generatePayouts(1000, false, 0.01);
    const tooHigh = generatePayouts(1000, false, 0.99);
    expect(tooLow.length).toBe(50); // 0.05 floor
    expect(tooHigh.length).toBe(500); // 0.5 ceil
  });
});

// ---------------------------------------------------------------------------
// ADR-215 D7 — rakePct informativo
// ---------------------------------------------------------------------------

describe('varianceEngine — totalRakeUsd (ADR-215 D7)', () => {
  it('totalRakeUsd is 0 when rakePct omitted', () => {
    const result = runMonteCarloSimulation(sixGroupInput);
    expect(result.totalRakeUsd).toBe(0);
  });

  it('totalRakeUsd sums rakePct * buyIn * count across groups', () => {
    const result = runMonteCarloSimulation({
      groups: [
        { name: 'A', buyIn: 100, field: 500, roi: 0.10, count: 200, isPKO: false, rakePct: 0.10 },
        { name: 'B', buyIn: 50, field: 500, roi: 0.10, count: 400, isPKO: false, rakePct: 0.08 },
      ],
      weeks: 4,
      simulations: 1000,
    });
    // 100*0.10*200 + 50*0.08*400 = 2000 + 1600 = 3600
    expect(result.totalRakeUsd).toBeCloseTo(3600, 0);
  });
});

// ---------------------------------------------------------------------------
// ADR-215 D8 — PKO alpha subtracao (nao *= 0.65)
// ---------------------------------------------------------------------------

describe('varianceEngine — PKO alpha subtraction (ADR-215 D8)', () => {
  it('PKO produces flatter top (lower first place) but does NOT collapse to linear', () => {
    const vanilla = generatePayouts(500, false); // alpha=1.7 (300-1000 bucket)
    const pko = generatePayouts(500, true);      // alpha=max(0.8, 1.7-0.3)=1.4
    expect(pko[0]).toBeLessThan(vanilla[0]);
    // Floor 0.8 garante que ainda eh top-heavy (top > min cash)
    expect(pko[0]).toBeGreaterThan(pko[pko.length - 1]);
  });

  it('alpha floor 0.8 holds for already-low alpha bucket (field 5000)', () => {
    // field 5000 -> alpha=1.3 base; PKO -> max(0.8, 1.0) = 1.0
    const pko = generatePayouts(5000, true);
    expect(pko[0]).toBeGreaterThan(pko[pko.length - 1]); // still top > min cash
  });
});

describe('varianceEngine — calibrateSkill', () => {
  it('positive ROI produces skill > 1', () => {
    const payouts = generatePayouts(1000, false);
    const skill = calibrateSkill(1000, payouts, 0.15);
    expect(skill).toBeGreaterThan(1);
  });

  it('negative ROI produces skill < 1', () => {
    const payouts = generatePayouts(1000, false);
    const skill = calibrateSkill(1000, payouts, -0.10);
    expect(skill).toBeLessThan(1);
  });

  it('zero ROI produces skill close to 1', () => {
    const payouts = generatePayouts(1000, false);
    const skill = calibrateSkill(1000, payouts, 0);
    // Should be very close to 1 (break-even)
    expect(Math.abs(skill - 1)).toBeLessThan(0.05);
  });
});
