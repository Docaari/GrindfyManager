// =============================================================================
// varianceEngine.ts — Monte Carlo MTT Variance Simulator
//
// Native server-side engine. Originally ported from scripts/variance-sim.mjs
// (ADR-211). Math calibration refinements per ADR-215 (2026-05-29):
//   D1. Percentile = NIST R7 (linear interp; Excel PERCENTILE.INC paridade)
//   D2. Risk of Ruin = MC empirico (count(min cumProfit <= -BR) / N)
//   D3. EV CI95 = ±1.96 * sigma / sqrt(N) (CLT no estimador MC)
//   D4. Mediana ROI ao lado de Mean ROI (gap revela skew)
//   D5. Histogram = Freedman-Diaconis (h = 2*IQR/n^(1/3); clamp [10,60])
//   D6. ITM% override por bucket (placesPaidPct? — default 0.15)
//   D7. Rake explicito por bucket (rakePct? — informativo, reportado em rakeUsd)
//   D8. PKO alpha = max(0.8, alpha - 0.3) (subtracao, nao multiplicacao 0.65)
//
// Backward-compat: todos os campos novos no input sao OPCIONAIS; defaults
// preservam comportamento atual exceto D1 (percentile interp) e D8 (PKO).
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PayoutStructure = "standard" | "flat" | "topheavy" | "satellite";

export interface VarianceSimulationInput {
  groups: Array<{
    name: string;
    buyIn: number;          // USD
    field: number;          // avg field size
    roi: number;            // decimal (0.15 = 15%)
    count: number;          // total tournaments in period
    isPKO: boolean;
    placesPaidPct?: number; // ADR-215 D6 — override default 0.15
    rakePct?: number;       // ADR-216 — rake no custo + calibração
    payoutStructure?: PayoutStructure; // ADR-217 — standard|flat|topheavy|satellite
    avgEntries?: number;    // ADR-217 — re-entry: bullets médios por torneio (default 1)
  }>;
  weeks: number;            // 1 | 4 | 12 | 52
  simulations?: number;     // default 10000, clamp [1000, 50000]
  seed?: number;            // optional, for reproducibility
  bankrollUsd?: number;     // ADR-215 D2 — habilita RoR
}

