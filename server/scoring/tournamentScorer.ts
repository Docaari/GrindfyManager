/**
 * Tournament Selector — Tournament Scorer (RF-02)
 *
 * Funcao pura `computeTournamentScore(tournament, bundle, options)` que cruza
 * a oferta do dia com o bundle de analytics do jogador e produz:
 *   { score, grade, confidence, rationale, signals, warnings }
 *
 * Algoritmo:
 *   1. Para cada um dos 7 sinais, calcular bucketScore = clamp(50 + roi*2, 0, 100)
 *   2. Aplicar shrinkage Bayesian (K=30) para low-sample
 *   3. Combinar via pesos hardcoded (somam 1.0)
 *   4. Redistribuir peso de sinais com input null (fieldSizeEstimate / category Q6)
 *   5. Cold start <20 -> heuristica Speed x Field x TimeOfDay (Q5)
 *   6. Cold start 20-49 -> algoritmo full + flag lowConfidence
 *   7. Cold start >=50 -> algoritmo full
 *
 * Spec: docs/specs/tournament-selector.md (RF-02)
 * Decisoes: docs/architecture/decisions/015-scoring-linear-vs-ml.md
 */

import {
  WEIGHTS,
  SHRINK_CONSTANT,
  GRADE_THRESHOLDS,
  COLD_START_PURE_THRESHOLD,
  COLD_START_PARTIAL_THRESHOLD,
  COLD_START_BONUSES,
} from "./scoringConstants";

import type {
  PlayerAnalyticsBundle,
  ScoringInputTournament,
  TournamentScoreResult,
  ScoringSignal,
  ScoringSignals,
  GradeLetter,
  ConfidenceLevel,
} from "../../shared/scoring";

// Re-export types for tests that import them from this module
export type { PlayerAnalyticsBundle, ScoringInputTournament, TournamentScoreResult };

export interface ScoringOptions {
  lookbackDays?: number;
}

// =============================================================================
// Helpers puros
// =============================================================================

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function roiToBucketScore(roi: number): number {
  return clamp(50 + roi * 2, 0, 100);
}

function shrink(bucketScore: number, sample: number): number {
  const numerator = (bucketScore * sample) + (50 * SHRINK_CONSTANT);
  const denom = sample + SHRINK_CONSTANT;
  return numerator / denom;
}

function makeSignal(value: number, sample: number, weight: number): ScoringSignal {
  if (sample <= 0) {
    // sem dados: score do bucket = 50 (prior puro apos shrinkage com sample 0)
    return { value: 0, sample: 0, weight, score: 50 };
  }
  const bucketScore = roiToBucketScore(value);
  const shrunk = shrink(bucketScore, sample);
  return {
    value,
    sample,
    weight,
    score: Math.round(shrunk),
  };
}

function emptySignal(weight: number): ScoringSignal {
  return { value: 0, sample: 0, weight, score: 50 };
}

// =============================================================================
// Cold start <20: heuristica fixa Speed x Field x TimeOfDay (Q5)
//
// Formula: clamp(50 + speedBonus + fieldBonus + timeBonus - hyperMassivoPenalty, 0, 75)
//
// Anchors da spec:
//   - "Normal+medio+noite-nobre = 75"  -> reproduzido pelo cap em 75
//     (50 + speed:15 + field:10 + time:5 = 80 -> clamp para 75).
//   - "Hyper+massivo+madrugada = 25"   -> reproduzido via hyperMassivoPenalty=-10
//     (50 + speed:-10 + field:-5 + time:0 - 10 = 25). Sem essa penalidade extra
//     uma combinacao linear pura daria 35.
//
// INFO #12: a penalidade Hyper+massivo modela uma INTERACAO nao-linear entre
// dois sinais de alta variancia (formato Hyper aumenta variancia E field massivo
// reduz a chance de cravar um premio compensador). A literatura de scoring
// linear nao captura interacoes naturalmente; a penalidade fixa e uma aproximacao
// pragmatica calibrada pelos anchors da spec. Ver ADR-015 para o trade-off entre
// modelo linear e abordagens com termos de interacao (ML/GBM).
// =============================================================================
function computeColdStartScore(t: ScoringInputTournament): number {
  const speedBonus = COLD_START_BONUSES.speed[t.speed] ?? 0;
  const fieldBonus = t.fieldBucket ? (COLD_START_BONUSES.field[t.fieldBucket] ?? 0) : 0;
  const timeBonus = t.timeOfDayBucket ? (COLD_START_BONUSES.timeOfDay[t.timeOfDayBucket] ?? 0) : 0;

  // Variance synergy penalty: Hyper + massivo (alta variancia ja penalizada por field;
  // anchor da spec "Hyper+massivo+madrugada=25" requer essa penalidade extra de -10).
  // Ver INFO #12 acima e ADR-015.
  const hyperMassivoPenalty = (t.speed === "Hyper" && t.fieldBucket === "massivo") ? 10 : 0;

  const sum = 50 + speedBonus + fieldBonus + timeBonus - hyperMassivoPenalty;

  // Cap upper a 75 (anchor: Normal+medio+nobre=75 mesmo somando 80 puro)
  // Floor 0 (per spec "clamp 0-100"; anchor da spec garante 25 via penalty acima)
  return clamp(sum, 0, 75);
}

