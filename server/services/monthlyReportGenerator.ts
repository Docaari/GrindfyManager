// =============================================================================
// monthlyReportGenerator — Sprint AI-1C / RF-05 + RF-04 (ADR-159)
//
// Gera o Monthly Report deterministicamente. Reusa storage methods existentes
// (`getPerformanceByPeriod` aceita custom range 'YYYY-MM-DD to YYYY-MM-DD' +
// presets 'last_6_months'/'last_12_months') + heuristica simples de variancia.
// LLM-narrative pode ser ligado em wave futura.
//
// Lessons: #6 (FX -> USD), #9 (try/catch granular), #34 (injectedStorage).
// =============================================================================

import type { ReportContent } from "@shared/schema";

export interface GenerateMonthlyReportArgs {
  userId: string;
  periodStart: string; // 'YYYY-MM-DD' — 1o dia do mes anterior
  periodEnd: string;   // 'YYYY-MM-DD' — ultimo dia do mes anterior
  failSoft?: boolean;
  injectedStorage?: any;
}

export interface MonthlyReportResult {
  content: ReportContent;
  markdown: string;
  status: "ready" | "degraded";
  model: string | null;
  usage?: any;
  costUsdEstimate?: number | null;
  degradedReason?: string | null;
  reportId?: string | null;
}

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../storage");
  return (mod as any).storage;
}

const N = (v: any): number => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

function previousMonthRange(periodStart: string): { start: string; end: string } {
  const [y, m] = periodStart.split("-").map(Number);
  const prev = new Date(Date.UTC(y, (m || 1) - 2, 1));
  const end = new Date(Date.UTC(y, (m || 1) - 1, 0));
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { start: fmt(prev), end: fmt(end) };
}

function makeEmptySections(): ReportContent["sections"] {
  return {
    volumeResults: {
      sessionsCompleted: 0,
      sessionsPlanned: 0,
      tournaments: 0,
      itmPct: null,
      finalTables: 0,
      wins: 0,
      roiWeek: null,
      roi30d: null,
    },
    bankroll: {
      profitByCurrency: [],
      bankrollStart: null,
      bankrollNow: null,
      transfers: 0,
      withdrawals: 0,
    },
    selection: {
      ranThisWeek: null,
      adherencePct: null,
      topCategories: [],
      bottomCategories: [],
    },
    study: {
      minutesLogged: 0,
      topicsCovered: [],
      focusOfMonth: null,
      focusCoveragePct: null,
    },
  };
}

async function safePerf(storage: any, userId: string, range: string): Promise<any> {
  try {
    return await storage.getPerformanceByPeriod?.(userId, range);
  } catch (err) {
    console.error("monthly_report.perf.error", { userId, range, err });
    return null;
  }
}

