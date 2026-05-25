// Monte Carlo MTT Variance Simulator
// Same methodology as PrimeDope: position sampling + calibrated skill factor
// 10,000 simulations × 3,120 tournaments = 31.2M samples

const SIMULATIONS = 10_000;
const WEEKS = 12;

// 30 torneios/dia × 4 dias/semana = 120/semana
// Proporção mantida da grade Perfil A real (263→120 = 45.6%)
// 30 torneios/dia × 4 dias/semana = 120/semana
// Investimento real: ~$1500/dia = $6000/semana = $72000/trimestre
// ROI flat 15%
const groups = [
  { name: "G1 High mix",       buyIn: 163, field: 2200, roi: 0.15, perWeek: 5,  pko: false },
  { name: "G2 Mid Van+Myst",   buyIn: 74,  field: 700,  roi: 0.15, perWeek: 28, pko: false },
  { name: "G3 Mid PKO",        buyIn: 72,  field: 2700, roi: 0.15, perWeek: 12, pko: true  },
  { name: "G4 Low Van+Myst",   buyIn: 35,  field: 420,  roi: 0.15, perWeek: 34, pko: false },
  { name: "G5 Low PKO",        buyIn: 38,  field: 950,  roi: 0.15, perWeek: 16, pko: true  },
  { name: "G6 Entry mix",      buyIn: 18,  field: 400,  roi: 0.15, perWeek: 25, pko: false },
];

// --- Payout Structure Generator ---
// Models standard MTT payouts: top ~15% paid, power-law distribution
// PKO: flatter curve (bounties reduce top-heaviness)
function generatePayouts(fieldSize, isPKO) {
  const placesPaid = Math.max(1, Math.round(fieldSize * 0.15));
  let alpha;
  if (fieldSize < 300) alpha = 2.0;
  else if (fieldSize < 1000) alpha = 1.7;
  else if (fieldSize < 3000) alpha = 1.5;
  else alpha = 1.3;
  if (isPKO) alpha *= 0.65;

  const raw = [];
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

  // Enforce min cash = 1.5× buy-in
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
    for (let i = 0; i < topN; i++) payouts[i] -= deficit * (payouts[i] / topSum);
  }

  return payouts;
}

