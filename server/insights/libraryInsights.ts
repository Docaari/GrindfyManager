/**
 * Library insights — "Destaques e Vazamentos".
 *
 * Sprint library-evolution Fase 2. Engine PURO (sem DB) que compara cada bucket
 * de dimensao (site, buy-in tier, tipo, velocidade, field-size, dia da semana,
 * e conjuncoes) contra o BASELINE do proprio jogador e emite insights
 * estatisticamente defensaveis.
 *
 * Tres defesas contra ruido (MTT tem variancia altissima):
 *  1. sample floor (MIN_INSIGHT_SAMPLE) — buckets minusculos nem entram.
 *  2. shrinkage Bayesiano K=30 (mesma constante do tournamentScorer) — encolhe
 *     o ROI do bucket em direcao ao baseline proporcional ao tamanho da amostra.
 *  3. teste de significancia CI95 — o delta tem que superar 1.96*SE do ROI
 *     (SE derivado do desvio-padrao do profit / sqrt(n) / avgBuyin), padrao
 *     identico ao usado no roiLower/roiUpper de getTournamentLibrary.
 */

export const MIN_INSIGHT_SAMPLE = 30;
export const MIN_DELTA_PP = 8; // delta minimo em pontos percentuais de ROI
export const SHRINK_K = 30;
export const MIN_COMPOSITE_SAMPLE = 50;

export interface DimensionBucket {
  dimension: string; // 'site'|'buyIn'|'type'|'speed'|'fieldSize'|'dayOfWeek'|'composite'
  bucketLabel: string;
  sample: number;
  roi: number; // % (mesma escala do baseline)
  profit: number;
  sdProfit: number; // desvio-padrao do profit por torneio (USD)
  avgBuyin: number; // USD — converte SE de profit em SE de ROI
}

// Motivo do destaque (alinha com os "motivos" dos cards — Fase 5/6):
//   'roi'           -> maior/menor ROI medio
//   'low_variance'  -> field menor = menos variancia (dica pra grade)
export type InsightReason = "roi" | "low_variance";

export interface Insight {
  kind: "highlight" | "leak";
  dimension: string;
  bucketLabel: string;
  roi: number; // ROI encolhido (shrunk), %
  baselineRoi: number;
  delta: number; // pp
  sample: number;
  confidence: "high" | "medium" | "low";
  reason: InsightReason;
  message: string;
}

// Field pequeno/medio = menos jogadores pra superar, premio menos top-heavy em
// magnitude absoluta -> MENOS variancia (swings menores) mesmo que o ROI seja
// igual. Quando um desses buckets e destaque positivo, viramos isso numa dica
// acionavel pra grade. Ver Docs/strategy/mtt-variance-math-study-guide.
const LOW_VARIANCE_FIELD_BUCKETS = new Set(["pequeno", "medio"]);

export interface InsightsInput {
  baseline: { roi: number; sample: number };
  buckets: DimensionBucket[];
}

export interface InsightsOptions {
  maxPerKind?: number; // default 3
}

function shrinkTowardBaseline(roi: number, sample: number, baselineRoi: number): number {
  return (roi * sample + baselineRoi * SHRINK_K) / (sample + SHRINK_K);
}

function ci95RoiPp(b: DimensionBucket): number {
  if (b.avgBuyin <= 0 || b.sample <= 1) return Number.POSITIVE_INFINITY;
  const seProfit = b.sdProfit / Math.sqrt(b.sample);
  const seRoiPp = (seProfit / b.avgBuyin) * 100;
  return 1.96 * seRoiPp;
}

function confidenceFor(sample: number): Insight["confidence"] {
  if (sample >= 200) return "high";
  if (sample >= 80) return "medium";
  return "low";
}

const DAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function describeBucket(dimension: string, bucketLabel: string): string {
  switch (dimension) {
    case "site":
      return `na ${bucketLabel}`;
    case "buyIn":
      return `na faixa de buy-in ${bucketLabel}`;
    case "type":
      return `do tipo ${bucketLabel}`;
    case "speed":
      return `na velocidade ${bucketLabel}`;
    case "fieldSize":
      return `de field ${bucketLabel}`;
    case "deepStack":
      return bucketLabel === "deep" ? "deepstack" : "de stack normal";
    case "dayOfWeek": {
      const idx = Number(bucketLabel);
      const day = Number.isInteger(idx) && DAY_NAMES[idx] ? DAY_NAMES[idx] : bucketLabel;
      return `jogados na ${day}`;
    }
    case "composite":
      return bucketLabel; // ja vem como frase pronta (ex. "PKO de field pequeno")
    default:
      return bucketLabel;
  }
}

function resolveReason(kind: Insight["kind"], dimension: string, bucketLabel: string): InsightReason {
  if (kind === "highlight" && dimension === "fieldSize" && LOW_VARIANCE_FIELD_BUCKETS.has(bucketLabel)) {
    return "low_variance";
  }
  return "roi";
}

function buildMessage(
  kind: Insight["kind"],
  dimension: string,
  bucketLabel: string,
  roi: number,
  delta: number,
  sample: number,
  reason: InsightReason,
): string {
  const where = describeBucket(dimension, bucketLabel);
  const roiStr = `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`;
  const deltaAbs = Math.abs(delta).toFixed(1);
  if (kind === "highlight") {
    if (reason === "low_variance") {
      // Field menor = menos variancia. Dica acionavel pra grade.
      const faixa = bucketLabel === "pequeno" ? "menos de 100 jogadores" : "100 a 500 jogadores";
      return `Seus torneios ${where} (${faixa}) rendem ROI ${roiStr}, +${deltaAbs}pp acima da sua média — e com menos variância. Vale priorizar mais desses na sua grade (${sample} torneios).`;
    }
    return `Seus torneios ${where} rendem ROI ${roiStr}, +${deltaAbs}pp acima da sua média (${sample} torneios).`;
  }
  return `Atenção: torneios ${where} estão com ROI ${roiStr}, ${deltaAbs}pp abaixo da sua média (${sample} torneios).`;
}

/**
 * Calcula os insights (destaques + vazamentos) a partir dos buckets de dimensao
 * e do baseline do jogador. Retorna ate `maxPerKind` de cada tipo, rankeados
 * pelo delta.
 */
export function computeLibraryInsights(input: InsightsInput, opts: InsightsOptions = {}): Insight[] {
  const maxPerKind = opts.maxPerKind ?? 3;
  const baselineRoi = input.baseline.roi;
  const out: Insight[] = [];

  for (const b of input.buckets) {
    const floor = b.dimension === "composite" ? MIN_COMPOSITE_SAMPLE : MIN_INSIGHT_SAMPLE;
    if (b.sample < floor) continue;

    const shrunk = shrinkTowardBaseline(b.roi, b.sample, baselineRoi);
    const delta = shrunk - baselineRoi;
    if (Math.abs(delta) < MIN_DELTA_PP) continue;

    const ci95 = ci95RoiPp(b);
    if (!(Math.abs(delta) > ci95)) continue; // nao significativo (cobre Infinity)

    const kind = delta > 0 ? "highlight" : "leak";
    const reason = resolveReason(kind, b.dimension, b.bucketLabel);
    out.push({
      kind,
      dimension: b.dimension,
      bucketLabel: b.bucketLabel,
      roi: parseFloat(shrunk.toFixed(2)),
      baselineRoi: parseFloat(baselineRoi.toFixed(2)),
      delta: parseFloat(delta.toFixed(2)),
      sample: b.sample,
      confidence: confidenceFor(b.sample),
      reason,
      message: buildMessage(kind, b.dimension, b.bucketLabel, shrunk, delta, b.sample, reason),
    });
  }

  const highlights = out
    .filter((i) => i.kind === "highlight")
    .sort((a, b) => b.delta - a.delta)
    .slice(0, maxPerKind);
  const leaks = out
    .filter((i) => i.kind === "leak")
    .sort((a, b) => a.delta - b.delta)
    .slice(0, maxPerKind);

  return [...highlights, ...leaks];
}
