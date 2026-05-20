// =============================================================================
// varianceAnalysis — Sprint AI-2A (RF-06.1, ADR-166)
//
// Helper DRY entre Monthly Report (AI-1C) e tool `analyze_variance` (AI-2A).
//
// Inputs:
//   - performance: { tournaments, sampleSize, totalProfit?, totalBuyIn? }
//   - varianceVsExpected: { expectedRoi, stddevBuyIns } | null  (primedope)
//
// Output:
//   { sampleSize, observedRoi, confidenceInterval95, method: 'heuristic' | 'primedope',
//     narrative, confidence: 'high'|'medium'|'low', expectedRoi? }
//
// Heuristica fallback (lesson #10): sigmaUsd = 1.5 * stddev(daily_pnl_usd).
// Confidence: <30 = low, 30..99 = medium, >=100 = high.
// =============================================================================

export interface PerformanceLike {
  tournaments: Array<{ profit?: number; buyIn?: number; completedAt?: any; currency?: string }>;
  sampleSize: number;
  totalProfit?: number;
  totalBuyIn?: number;
}

export interface VarianceVsExpected {
  expectedRoi: number;
  stddevBuyIns: number;
}

export interface VarianceAnalysisResult {
  sampleSize: number;
  observedRoi: number | null;
  confidenceInterval95: { lower: number | null; upper: number | null };
  method: "heuristic" | "primedope";
  narrative: string;
  confidence: "high" | "medium" | "low";
  expectedRoi?: number;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiff = values.reduce((a, v) => a + (v - mean) ** 2, 0);
  return Math.sqrt(sqDiff / (values.length - 1));
}

function classifyConfidence(sampleSize: number): "high" | "medium" | "low" {
  if (sampleSize >= 100) return "high";
  if (sampleSize >= 30) return "medium";
  return "low";
}

export function computeVarianceAnalysis(input: {
  performance: PerformanceLike;
  varianceVsExpected: VarianceVsExpected | null;
}): VarianceAnalysisResult {
  const { performance, varianceVsExpected } = input;
  const sampleSize = performance.sampleSize ?? performance.tournaments?.length ?? 0;
  const confidence = classifyConfidence(sampleSize);

  if (confidence === "low") {
    return {
      sampleSize,
      observedRoi: null,
      confidenceInterval95: { lower: null, upper: null },
      method: varianceVsExpected ? "primedope" : "heuristic",
      narrative: `Amostra pequena (${sampleSize}). Resultados nao confiaveis estatisticamente.`,
      confidence: "low",
    };
  }

  const totalBuyIn = performance.totalBuyIn ?? performance.tournaments.reduce((a, t) => a + Number(t.buyIn ?? 0), 0);
  const totalProfit = performance.totalProfit ?? performance.tournaments.reduce((a, t) => a + Number(t.profit ?? 0), 0);
  const observedRoi = totalBuyIn > 0 ? (totalProfit / totalBuyIn) * 100 : 0;

  if (varianceVsExpected) {
    const expectedRoi = Number(varianceVsExpected.expectedRoi);
    const stddevBuyIns = Number(varianceVsExpected.stddevBuyIns);
    const stdErr = (stddevBuyIns * 100) / Math.sqrt(sampleSize);
    const lower = observedRoi - 1.96 * stdErr;
    const upper = observedRoi + 1.96 * stdErr;
    const within = expectedRoi >= lower && expectedRoi <= upper;
    return {
      sampleSize,
      observedRoi,
      expectedRoi,
      confidenceInterval95: { lower, upper },
      method: "primedope",
      narrative: within
        ? `Seu ROI de ${observedRoi.toFixed(1)}% esta dentro da banda esperada (${expectedRoi.toFixed(1)}% +/- IC95). E variancia, nao leak.`
        : `Seu ROI de ${observedRoi.toFixed(1)}% diverge de ${expectedRoi.toFixed(1)}% esperado. Olhar leaks.`,
      confidence,
    };
  }

  // heuristic fallback
  const dailyPnl: number[] = performance.tournaments.map((t) => Number(t.profit ?? 0));
  const sigma = stddev(dailyPnl) * 1.5;
  const stdErrRoi = totalBuyIn > 0 ? (sigma * 100) / Math.sqrt(sampleSize) : 0;
  const lower = observedRoi - 1.96 * stdErrRoi;
  const upper = observedRoi + 1.96 * stdErrRoi;

  return {
    sampleSize,
    observedRoi,
    confidenceInterval95: { lower, upper },
    method: "heuristic",
    narrative: `ROI observado ${observedRoi.toFixed(1)}% (IC95 [${lower.toFixed(1)}%, ${upper.toFixed(1)}%]). Sem baseline PrimeDope — heuristica stddev*1.5.`,
    confidence,
  };
}
