/**
 * Sprint home-reform-2 — RF-34 / B12 (Heuristicas server-side).
 *
 * Spec: Docs/specs/home-reform-2.md §3 B12, §5 RF-34
 * ADR : Docs/architecture/decisions/108-home-heuristics-server-side-rules.md
 *
 * Servico puro (sem I/O). Recebe inputs ja agregados pelo orchestrator
 * `server/routes/home.ts` e retorna ate 3 heuristicas em ordem fixa de
 * prioridade.
 *
 * Lessons aplicadas:
 *   #3  funcao pura = teste isolado
 *   #9  funcao pura nao logga; orchestrator faz isso
 *   #11 spec eh fonte da verdade
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type HeuristicSeverity = "info" | "caution" | "positive";

export interface Heuristic {
  id: string;
  message: string;
  severity: HeuristicSeverity;
  ctaHref: string | null;
}

export interface HeuristicsInput {
  userId?: string;
  quickStats?: {
    totalTournaments?: number;
    totalSessions?: number;
    activeDays?: number;
    currentStreakDays?: number;
  } | null;
  performance30d?: { roi?: number; itm?: number; cash?: number } | null;
  performance60d?: { roi?: number; itm?: number; cash?: number } | null;
  recentSessions?: Array<{ date?: string; pnlUsd?: number }> | null;
  variance?: {
    status?: "lucky" | "normal" | "unlucky";
    sigmaMultiple?: number;
  } | null;
  todayDayOfWeek?: number;
  lifetime?: { cash?: number; monthsLifetime?: number } | null;
}

// ---------------------------------------------------------------------------
// Thresholds (constants exportadas para tuning futuro — ADR-108)
// ---------------------------------------------------------------------------

export const ROI_DROP_PP = 5;
export const DAY_OF_WEEK_DIFF_PP = 10;
export const DAY_OF_WEEK_MIN_SAMPLE = 5;
export const RECENT_SESSIONS_MIN = 60;
export const CASH_PACE_HIGH_RATIO = 1.2;
export const CASH_PACE_LOW_RATIO = 0.8;

const DAY_LABELS_PT: Record<number, string> = {
  0: "Dom",
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sab",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dayOfWeekFromDate(dateIso?: string): number | null {
  if (!dateIso) return null;
  const d = new Date(dateIso);
  if (isNaN(d.getTime())) return null;
  return d.getUTCDay();
}

function meanRoiByDay(
  sessions: Array<{ date?: string; pnlUsd?: number }>,
): { byDay: Record<number, { count: number; pnlSum: number }>; total: { count: number; pnlSum: number } } {
  const byDay: Record<number, { count: number; pnlSum: number }> = {};
  let totalCount = 0;
  let totalPnl = 0;
  for (const s of sessions) {
    const dow = dayOfWeekFromDate(s.date);
    if (dow === null) continue;
    const pnl = Number(s.pnlUsd ?? 0);
    if (!byDay[dow]) byDay[dow] = { count: 0, pnlSum: 0 };
    byDay[dow].count += 1;
    byDay[dow].pnlSum += pnl;
    totalCount += 1;
    totalPnl += pnl;
  }
  return { byDay, total: { count: totalCount, pnlSum: totalPnl } };
}

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

function ruleRoiDrop(input: HeuristicsInput): Heuristic | null {
  const roi30 = Number(input.performance30d?.roi ?? 0);
  const roi60 = Number(input.performance60d?.roi ?? 0);
  const drop = roi60 - roi30;
  if (drop < ROI_DROP_PP) return null;
  return {
    id: "roi-30d-vs-60d-drop",
    message: `ROI 30d caiu ${drop.toFixed(1)} pp vs 60d. Revisar selecao de torneios.`,
    severity: "caution",
    ctaHref: "/grade-planner",
  };
}

function ruleBestDayOfWeek(input: HeuristicsInput): Heuristic | null {
  const sessions = input.recentSessions ?? [];
  if (sessions.length < RECENT_SESSIONS_MIN) return null;

  const { byDay, total } = meanRoiByDay(sessions);
  if (total.count === 0) return null;
  const meanGlobal = total.pnlSum / total.count;

  let bestDow: number | null = null;
  let bestMean = -Infinity;
  for (const [dowStr, agg] of Object.entries(byDay)) {
    if (agg.count < DAY_OF_WEEK_MIN_SAMPLE) continue;
    const mean = agg.pnlSum / agg.count;
    if (mean > bestMean) {
      bestMean = mean;
      bestDow = Number(dowStr);
    }
  }
  if (bestDow === null) return null;
  if (bestMean - meanGlobal < DAY_OF_WEEK_DIFF_PP) return null;

  const label = DAY_LABELS_PT[bestDow] ?? `Dia ${bestDow}`;
  return {
    id: "best-day-of-week",
    message: `${label} costuma ser seu melhor dia (ROI ${bestMean.toFixed(1)}%).`,
    severity: "positive",
    ctaHref: "/dashboard?period=60d",
  };
}

function ruleWorstDayOfWeekWarning(input: HeuristicsInput): Heuristic | null {
  const sessions = input.recentSessions ?? [];
  if (sessions.length < RECENT_SESSIONS_MIN) return null;
  const today = input.todayDayOfWeek;
  if (typeof today !== "number") return null;

  const { byDay, total } = meanRoiByDay(sessions);
  if (total.count === 0) return null;
  const meanGlobal = total.pnlSum / total.count;

  let worstDow: number | null = null;
  let worstMean = Infinity;
  for (const [dowStr, agg] of Object.entries(byDay)) {
    if (agg.count < DAY_OF_WEEK_MIN_SAMPLE) continue;
    const mean = agg.pnlSum / agg.count;
    if (mean < worstMean) {
      worstMean = mean;
      worstDow = Number(dowStr);
    }
  }
  if (worstDow === null) return null;
  if (worstDow !== today) return null;
  if (worstMean - meanGlobal > -DAY_OF_WEEK_DIFF_PP) return null;

  const label = DAY_LABELS_PT[worstDow] ?? `Dia ${worstDow}`;
  return {
    id: "worst-day-of-week-warning",
    message: `${label} historicamente teve ROI ${worstMean.toFixed(1)}%. Considere reduzir exposicao.`,
    severity: "caution",
    ctaHref: "/grade-planner",
  };
}

function ruleCashPaceVsBaseline(input: HeuristicsInput): Heuristic | null {
  const cash30 = Number(input.performance30d?.cash ?? 0);
  const lifetimeCash = Number(input.lifetime?.cash ?? 0);
  const months = Number(input.lifetime?.monthsLifetime ?? 0);
  if (lifetimeCash <= 0 || months <= 0) return null;
  const baseline = lifetimeCash / months;
  if (baseline <= 0) return null;
  const ratio = cash30 / baseline;
  if (ratio > CASH_PACE_HIGH_RATIO) {
    const pct = Math.round((ratio - 1) * 100);
    return {
      id: "cash-pace-vs-baseline",
      message: `Pace de cash ${pct}%+ acima da media.`,
      severity: "positive",
      ctaHref: "/dashboard",
    };
  }
  if (ratio < CASH_PACE_LOW_RATIO) {
    const pct = Math.round((1 - ratio) * 100);
    return {
      id: "cash-pace-vs-baseline",
      message: `Pace de cash ${pct}%+ abaixo da media.`,
      severity: "caution",
      ctaHref: "/dashboard",
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export function computeHeuristics(input: HeuristicsInput): Heuristic[] {
  const rules: Array<(i: HeuristicsInput) => Heuristic | null> = [
    ruleRoiDrop,
    ruleBestDayOfWeek,
    ruleWorstDayOfWeekWarning,
    ruleCashPaceVsBaseline,
  ];
  const out: Heuristic[] = [];
  for (const rule of rules) {
    const h = rule(input);
    if (h) out.push(h);
    if (out.length >= 3) break;
  }
  return out;
}

export default computeHeuristics;
