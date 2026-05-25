// =============================================================================
// Sprint VR-1 — varianceEngine.ts (RF-01)
//
// Spec  : Docs/specs/sprint-variance-reform.md (RF-01)
// ADR   : 211 (variance native monte carlo engine)
// Ref   : scripts/variance-sim.mjs (validated algorithm)
//
// Monte Carlo MTT Variance Simulator — native server-side engine.
// Port of validated algorithm from scripts/variance-sim.mjs.
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VarianceSimulationInput {
  groups: Array<{
    name: string;
    buyIn: number;      // USD
    field: number;      // avg field size
    roi: number;        // decimal (0.15 = 15%)
    count: number;      // total tournaments in period
    isPKO: boolean;
  }>;
  weeks: number;          // 1 | 4 | 12 | 52
  simulations?: number;   // default 10000, clamp [1000, 50000]
  seed?: number;          // optional, for reproducibility
}

export interface VarianceSimulationResult {
  ev: number;
  stdDev: number;
  profitablePct: number;
  totalTournaments: number;
  totalInvested: number;
  percentiles: {
    p0_15: number;
    p2_5: number;
    p15: number;
    p30: number;
    p50: number;
    p70: number;
    p85: number;
    p97_5: number;
    p99_85: number;
  };
  drawdown: {
    mean: number;
    median: number;
    p95: number;
    p99: number;
    worst: number;
  };
  groupContributions: Array<{
    name: string;
    count: number;
    invested: number;
    expectedProfit: number;
  }>;
  histogram: Array<{
    bucketStart: number;
    bucketEnd: number;
    count: number;
  }>;
  simulationsRun: number;
  elapsedMs: number;
}

// ---------------------------------------------------------------------------
// Seeded PRNG (xoshiro128** — fast, good quality, deterministic)
// ---------------------------------------------------------------------------

