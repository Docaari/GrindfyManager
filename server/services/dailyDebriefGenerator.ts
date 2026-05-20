// =============================================================================
// dailyDebriefGenerator — Sprint AI-1C / RF-03 + RF-04 (ADR-159)
//
// Gera o Daily Debrief deterministicamente a partir da(s) sessao(oes) de grind
// do dia (no fuso do user). NAO chama LLM nesta versao — relatorio direto a
// partir dos dados reais (status='ready' quando ha dados; 'ready' + low quando
// nao ha sessao). LLM-narrative pode ser ligado em wave futura.
//
// Shape: identica a WeeklyReportResult (compat com persistReport /
// processReportJobsTick.persistOrFetchReportId / upsertReport).
//
// Lessons: #6 (FX -> USD antes de comparar), #9 (try/catch granular),
//   #34 (injectedStorage).
// =============================================================================

import type { ReportContent } from "@shared/schema";

export interface GenerateDailyDebriefArgs {
  userId: string;
  periodStart: string; // 'YYYY-MM-DD' — data da sessao no fuso do user
  periodEnd?: string;  // mesma data; default = periodStart
  failSoft?: boolean;
  injectedStorage?: any;
}

export interface DailyDebriefResult {
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

interface SessionAggregate {
  sessionsCount: number;
  tournamentsCount: number;
  finalTables: number;
  cravadas: number;
  itmCount: number;
  profitUsd: number;
  buyInUsd: number;
  spotsCount: number;
  profitByCurrency: Array<{ currency: string; native: number; usd: number }>;
}

async function aggregateSessionsForDate(storage: any, userId: string, date: string): Promise<SessionAggregate> {
  const agg: SessionAggregate = {
    sessionsCount: 0,
    tournamentsCount: 0,
    finalTables: 0,
    cravadas: 0,
    itmCount: 0,
    profitUsd: 0,
    buyInUsd: 0,
    spotsCount: 0,
    profitByCurrency: [],
  };
  const byCurrency = new Map<string, { native: number; usd: number }>();
  try {
    const sessions = (await storage.getGrindSessions?.(userId, { limit: 50 })) ?? [];
    for (const s of sessions) {
      // Sessao do dia: comparar data (YYYY-MM-DD) — usar campo `date` quando existir.
      const sDate = String(s?.date ?? s?.startDate ?? "").slice(0, 10);
      if (sDate !== date) continue;
      // So sessoes finalizadas.
      const status = String(s?.status ?? "").toLowerCase();
      if (status !== "completed" && status !== "finished") continue;
      agg.sessionsCount += 1;
      try {
        const tourneys = (await storage.getSessionTournaments?.(s.id)) ?? [];
        for (const t of tourneys) {
          agg.tournamentsCount += 1;
          if (t?.finalTable === true) agg.finalTables += 1;
          if (Number(t?.position) === 1) agg.cravadas += 1;
          const pos = Number(t?.position ?? 0);
          const field = Number(t?.fieldSize ?? 0);
          if (pos > 0 && field > 0 && pos / field <= 0.15) agg.itmCount += 1;
          const profit = N(t?.prizeUsd ?? t?.profit ?? 0) - N(t?.buyInUsd ?? t?.buyIn ?? 0);
          agg.profitUsd += profit;
          agg.buyInUsd += N(t?.buyInUsd ?? t?.buyIn ?? 0);
          const cur = String(t?.currency ?? "USD").toUpperCase();
          const entry = byCurrency.get(cur) ?? { native: 0, usd: 0 };
          entry.native += N(t?.profit ?? 0);
          entry.usd += profit;
          byCurrency.set(cur, entry);
        }
      } catch (err) {
        console.error("daily_debrief.session_tournaments.error", { userId, sessionId: s.id, err });
      }
      try {
        const spots = (await storage.listSpotScreenshotsForSession?.(s.id)) ?? [];
        agg.spotsCount += Array.isArray(spots) ? spots.length : 0;
      } catch { /* sem spots = 0 */ }
    }
  } catch (err) {
    console.error("daily_debrief.sessions_for_date.error", { userId, date, err });
  }
  for (const [currency, v] of byCurrency) {
    agg.profitByCurrency.push({ currency, native: v.native, usd: v.usd });
  }
  return agg;
}

function buildMarkdown(c: ReportContent, sum: SessionAggregate): string {
  const lines: string[] = [];
  lines.push(`# ${c.header.title}`);
  lines.push("");
  lines.push(c.header.summaryLine);
  if (c.header.comparison) lines.push(`*${c.header.comparison}*`);
  lines.push("");
  if (sum.sessionsCount === 0) {
    lines.push("Nenhuma sessao registrada hoje.");
    return lines.join("\n");
  }
  lines.push("## Resultado da sessao");
  lines.push(`- Torneios jogados: ${sum.tournamentsCount}`);
  lines.push(`- ITM: ${sum.itmCount}; Mesas finais: ${sum.finalTables}; Cravadas: ${sum.cravadas}`);
  const roi = sum.buyInUsd > 0 ? (sum.profitUsd / sum.buyInUsd) * 100 : null;
  lines.push(`- Lucro: $${sum.profitUsd.toFixed(2)} USD${roi !== null ? ` (ROI ${roi.toFixed(1)}%)` : ""}`);
  if (sum.profitByCurrency.length > 1) {
    lines.push("- Por moeda:");
    for (const p of sum.profitByCurrency) {
      lines.push(`  - ${p.currency}: ${p.native.toFixed(2)} (= $${p.usd.toFixed(2)} USD)`);
    }
  }
  lines.push("");
  lines.push("## Spots e notas");
  if (sum.spotsCount > 0) {
    lines.push(`${sum.spotsCount} spot(s) registrado(s) na sessao.`);
  } else {
    lines.push("Nenhum spot registrado — vale revisar prints na proxima.");
  }
  return lines.join("\n");
}

export async function generateDailyDebrief(args: GenerateDailyDebriefArgs): Promise<DailyDebriefResult> {
  const { userId, periodStart, periodEnd } = args;
  const storage = await resolveStorage(args.injectedStorage);
  const date = periodStart;

  const agg = await aggregateSessionsForDate(storage, userId, date);
  const hasData = agg.sessionsCount > 0;
  const roi = agg.buyInUsd > 0 ? (agg.profitUsd / agg.buyInUsd) * 100 : null;

  const content: ReportContent = {
    schemaVersion: 2,
    reportType: "daily",
    periodStart: date,
    periodEnd: periodEnd ?? date,
    dataSufficiency: hasData ? "ok" : "low",
    header: {
      title: `Seu debrief — ${date}`,
      summaryLine: hasData
        ? `${agg.sessionsCount} sessao(oes), ${agg.tournamentsCount} torneios, ${agg.profitUsd >= 0 ? "+" : ""}$${agg.profitUsd.toFixed(2)} USD${roi !== null ? ` (ROI ${roi.toFixed(1)}%)` : ""}.`
        : "Sessao registrada sem torneios — tudo certo?",
    },
    sections: makeEmptySections(),
    insights: [],
    nextWeekPlan: {
      gradeSuggestionHref: null,
      studyFocus: null,
      recommendedAction: hasData ? null : "Registre os torneios na proxima sessao.",
    },
    cta: hasData
      ? [{ label: "Ver detalhes da sessao", kind: "link", href: "/grind" }]
      : [{ label: "Importar historico", kind: "link", href: "/upload" }],
    generation: {
      model: null,
      summarizerModel: null,
      degraded: false,
      degradedReason: null,
      costUsdEstimate: 0,
    },
    sessionSummary: {
      sessionDate: date,
      sessionsCount: agg.sessionsCount,
      tournamentsCount: agg.tournamentsCount,
      profitUsd: hasData ? agg.profitUsd : null,
      roiPct: roi,
      itmPct: agg.tournamentsCount > 0 ? (agg.itmCount / agg.tournamentsCount) * 100 : null,
      finalTables: agg.finalTables,
      cravadas: agg.cravadas,
      spotsCount: agg.spotsCount,
      profitByCurrency: agg.profitByCurrency,
    },
  };

  const markdown = buildMarkdown(content, agg);

  return {
    content,
    markdown,
    status: "ready",
    model: null,
    costUsdEstimate: 0,
  };
}