// --- Skill Factor Calibration ---
// Position model: pos = ceil(N × u^s), u ~ U(0,1)
// s > 1 = positive edge, s < 1 = negative edge, s = 1 = break-even
// P(pos = k) = (k/N)^(1/s) - ((k-1)/N)^(1/s)
function calibrateSkill(fieldSize, payouts, targetROI) {
  const N = fieldSize;
  const P = payouts.length;
  const target = 1 + targetROI;

  function computeEV(s) {
    let ev = 0;
    const invS = 1 / s;
    for (let k = 1; k <= P; k++) {
      const prob = Math.pow(k / N, invS) - Math.pow((k - 1) / N, invS);
      ev += prob * payouts[k - 1];
    }
    return ev;
  }

  let lo = 0.01, hi = 20.0;
  for (let iter = 0; iter < 200; iter++) {
    const mid = (lo + hi) / 2;
    if (computeEV(mid) > target) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// --- Simulation ---
function simTournament(fieldSize, buyIn, payouts, skill) {
  const pos = Math.ceil(fieldSize * Math.pow(Math.random(), skill));
  return pos <= payouts.length
    ? (payouts[pos - 1] - 1) * buyIn  // profit = (payout - 1) × buyIn
    : -buyIn;                           // busted
}

function run() {
  // Precompute
  const prepared = groups.map(g => {
    const payouts = generatePayouts(g.field, g.pko);
    const skill = calibrateSkill(g.field, payouts, g.roi);
    const total = g.perWeek * WEEKS;

    // Verify EV
    const P = payouts.length;
    let ev = 0;
    const invS = 1 / skill;
    for (let k = 1; k <= P; k++) {
      const prob = Math.pow(k / g.field, invS) - Math.pow((k - 1) / g.field, invS);
      ev += prob * payouts[k - 1];
    }
    const itmProb = Math.pow(P / g.field, invS) * 100;

    return { ...g, payouts, skill, total, calibROI: (ev - 1) * 100, itmPct: itmProb };
  });

  // Header
  const totalT = prepared.reduce((s, p) => s + p.total, 0);
  const weeklyInvest = groups.reduce((s, g) => s + g.buyIn * g.perWeek, 0);

  console.log("\n╔══════════════════════════════════════════════════════════════════════════╗");
  console.log("║          SIMULADOR DE VARIÂNCIA MTT — PERFIL A (3 MESES)               ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════╝");

  console.log("\n── CALIBRAÇÃO DOS GRUPOS ──");
  console.log("Grupo                 │ BI    │ Field │ ROI alvo │ ROI calib │ Skill │ ITM%  │ 1st Prize");
  console.log("──────────────────────┼───────┼───────┼──────────┼──────────┼───────┼───────┼──────────");
  prepared.forEach(p => {
    const first = `$${(p.payouts[0] * p.buyIn).toFixed(0)}`;
    console.log(
      `${p.name.padEnd(22)}│ $${String(p.buyIn).padStart(4)} │ ${String(p.field).padStart(5)} │ ${(p.roi*100).toFixed(1).padStart(6)}% │ ${p.calibROI.toFixed(1).padStart(7)}% │ ${p.skill.toFixed(3)} │ ${p.itmPct.toFixed(1).padStart(5)}% │ ${first}`
    );
  });

  console.log(`\n  Torneios/semana: ${groups.reduce((s,g) => s+g.perWeek, 0)} │ Total trimestre: ${totalT}`);
  console.log(`  Investimento/semana: $${weeklyInvest.toFixed(0)} │ Investimento trimestre: $${(weeklyInvest*WEEKS).toFixed(0)}`);

  // Monte Carlo
  console.log(`\n  Rodando ${SIMULATIONS.toLocaleString()} simulações...`);
  const t0 = Date.now();

  const results = new Float64Array(SIMULATIONS);
  const maxDDs = new Float64Array(SIMULATIONS);

  for (let sim = 0; sim < SIMULATIONS; sim++) {
    let total = 0;
    const weekP = new Float64Array(WEEKS);

    for (const p of prepared) {
      for (let w = 0; w < WEEKS; w++) {
        for (let t = 0; t < p.perWeek; t++) {
          const profit = simTournament(p.field, p.buyIn, p.payouts, p.skill);
          total += profit;
          weekP[w] += profit;
        }
      }
    }

    results[sim] = total;

    // Max drawdown (peak-to-valley)
    let peak = 0, cum = 0, dd = 0;
    for (let w = 0; w < WEEKS; w++) {
      cum += weekP[w];
      if (cum > peak) peak = cum;
      const d = peak - cum;
      if (d > dd) dd = d;
    }
    maxDDs[sim] = dd;
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  Concluído em ${elapsed}s\n`);

  // Sort
  const sorted = Array.from(results).sort((a, b) => a - b);
  const ddSorted = Array.from(maxDDs).sort((a, b) => a - b);

  // Stats
  const mean = sorted.reduce((s, v) => s + v, 0) / SIMULATIONS;
  const stdDev = Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / SIMULATIONS);
  const profPct = (sorted.filter(v => v > 0).length / SIMULATIONS * 100).toFixed(1);
  const pct = (p) => sorted[Math.min(Math.floor(SIMULATIONS * p / 100), SIMULATIONS - 1)];
  const ddPct = (p) => ddSorted[Math.min(Math.floor(SIMULATIONS * p / 100), SIMULATIONS - 1)];
  const avgDD = ddSorted.reduce((s, v) => s + v, 0) / SIMULATIONS;

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║              RESULTADOS — 12 SEMANAS (3 MESES)             ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Lucro médio esperado:    $${mean.toFixed(0).padStart(8)}                       ║`);
  console.log(`║  Desvio padrão (σ):       $${stdDev.toFixed(0).padStart(8)}                       ║`);
  console.log(`║  Simulações lucrativas:    ${profPct.padStart(6)}%                       ║`);
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  BANDAS DE CONFIANÇA (lucro no trimestre)                   ║");
  console.log("╠──────────────────────────────────────────────────────────────╣");
  console.log(`║  Pior caso   (0.15%):     $${pct(0.15).toFixed(0).padStart(8)}   ← 1 em 667      ║`);
  console.log(`║  Pessimista  (2.5%):      $${pct(2.5).toFixed(0).padStart(8)}   ← 1 em 40       ║`);
  console.log(`║  Ruim        (15%):       $${pct(15).toFixed(0).padStart(8)}   ← 1 em 7        ║`);
  console.log(`║  Abaixo méd  (30%):       $${pct(30).toFixed(0).padStart(8)}                    ║`);
  console.log(`║  ──── Mediana (50%): ──── $${pct(50).toFixed(0).padStart(8)} ───────────────── ║`);
  console.log(`║  Acima méd   (70%):       $${pct(70).toFixed(0).padStart(8)}                    ║`);
  console.log(`║  Bom         (85%):       $${pct(85).toFixed(0).padStart(8)}   ← 1 em 7        ║`);
  console.log(`║  Otimista    (97.5%):     $${pct(97.5).toFixed(0).padStart(8)}   ← 1 em 40       ║`);
  console.log(`║  Melhor caso (99.85%):    $${pct(99.85).toFixed(0).padStart(8)}   ← 1 em 667      ║`);
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  DRAWDOWN MÁXIMO (pico → vale durante o trimestre)          ║");
  console.log("╠──────────────────────────────────────────────────────────────╣");
  console.log(`║  Drawdown médio:          $${avgDD.toFixed(0).padStart(8)}                       ║`);
  console.log(`║  Drawdown mediano:        $${ddPct(50).toFixed(0).padStart(8)}                       ║`);
  console.log(`║  Drawdown 95%:            $${ddPct(95).toFixed(0).padStart(8)}   ← esperar isso  ║`);
  console.log(`║  Drawdown 99%:            $${ddPct(99).toFixed(0).padStart(8)}   ← raro          ║`);
  console.log(`║  Pior drawdown:           $${ddPct(100).toFixed(0).padStart(8)}                       ║`);
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  CONTRIBUIÇÃO POR GRUPO (valor esperado trimestral)         ║");
  console.log("╠──────────────────────────────────────────────────────────────╣");
  let evTotal = 0;
  prepared.forEach(p => {
    const ev = p.buyIn * p.roi * p.total;
    evTotal += ev;
    const sign = ev >= 0 ? "+" : "";
    console.log(`║  ${p.name.padEnd(20)} ${String(p.total).padStart(4)}t │ ${sign}$${ev.toFixed(0).padStart(6)}             ║`);
  });
  console.log(`║  ${"TOTAL".padEnd(20)} ${String(totalT).padStart(4)}t │ ${evTotal >= 0 ? "+" : ""}$${evTotal.toFixed(0).padStart(6)}             ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");

  // Histogram
  console.log("\n── HISTOGRAMA DE RESULTADOS ──");
  const bucketSize = 5000;
  const minVal = Math.floor(sorted[0] / bucketSize) * bucketSize;
  const maxVal = Math.ceil(sorted[SIMULATIONS - 1] / bucketSize) * bucketSize;
  const buckets = new Map();
  for (const v of sorted) {
    const b = Math.floor(v / bucketSize) * bucketSize;
    buckets.set(b, (buckets.get(b) || 0) + 1);
  }
  const maxCount = Math.max(...buckets.values());
  const barWidth = 40;
  for (let b = minVal; b <= maxVal; b += bucketSize) {
    const count = buckets.get(b) || 0;
    const bar = "█".repeat(Math.round(count / maxCount * barWidth));
    const label = `${b >= 0 ? "+" : ""}$${(b/1000).toFixed(0)}k..${((b+bucketSize)/1000).toFixed(0)}k`;
    console.log(`  ${label.padStart(14)} │${bar} ${count}`);
  }
}

run();