function createRng(seed?: number): () => number {
  if (seed == null) {
    return Math.random;
  }
  // Splitmix32 to initialize state from a single seed
  let s = seed | 0;
  function splitmix32(): number {
    s = (s + 0x9e3779b9) | 0;
    let t = s ^ (s >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    t = t ^ (t >>> 15);
    return (t >>> 0);
  }
  let a = splitmix32();
  let b = splitmix32();
  let c = splitmix32();
  let d = splitmix32();

  // xoshiro128**
  return function random(): number {
    const result = Math.imul(rotl(Math.imul(b, 5), 7), 9);
    const t = b << 9;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = rotl(d, 11);
    return (result >>> 0) / 4294967296;
  };

  function rotl(x: number, k: number): number {
    return (x << k) | (x >>> (32 - k));
  }
}

// ---------------------------------------------------------------------------
// Payout Structure Generator
// ---------------------------------------------------------------------------

export function generatePayouts(fieldSize: number, isPKO: boolean): Float64Array {
  const placesPaid = Math.max(1, Math.round(fieldSize * 0.15));
  let alpha: number;
  if (fieldSize < 300) alpha = 2.0;
  else if (fieldSize < 1000) alpha = 1.7;
  else if (fieldSize < 3000) alpha = 1.5;
  else alpha = 1.3;
  if (isPKO) alpha *= 0.65;

  const raw: number[] = [];
  let rawSum = 0;
  for (let i = 0; i < placesPaid; i++) {
    const val = Math.pow((placesPaid - i) / placesPaid, alpha);
    raw.push(val);
    rawSum += val;
  }

  const payouts = new Float64Array(placesPaid);
  for (let i = 0; i < placesPaid; i++) {
    payouts[i] = (raw[i] / rawSum) * fieldSize; // in buy-in multiples
  }

  // Enforce min cash = 1.5x buy-in
  let deficit = 0;
  for (let i = placesPaid - 1; i >= 0; i--) {
    if (payouts[i] < 1.5) {
      deficit += 1.5 - payouts[i];
      payouts[i] = 1.5;
    }
  }
  if (deficit > 0) {
    const topN = Math.max(1, Math.floor(placesPaid * 0.1));
    let topSum = 0;
    for (let i = 0; i < topN; i++) topSum += payouts[i];
    for (let i = 0; i < topN; i++) {
      payouts[i] -= deficit * (payouts[i] / topSum);
    }
  }

  return payouts;
}

// ---------------------------------------------------------------------------
// Skill Factor Calibration (binary search, 200 iterations)
// ---------------------------------------------------------------------------

export function calibrateSkill(
  fieldSize: number,
  payouts: Float64Array,
  targetROI: number,
): number {
  const N = fieldSize;
  const P = payouts.length;
  const target = 1 + targetROI;

  function computeEV(s: number): number {
    let ev = 0;
    const invS = 1 / s;
    for (let k = 1; k <= P; k++) {
      const prob = Math.pow(k / N, invS) - Math.pow((k - 1) / N, invS);
      ev += prob * payouts[k - 1];
    }
    return ev;
  }

  let lo = 0.01;
  let hi = 20.0;
  for (let iter = 0; iter < 200; iter++) {
    const mid = (lo + hi) / 2;
    if (computeEV(mid) > target) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// Percentile helper
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(
    Math.floor(sorted.length * p / 100),
    sorted.length - 1,
  );
  return sorted[idx];
}

// ---------------------------------------------------------------------------
// Main: runMonteCarloSimulation
// ---------------------------------------------------------------------------

export function runMonteCarloSimulation(
  input: VarianceSimulationInput,
): VarianceSimulationResult {
  const t0 = Date.now();

  // Clamp simulations
  let simCount = input.simulations ?? 10000;
  if (simCount < 1000) simCount = 1000;
  if (simCount > 50000) simCount = 50000;

  const weeks = input.weeks;
  const random = createRng(input.seed);

  // Precompute per-group data
  const prepared = input.groups.map((g) => {
    const payouts = generatePayouts(g.field, g.isPKO);
    const skill = calibrateSkill(g.field, payouts, g.roi);
    // Distribute count across weeks for drawdown tracking
    const perWeek = g.count / weeks;
    return { ...g, payouts, skill, perWeek };
  });

  // Totals
  const totalTournaments = input.groups.reduce((s, g) => s + g.count, 0);
  const totalInvested = input.groups.reduce(
    (s, g) => s + g.buyIn * g.count,
    0,
  );

  // Group profit accumulators (for contributions)
  const groupProfitSums = new Float64Array(input.groups.length);

  // Simulation results
  const results = new Float64Array(simCount);
  const maxDDs = new Float64Array(simCount);

  for (let sim = 0; sim < simCount; sim++) {
    let total = 0;
    const weekProfits = new Float64Array(weeks);

    for (let gi = 0; gi < prepared.length; gi++) {
      const p = prepared[gi];
      let groupProfit = 0;
      for (let w = 0; w < weeks; w++) {
        // Each week plays approximately perWeek tournaments
        // For integer distribution, handle fractional parts
        const base = Math.floor(p.count / weeks);
        const extra = p.count % weeks;
        const tournsThisWeek = base + (w < extra ? 1 : 0);
        for (let t = 0; t < tournsThisWeek; t++) {
          const pos = Math.ceil(p.field * Math.pow(random(), p.skill));
          const profit =
            pos <= p.payouts.length
              ? (p.payouts[pos - 1] - 1) * p.buyIn
              : -p.buyIn;
          total += profit;
          groupProfit += profit;
          weekProfits[w] += profit;
        }
      }
      groupProfitSums[gi] += groupProfit;
    }

    results[sim] = total;

    // Max drawdown (peak-to-valley by week)
    let peak = 0;
    let cum = 0;
    let dd = 0;
    for (let w = 0; w < weeks; w++) {
      cum += weekProfits[w];
      if (cum > peak) peak = cum;
      const d = peak - cum;
      if (d > dd) dd = d;
    }
    maxDDs[sim] = dd;
  }

  // Sort results for percentiles
  const sorted = Array.from(results).sort((a, b) => a - b);
  const ddSorted = Array.from(maxDDs).sort((a, b) => a - b);

  // EV and StdDev
  const ev = sorted.reduce((s, v) => s + v, 0) / simCount;
  const stdDev = Math.sqrt(
    sorted.reduce((s, v) => s + (v - ev) ** 2, 0) / simCount,
  );

  // Profitable %
  const profitableCount = sorted.filter((v) => v > 0).length;
  const profitablePct = (profitableCount / simCount) * 100;

  // Percentiles
  const percentiles = {
    p0_15: percentile(sorted, 0.15),
    p2_5: percentile(sorted, 2.5),
    p15: percentile(sorted, 15),
    p30: percentile(sorted, 30),
    p50: percentile(sorted, 50),
    p70: percentile(sorted, 70),
    p85: percentile(sorted, 85),
    p97_5: percentile(sorted, 97.5),
    p99_85: percentile(sorted, 99.85),
  };

  // Drawdown stats
  const ddMean = ddSorted.reduce((s, v) => s + v, 0) / simCount;
  const drawdown = {
    mean: ddMean,
    median: percentile(ddSorted, 50),
    p95: percentile(ddSorted, 95),
    p99: percentile(ddSorted, 99),
    worst: ddSorted[ddSorted.length - 1],
  };

  // Group contributions
  const groupContributions = input.groups.map((g, i) => ({
    name: g.name,
    count: g.count,
    invested: g.buyIn * g.count,
    expectedProfit: groupProfitSums[i] / simCount,
  }));

  // Histogram
  const minResult = sorted[0];
  const maxResult = sorted[sorted.length - 1];
  const range = maxResult - minResult;
  const bucketSize = Math.max(1000, Math.round(range / 15 / 1000) * 1000);
  const bucketStart = Math.floor(minResult / bucketSize) * bucketSize;
  const bucketEnd = Math.ceil(maxResult / bucketSize) * bucketSize;

  const bucketMap = new Map<number, number>();
  for (const v of sorted) {
    const b = Math.floor(v / bucketSize) * bucketSize;
    bucketMap.set(b, (bucketMap.get(b) || 0) + 1);
  }

  const histogram: Array<{ bucketStart: number; bucketEnd: number; count: number }> = [];
  for (let b = bucketStart; b < bucketEnd; b += bucketSize) {
    histogram.push({
      bucketStart: b,
      bucketEnd: b + bucketSize,
      count: bucketMap.get(b) || 0,
    });
  }

  const elapsedMs = Date.now() - t0;

  return {
    ev,
    stdDev,
    profitablePct,
    totalTournaments,
    totalInvested,
    percentiles,
    drawdown,
    groupContributions,
    histogram,
    simulationsRun: simCount,
    elapsedMs,
  };
}