export interface VarianceSimulationResult {
  ev: number;
  stdDev: number;
  evCi95: { lower: number; upper: number; stdErr: number }; // ADR-215 D3
  profitablePct: number;
  roi: { mean: number; median: number };                    // ADR-215 D4
  totalTournaments: number;
  totalInvested: number;
  totalRakeUsd: number;                                     // ADR-215 D7
  riskOfRuin?: {                                            // ADR-215 D2
    pct: number;
    bankrollUsd: number;
    ruinSims: number;
    totalSims: number;
  };
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
// ADR-215 D6: placesPaidPct override (default 0.15)
// ADR-215 D8: PKO alpha = max(0.8, alpha - 0.3) (subtracao, nao *= 0.65)
// ---------------------------------------------------------------------------

export function generatePayouts(
  fieldSize: number,
  isPKO: boolean,
  placesPaidPct: number = 0.15,
  structure: PayoutStructure = "standard",
): Float64Array {
  const safePct = Math.min(0.5, Math.max(0.05, placesPaidPct));
  const placesPaid = Math.max(1, Math.round(fieldSize * safePct));

  // ADR-217: Satélite = payout FLAT — todos os assentos pagos valem igual
  // (pool / nº assentos). Variância vem só de cashar ou não; sem long-tail.
  if (structure === "satellite") {
    const seat = fieldSize / placesPaid;
    const flat = new Float64Array(placesPaid);
    flat.fill(seat);
    return flat; // soma = fieldSize (conservação do pool)
  }

  let alpha: number;
  if (fieldSize < 300) alpha = 2.0;
  else if (fieldSize < 1000) alpha = 1.7;
  else if (fieldSize < 3000) alpha = 1.5;
  else alpha = 1.3;
  // ADR-217: estrutura ajusta o expoente (flat = mais achatado / mais ITM
  // efetivo; topheavy = mais concentrado no topo). MTTDB steepness análogo.
  if (structure === "flat") alpha *= 0.6;
  else if (structure === "topheavy") alpha *= 1.35;
  // ADR-215 D8: PKO achata expoente subtraindo, com floor 0.8
  if (isPKO) alpha = Math.max(0.8, alpha - 0.3);

  const raw: number[] = [];
  let rawSum = 0;
  for (let i = 0; i < placesPaid; i++) {
    const val = Math.pow((placesPaid - i) / placesPaid, alpha);
    raw.push(val);
    rawSum += val;
  }

  const payouts = new Float64Array(placesPaid);
  for (let i = 0; i < placesPaid; i++) {
    payouts[i] = (raw[i] / rawSum) * fieldSize;
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
  rakePct: number = 0,
  avgEntries: number = 1,
): number {
  const N = fieldSize;
  const P = payouts.length;
  // ADR-216/217: target de expected-payout (em unidades de buy-in / pool)
  // precisa cobrir o custo real = (1+rake)*avgEntries. Net ROI =
  // (E[payout]-cost)/cost. Logo E[payout] = (1+rake)*avgEntries*(1+ROI).
  // rakePct=0 + avgEntries=1 -> target = (1+ROI) (back-compat).
  const safeEntries = avgEntries > 0 ? avgEntries : 1;
  const target = (1 + rakePct) * safeEntries * (1 + targetROI);

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
// Percentile — ADR-215 D1 — NIST R7 / Excel PERCENTILE.INC / numpy default
// p in [0, 100]. Returns linear-interpolated value within sorted range.
// ---------------------------------------------------------------------------

export function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const pp = Math.min(100, Math.max(0, p));
  const h = ((n - 1) * pp) / 100; // rank position, 0-based
  const k = Math.floor(h);
  const d = h - k;
  if (k + 1 >= n) return sorted[n - 1];
  return sorted[k] + d * (sorted[k + 1] - sorted[k]);
}

// ---------------------------------------------------------------------------
// Histogram bucket sizing — ADR-215 D5 — Freedman-Diaconis with UI clamp
// ---------------------------------------------------------------------------

function chooseBucketCount(sorted: number[]): number {
  const n = sorted.length;
  if (n < 100) {
    // Sturges fallback for small samples
    return Math.max(1, Math.ceil(Math.log2(Math.max(n, 2))) + 1);
  }
  const min = sorted[0];
  const max = sorted[n - 1];
  const range = max - min;
  if (range <= 0) return 1;

  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  if (iqr <= 0) return 15; // degenerate fallback

  const h = (2 * iqr) / Math.pow(n, 1 / 3);
  const kRaw = Math.ceil(range / h);
  return Math.min(60, Math.max(10, kRaw));
}

// ---------------------------------------------------------------------------
// Main: runMonteCarloSimulation
// ---------------------------------------------------------------------------

export function runMonteCarloSimulation(
  input: VarianceSimulationInput,
): VarianceSimulationResult {
  const t0 = Date.now();

  let simCount = input.simulations ?? 10000;
  if (simCount < 1000) simCount = 1000;
  if (simCount > 50000) simCount = 50000;

  const weeks = input.weeks;
  const random = createRng(input.seed);
  const bankroll = input.bankrollUsd;

  const prepared = input.groups.map((g) => {
    const placesPaidPct = g.placesPaidPct ?? 0.15;
    const rakePct = g.rakePct ?? 0;
    const avgEntries = g.avgEntries && g.avgEntries > 0 ? g.avgEntries : 1;
    const structure: PayoutStructure = g.payoutStructure ?? "standard";
    const payouts = generatePayouts(g.field, g.isPKO, placesPaidPct, structure);
    // ADR-216/217: custo real = (1+rake)*avgEntries; entra na calibração.
    const costFactor = (1 + rakePct) * avgEntries;
    const skill = calibrateSkill(g.field, payouts, g.roi, rakePct, avgEntries);
    return { ...g, payouts, skill, rakePct, avgEntries, costFactor };
  });

  const totalTournaments = input.groups.reduce((s, g) => s + g.count, 0);
  // ADR-216/217: totalInvested = custo REAL (buyIn*costFactor*count), onde
  // costFactor = (1+rake)*avgEntries. Tudo default -> buyIn*count (back-compat).
  const totalInvested = prepared.reduce(
    (s, g) => s + g.buyIn * g.costFactor * g.count,
    0,
  );
  const totalRakeUsd = prepared.reduce(
    (s, g) => s + g.rakePct * g.buyIn * g.avgEntries * g.count,
    0,
  );

  const groupProfitSums = new Float64Array(input.groups.length);
  const results = new Float64Array(simCount);
  const maxDDs = new Float64Array(simCount);
  let ruinCount = 0;

  for (let sim = 0; sim < simCount; sim++) {
    let total = 0;
    const weekProfits = new Float64Array(weeks);

    for (let gi = 0; gi < prepared.length; gi++) {
      const p = prepared[gi];
      let groupProfit = 0;
      for (let w = 0; w < weeks; w++) {
        const base = Math.floor(p.count / weeks);
        const extra = p.count % weeks;
        const tournsThisWeek = base + (w < extra ? 1 : 0);
        // ADR-216/217: custo por torneio = (1+rake)*avgEntries. Bustar perde o custo.
        const cost = p.costFactor;
        for (let t = 0; t < tournsThisWeek; t++) {
          const pos = Math.ceil(p.field * Math.pow(random(), p.skill));
          const profit =
            pos <= p.payouts.length
              ? (p.payouts[pos - 1] - cost) * p.buyIn
              : -cost * p.buyIn;
          total += profit;
          groupProfit += profit;
          weekProfits[w] += profit;
        }
      }
      groupProfitSums[gi] += groupProfit;
    }

    results[sim] = total;

    // Max drawdown + min cumulative (pra RoR)
    let peak = 0;
    let cum = 0;
    let dd = 0;
    let minCum = 0;
    for (let w = 0; w < weeks; w++) {
      cum += weekProfits[w];
      if (cum > peak) peak = cum;
      const d = peak - cum;
      if (d > dd) dd = d;
      if (cum < minCum) minCum = cum;
    }
    maxDDs[sim] = dd;

    if (bankroll != null && bankroll > 0 && minCum <= -bankroll) {
      ruinCount += 1;
    }
  }

  const sorted = Array.from(results).sort((a, b) => a - b);
  const ddSorted = Array.from(maxDDs).sort((a, b) => a - b);

  const ev = sorted.reduce((s, v) => s + v, 0) / simCount;
  const stdDev = Math.sqrt(
    sorted.reduce((s, v) => s + (v - ev) ** 2, 0) / simCount,
  );

  // ADR-215 D3: EV CI95 via CLT
  const evStdErr = stdDev / Math.sqrt(simCount);
  const evCi95 = {
    lower: ev - 1.96 * evStdErr,
    upper: ev + 1.96 * evStdErr,
    stdErr: evStdErr,
  };

  const profitableCount = sorted.filter((v) => v > 0).length;
  const profitablePct = (profitableCount / simCount) * 100;

  // ADR-215 D1: percentile R7
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

  // ADR-215 D4: ROI mean + median
  const roi = {
    mean: totalInvested > 0 ? ev / totalInvested : 0,
    median: totalInvested > 0 ? percentiles.p50 / totalInvested : 0,
  };

  const ddMean = ddSorted.reduce((s, v) => s + v, 0) / simCount;
  const drawdown = {
    mean: ddMean,
    median: percentile(ddSorted, 50),
    p95: percentile(ddSorted, 95),
    p99: percentile(ddSorted, 99),
    worst: ddSorted[ddSorted.length - 1],
  };

  const groupContributions = input.groups.map((g, i) => {
    const cf = (1 + (g.rakePct ?? 0)) * (g.avgEntries && g.avgEntries > 0 ? g.avgEntries : 1);
    return {
      name: g.name,
      count: g.count,
      // ADR-216/217: invested = custo real (soma == totalInvested).
      invested: g.buyIn * cf * g.count,
      expectedProfit: groupProfitSums[i] / simCount,
    };
  });

  // ADR-215 D5: histogram Freedman-Diaconis (index-based, evita drift FP)
  const minResult = sorted[0];
  const maxResult = sorted[sorted.length - 1];
  const range = maxResult - minResult;
  const histogram: Array<{
    bucketStart: number;
    bucketEnd: number;
    count: number;
  }> = [];

  if (range <= 0) {
    histogram.push({
      bucketStart: minResult,
      bucketEnd: minResult + 1,
      count: simCount,
    });
  } else {
    const bucketCount = Math.max(1, chooseBucketCount(sorted));
    const bucketSize = range / bucketCount;
    const counts = new Array(bucketCount).fill(0);
    for (const v of sorted) {
      let idx = Math.floor((v - minResult) / bucketSize);
      if (idx >= bucketCount) idx = bucketCount - 1;
      if (idx < 0) idx = 0;
      counts[idx]++;
    }
    for (let i = 0; i < bucketCount; i++) {
      histogram.push({
        bucketStart: minResult + i * bucketSize,
        bucketEnd: minResult + (i + 1) * bucketSize,
        count: counts[i],
      });
    }
  }

  // ADR-215 D2: Risk of Ruin
  const riskOfRuin =
    bankroll != null && bankroll > 0
      ? {
          pct: (ruinCount / simCount) * 100,
          bankrollUsd: bankroll,
          ruinSims: ruinCount,
          totalSims: simCount,
        }
      : undefined;

  const elapsedMs = Date.now() - t0;

  return {
    ev,
    stdDev,
    evCi95,
    profitablePct,
    roi,
    totalTournaments,
    totalInvested,
    totalRakeUsd,
    riskOfRuin,
    percentiles,
    drawdown,
    groupContributions,
    histogram,
    simulationsRun: simCount,
    elapsedMs,
  };
}