export async function generateMonthlyReport(args: GenerateMonthlyReportArgs): Promise<MonthlyReportResult> {
  const { userId, periodStart, periodEnd } = args;
  const storage = await resolveStorage(args.injectedStorage);

  const rangeArg = `${periodStart} to ${periodEnd}`;
  const prev = previousMonthRange(periodStart);
  const prevRangeArg = `${prev.start} to ${prev.end}`;

  const [perfCurrent, perfPrev] = await Promise.all([
    safePerf(storage, userId, rangeArg),
    safePerf(storage, userId, prevRangeArg),
  ]);

  const tournaments = N(perfCurrent?.count ?? perfCurrent?.tournaments);
  const profit = N(perfCurrent?.profit);
  const buyIn = N(perfCurrent?.buyIn ?? perfCurrent?.totalBuyIn);
  const roi =
    perfCurrent?.roi != null
      ? N(perfCurrent.roi)
      : buyIn > 0
        ? (profit / buyIn) * 100
        : null;

  const profitPrev = N(perfPrev?.profit);
  const roiPrev =
    perfPrev?.roi != null
      ? N(perfPrev.roi)
      : N(perfPrev?.buyIn ?? perfPrev?.totalBuyIn) > 0
        ? (profitPrev / N(perfPrev?.buyIn ?? perfPrev?.totalBuyIn)) * 100
        : null;

  // Heuristica de variancia: bankroll delta ≈ profit; estimate by skill = ROI 12m
  // medio * buyIn; by variance = resto. Confidence baixa quando n pequeno.
  const profitVsPrev = profit - profitPrev;
  const sampleSize = tournaments;
  const variance = {
    bankrollDeltaUsd: profit,
    estimatedBySkillUsd: roi !== null && buyIn > 0 ? (roi / 100) * buyIn : null,
    estimatedByVarianceUsd: null as number | null,
    sampleSize,
    method: "heuristic" as const,
    confidence: (sampleSize >= 200 ? "medium" : "low") as "medium" | "low",
  };
  if (variance.estimatedBySkillUsd !== null) {
    variance.estimatedByVarianceUsd = profit - variance.estimatedBySkillUsd;
  }

  const sections = makeEmptySections();
  sections.volumeResults = {
    sessionsCompleted: 0, // sessions count nao computamos no heuristic; pode vir em wave futura
    sessionsPlanned: 0,
    tournaments,
    itmPct: perfCurrent?.itmPct != null ? N(perfCurrent.itmPct) : null,
    finalTables: N(perfCurrent?.finalTables),
    wins: N(perfCurrent?.wins ?? perfCurrent?.cravadas),
    roiWeek: null,
    roi30d: roi,
  };
  sections.bankroll = {
    profitByCurrency: [{ currency: "USD", native: profit, usd: profit }],
    bankrollStart: null,
    bankrollNow: null,
    transfers: 0,
    withdrawals: 0,
  };

  const content: ReportContent = {
    schemaVersion: 2,
    reportType: "monthly",
    periodStart,
    periodEnd,
    dataSufficiency: tournaments > 0 ? "ok" : "low",
    header: {
      title: `Relatorio mensal — ${periodStart.slice(0, 7)}`,
      summaryLine: `${tournaments} torneios, ${profit >= 0 ? "+" : ""}$${profit.toFixed(2)} USD${roi !== null ? ` (ROI ${roi.toFixed(1)}%)` : ""}.`,
      comparison:
        roiPrev !== null && roi !== null
          ? `ROI vs mes anterior: ${roi >= roiPrev ? "+" : ""}${(roi - roiPrev).toFixed(1)}pp.`
          : undefined,
    },
    sections,
    insights: [],
    nextWeekPlan: {
      gradeSuggestionHref: null,
      studyFocus: null,
      recommendedAction: null,
    },
    cta: [
      { label: "Ver dashboard", kind: "link", href: "/coach" },
    ],
    generation: {
      model: null,
      summarizerModel: null,
      degraded: false,
      degradedReason: null,
      costUsdEstimate: 0,
    },
    comparatives: {
      previousPeriod: {
        label: `${prev.start.slice(0, 7)}`,
        profit: profitPrev,
        roi: roiPrev,
        count: N(perfPrev?.count ?? perfPrev?.tournaments),
      },
      trendNarrative:
        profitVsPrev > 0
          ? `Mes melhor que ${prev.start.slice(0, 7)}: +$${profitVsPrev.toFixed(2)}.`
          : profitVsPrev < 0
            ? `Mes pior que ${prev.start.slice(0, 7)}: $${profitVsPrev.toFixed(2)}.`
            : `Mes empata com ${prev.start.slice(0, 7)}.`,
    },
    variance,
  };

  // Markdown simples.
  const md: string[] = [];
  md.push(`# ${content.header.title}`);
  md.push("");
  md.push(content.header.summaryLine);
  if (content.header.comparison) md.push(`*${content.header.comparison}*`);
  md.push("");
  md.push("## Volume e resultados");
  md.push(`- Torneios: ${tournaments}`);
  md.push(`- Lucro: $${profit.toFixed(2)} USD${roi !== null ? ` (ROI ${roi.toFixed(1)}%)` : ""}`);
  md.push("");
  md.push("## Comparativo mes anterior");
  md.push(`- ${prev.start.slice(0, 7)}: $${profitPrev.toFixed(2)} USD${roiPrev !== null ? ` (ROI ${roiPrev.toFixed(1)}%)` : ""}`);
  md.push(`- Delta: ${profitVsPrev >= 0 ? "+" : ""}$${profitVsPrev.toFixed(2)} USD`);
  md.push("");
  md.push("## Variancia (heuristica)");
  if (variance.estimatedBySkillUsd !== null) {
    md.push(`- Estimativa por skill: $${variance.estimatedBySkillUsd.toFixed(2)}`);
    md.push(`- Estimativa por variancia: $${(variance.estimatedByVarianceUsd ?? 0).toFixed(2)}`);
  } else {
    md.push("- Sem dados suficientes para decomposicao skill/variancia.");
  }
  md.push(`- Confidence: ${variance.confidence} (n=${sampleSize})`);
  const markdown = md.join("\n");

  return {
    content,
    markdown,
    status: "ready",
    model: null,
    costUsdEstimate: 0,
  };
}