function buildColdStartSignals(): ScoringSignals {
  return {
    siteRoi: { value: 0, sample: 0, weight: WEIGHTS.siteRoi, score: 50 },
    buyInRoi: { value: 0, sample: 0, weight: WEIGHTS.buyInRoi, score: 50 },
    categoryRoi: { value: 0, sample: 0, weight: WEIGHTS.categoryRoi, score: 50 },
    speedRoi: { value: 0, sample: 0, weight: WEIGHTS.speedRoi, score: 50 },
    dayOfWeekRoi: { value: 0, sample: 0, weight: WEIGHTS.dayOfWeekRoi, score: 50 },
    timeOfDayRoi: { value: 0, sample: 0, weight: WEIGHTS.timeOfDayRoi, score: 50 },
    fieldRoi: { value: 0, sample: 0, weight: WEIGHTS.fieldRoi, score: 50 },
  };
}

function scoreToGrade(score: number): GradeLetter {
  if (score >= GRADE_THRESHOLDS.S) return "S";
  if (score >= GRADE_THRESHOLDS.A) return "A";
  if (score >= GRADE_THRESHOLDS.B) return "B";
  if (score >= GRADE_THRESHOLDS.C) return "C";
  return "D";
}

// =============================================================================
// Lookup helpers (encontra bucket no bundle por nome)
// =============================================================================
function findSiteBucket(bundle: PlayerAnalyticsBundle, site: string) {
  return bundle.bySite.find((b) => b.site === site);
}
function findBuyInBucket(bundle: PlayerAnalyticsBundle, range: string) {
  return bundle.byBuyIn.find((b) => b.range === range);
}
function findCategoryBucket(bundle: PlayerAnalyticsBundle, category: string | null) {
  if (!category) return undefined;
  return bundle.byCategory.find((b) => b.category === category);
}
function findSpeedBucket(bundle: PlayerAnalyticsBundle, speed: string) {
  return bundle.bySpeed.find((b) => b.speed === speed);
}
function findDayOfWeekBucket(bundle: PlayerAnalyticsBundle, dow: number) {
  return bundle.byDayOfWeek.find((b) => b.dayOfWeek === dow);
}
function findTimeOfDayBucket(bundle: PlayerAnalyticsBundle, bucket: string | null) {
  if (!bucket) return undefined;
  return bundle.byTimeOfDay.find((b) => b.bucket === bucket);
}
function findFieldBucket(bundle: PlayerAnalyticsBundle, fieldBucket: string | null) {
  if (!fieldBucket) return undefined;
  return bundle.byField.find((b) => b.range === fieldBucket);
}

// =============================================================================
// Rationale builder
// =============================================================================
const SIGNAL_NAME_PT: Record<keyof ScoringSignals, string> = {
  siteRoi: "site",
  buyInRoi: "buy-in",
  categoryRoi: "categoria",
  speedRoi: "velocidade",
  dayOfWeekRoi: "dia",
  timeOfDayRoi: "horario",
  fieldRoi: "field",
};

function buildRationale(
  signals: ScoringSignals,
  lookbackDays: number,
): string {
  // Top signal: maior contribuicao (score * weight) que NAO seja siteRoi
  let topKey: keyof ScoringSignals | null = null;
  let topContrib = -Infinity;
  for (const k of Object.keys(signals) as Array<keyof ScoringSignals>) {
    if (k === "siteRoi") continue;
    const s = signals[k];
    if (s.weight === 0) continue;
    const contrib = s.score * s.weight;
    if (contrib > topContrib) {
      topContrib = contrib;
      topKey = k;
    }
  }

  const lookbackLabel = `${lookbackDays}d`;

  if (!topKey) {
    return `Sample baixo em todos os buckets. Score baseado em poucos dados — aumente o historico para personalizar.`.slice(0, 200);
  }

  const top = signals[topKey];
  const topName = SIGNAL_NAME_PT[topKey];
  const roiPct = Number.isFinite(top.value) ? top.value.toFixed(1) : "0.0";
  let s = `ROI ${roiPct}% em ${topName} (${top.sample} amostras, ${lookbackLabel}).`;

  // Second sentence: highlight strongest positive (>10% with >=30 sample) OR alert (-10% with >=30)
  let secondKey: keyof ScoringSignals | null = null;
  let secondScore = 0;
  for (const k of Object.keys(signals) as Array<keyof ScoringSignals>) {
    if (k === topKey || k === "siteRoi") continue;
    const sig = signals[k];
    if (sig.weight === 0) continue;
    if (sig.sample >= 30 && (sig.value > 10 || sig.value < -10)) {
      // pick by absolute strength
      const strength = Math.abs(sig.value);
      if (strength > secondScore) {
        secondScore = strength;
        secondKey = k;
      }
    }
  }
  if (secondKey) {
    const sec = signals[secondKey];
    const secName = SIGNAL_NAME_PT[secondKey];
    const secRoi = sec.value.toFixed(1);
    if (sec.value > 10) {
      s += ` Bom desempenho em ${secName} (ROI ${secRoi}%).`;
    } else {
      s += ` Atencao: ROI ${secRoi}% em ${secName} (${sec.sample} amostras).`;
    }
  }

  return s.slice(0, 200);
}

// =============================================================================
// Main: computeTournamentScore
// =============================================================================
export function computeTournamentScore(
  tournament: ScoringInputTournament,
  bundle: PlayerAnalyticsBundle,
  options: ScoringOptions = {},
): TournamentScoreResult {
  const lookbackDays = options.lookbackDays ?? bundle.lookbackDays ?? 180;

  // -------------------------------------------------------------------------
  // Cold start "pure": <20 torneios -> heuristica fixa
  // -------------------------------------------------------------------------
  if (bundle.totalTournaments < COLD_START_PURE_THRESHOLD) {
    const rawScore = computeColdStartScore(tournament);
    const score = Math.round(rawScore);
    const grade = scoreToGrade(score);
    return {
      score,
      grade,
      confidence: "low",
      rationale: "Score generico — importe pelo menos 50 torneios para receber recomendacoes personalizadas.",
      signals: buildColdStartSignals(),
      warnings: ["low_sample"],
    };
  }

  // -------------------------------------------------------------------------
  // Algoritmo full (cold start "partial" 20-49 ou >=50)
  // -------------------------------------------------------------------------
  const isPartialColdStart = bundle.totalTournaments < COLD_START_PARTIAL_THRESHOLD;

  // Identifica sinais que devem ser nullified (peso=0 e redistribuir)
  const fieldNull = tournament.fieldBucket == null;
  const categoryNull = tournament.category == null;

  // Calcular peso ativo total (que nao foi nullified)
  let nulledWeight = 0;
  if (fieldNull) nulledWeight += WEIGHTS.fieldRoi;
  if (categoryNull) nulledWeight += WEIGHTS.categoryRoi;

  // Numero de sinais ativos
  const totalSignals = 7;
  const nulledCount = (fieldNull ? 1 : 0) + (categoryNull ? 1 : 0);
  const activeSignals = totalSignals - nulledCount;
  const redistribute = activeSignals > 0 ? nulledWeight / activeSignals : 0;

  // Lookup buckets
  const siteB = findSiteBucket(bundle, tournament.site);
  const buyInB = findBuyInBucket(bundle, tournament.buyInBucket);
  const catB = categoryNull ? undefined : findCategoryBucket(bundle, tournament.category);
  const speedB = findSpeedBucket(bundle, tournament.speed);
  const dowB = findDayOfWeekBucket(bundle, tournament.dayOfWeek);
  const todB = findTimeOfDayBucket(bundle, tournament.timeOfDayBucket);
  const fieldB = fieldNull ? undefined : findFieldBucket(bundle, tournament.fieldBucket);

  // Build signals com pesos (redistribuir nos ativos)
  const w = {
    siteRoi: WEIGHTS.siteRoi + redistribute,
    buyInRoi: WEIGHTS.buyInRoi + redistribute,
    categoryRoi: categoryNull ? 0 : (WEIGHTS.categoryRoi + redistribute),
    speedRoi: WEIGHTS.speedRoi + redistribute,
    dayOfWeekRoi: WEIGHTS.dayOfWeekRoi + redistribute,
    timeOfDayRoi: WEIGHTS.timeOfDayRoi + redistribute,
    fieldRoi: fieldNull ? 0 : (WEIGHTS.fieldRoi + redistribute),
  };

  const signals: ScoringSignals = {
    siteRoi: siteB ? makeSignal(siteB.roi, siteB.sample, w.siteRoi) : emptySignal(w.siteRoi),
    buyInRoi: buyInB ? makeSignal(buyInB.roi, buyInB.sample, w.buyInRoi) : emptySignal(w.buyInRoi),
    categoryRoi: catB
      ? makeSignal(catB.roi, catB.sample, w.categoryRoi)
      : (categoryNull ? { value: 0, sample: 0, weight: 0, score: 50 } : emptySignal(w.categoryRoi)),
    speedRoi: speedB ? makeSignal(speedB.roi, speedB.sample, w.speedRoi) : emptySignal(w.speedRoi),
    dayOfWeekRoi: dowB ? makeSignal(dowB.roi, dowB.sample, w.dayOfWeekRoi) : emptySignal(w.dayOfWeekRoi),
    timeOfDayRoi: todB ? makeSignal(todB.roi, todB.sample, w.timeOfDayRoi) : emptySignal(w.timeOfDayRoi),
    fieldRoi: fieldB
      ? makeSignal(fieldB.roi, fieldB.sample, w.fieldRoi)
      : (fieldNull ? { value: 0, sample: 0, weight: 0, score: 50 } : emptySignal(w.fieldRoi)),
  };

  // Score final = soma ponderada (round)
  let total = 0;
  for (const k of Object.keys(signals) as Array<keyof ScoringSignals>) {
    const s = signals[k];
    total += s.score * s.weight;
  }
  const score = clamp(Math.round(total), 0, 100);
  const grade = scoreToGrade(score);

  // Confidence (baseada em buyIn e category buckets primarios)
  const buyInSample = signals.buyInRoi.sample;
  const catSample = categoryNull ? 0 : signals.categoryRoi.sample;
  let confidence: ConfidenceLevel;
  if (buyInSample >= 30 && catSample >= 30) {
    confidence = "high";
  } else if (buyInSample >= 15 || catSample >= 15) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  // Warnings
  const warnings: string[] = [];
  if (confidence === "low") warnings.push("low_sample");

  // unfamiliar_site: site sample < 10 (mas > 0 para nao ser duplicar com never_played)
  if (siteB && siteB.sample < 10) warnings.push("unfamiliar_site");

  // never_played_category: tournament tem categoria mas bundle nao tem aquela categoria (sample 0)
  if (!categoryNull && !catB) warnings.push("never_played_category");

  // Rationale
  const rationale = buildRationale(signals, lookbackDays);

  const result: TournamentScoreResult = {
    score,
    grade,
    confidence,
    rationale,
    signals,
    warnings,
  };

  if (isPartialColdStart) {
    result.lowConfidence = true;
  }

  return result;
}
