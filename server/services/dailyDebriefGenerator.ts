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

const DAILY_DEBRIEF_DEFAULT_MODEL = "claude-sonnet-4-6";
const DAILY_DEBRIEF_PRICE_PER_M = { input: 3, output: 15, cacheCreate: 3.75, cacheRead: 0.3 };

// LLM call mirroring weeklyReportGenerator.callLlm pattern (lesson #5/#35).
// Retorna `{ parsed, usage }` em sucesso ou `{ clientUnavailable: true }` quando
// SDK/key/cliente nao disponivel — caller cai pro deterministic.
async function callDailyDebriefLlm(args: {
  model: string;
  bundle: any;
  tone: string;
  level: string | null;
}): Promise<{ parsed: any; usage: any } | { clientUnavailable: true }> {
  const { DAILY_DEBRIEF_SYSTEM, buildDailyDebriefPrompt } = await import("../coach/prompts/dailyDebrief");
  let AnthropicCtor: any;
  try {
    const sdkMod = await import("@anthropic-ai/sdk");
    AnthropicCtor = (sdkMod as any).default ?? sdkMod;
  } catch {
    return { clientUnavailable: true };
  }
  let client: any;
  try {
    client = new AnthropicCtor({ apiKey: process.env.ANTHROPIC_API_KEY });
  } catch {
    try { client = AnthropicCtor({ apiKey: process.env.ANTHROPIC_API_KEY }); } catch { client = null; }
  }
  if (!client || !client.messages || typeof client.messages.create !== "function") {
    return { clientUnavailable: true };
  }
  const userMsg = buildDailyDebriefPrompt({ tone: args.tone, level: args.level, bundle: args.bundle });
  const response = await client.messages.create({
    model: args.model,
    max_tokens: 1200,
    system: [
      { type: "text", text: DAILY_DEBRIEF_SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userMsg }],
  });
  const text = Array.isArray(response?.content)
    ? response.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("")
    : (typeof response?.content === "string" ? response.content : "");
  let parsed: any = {};
  try {
    const m = text.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : JSON.parse(text);
  } catch {
    parsed = {};
  }
  return { parsed, usage: response?.usage ?? null };
}

function computeDailyDebriefCost(usage: any): number {
  const i = Number(usage?.input_tokens ?? usage?.inputTokens ?? 0);
  const o = Number(usage?.output_tokens ?? usage?.outputTokens ?? 0);
  const cc = Number(usage?.cache_creation_input_tokens ?? usage?.cacheCreationInputTokens ?? 0);
  const cr = Number(usage?.cache_read_input_tokens ?? usage?.cacheReadInputTokens ?? 0);
  const p = DAILY_DEBRIEF_PRICE_PER_M;
  return (i * p.input + o * p.output + cc * p.cacheCreate + cr * p.cacheRead) / 1_000_000;
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

// AI-1C / RF-08 — followUp block (foco de leak ativo + metas em progresso).
// Safe-deny por dep: erro em uma fonte nao impede o resto.
async function gatherFollowUp(storage: any, userId: string): Promise<{
  activeLeakFocus: Array<{ code: string; label: string; targetMonth: string; status: string; progressNote?: string }>;
  goalsInProgress: Array<{ goalId: string; texto: string; prazo: "mes" | "trimestre" | null }>;
} | undefined> {
  const activeLeakFocus: Array<{ code: string; label: string; targetMonth: string; status: string; progressNote?: string }> = [];
  const goalsInProgress: Array<{ goalId: string; texto: string; prazo: "mes" | "trimestre" | null }> = [];
  try {
    const raw = (await storage.findActiveLeakFocusList?.(userId)) ?? [];
    for (const f of Array.isArray(raw) ? raw : []) {
      activeLeakFocus.push({
        code: String(f?.leakCode ?? f?.code ?? ""),
        label: String(f?.label ?? f?.leakCode ?? "leak"),
        targetMonth: String(f?.targetMonth ?? ""),
        status: String(f?.status ?? "active"),
        progressNote: f?.progressNote ?? undefined,
      });
    }
  } catch (err) {
    console.error("daily_debrief.followup.leaks.error", { userId, err });
  }
  try {
    const { getAiStructuredProfile } = await import("../storage/aiStructuredProfile");
    const profile = await getAiStructuredProfile(userId);
    const metas = Array.isArray((profile as any)?.metas) ? (profile as any).metas : [];
    // Daily: so metas mensais sao relevantes pro fechamento de loop pos-sessao.
    for (const m of metas) {
      if (m?.prazo === "mes") {
        goalsInProgress.push({
          goalId: String(m?.id ?? ""),
          texto: String(m?.texto ?? ""),
          prazo: "mes",
        });
      }
    }
  } catch (err) {
    console.error("daily_debrief.followup.metas.error", { userId, err });
  }
  if (activeLeakFocus.length === 0 && goalsInProgress.length === 0) return undefined;
  return { activeLeakFocus, goalsInProgress };
}

export async function generateDailyDebrief(args: GenerateDailyDebriefArgs): Promise<DailyDebriefResult> {
  const { userId, periodStart, periodEnd, failSoft } = args;
  const storage = await resolveStorage(args.injectedStorage);
  const date = periodStart;

  const agg = await aggregateSessionsForDate(storage, userId, date);
  const hasData = agg.sessionsCount > 0;
  const roi = agg.buyInUsd > 0 ? (agg.profitUsd / agg.buyInUsd) * 100 : null;

  const followUp = await gatherFollowUp(storage, userId);

  // Tom + nivel (perfil estruturado tem prioridade; fallback coachTone).
  let tone: "gentle" | "balanced" | "direct" = "balanced";
  let level: string | null = null;
  try {
    const { getCoachPreferences } = await import("../storage/coachPreferences");
    const prefs = await getCoachPreferences(userId);
    if (prefs?.coachTone) tone = prefs.coachTone as any;
  } catch { /* default */ }
  try {
    const { getAiStructuredProfile } = await import("../storage/aiStructuredProfile");
    const profile = await getAiStructuredProfile(userId);
    if ((profile as any)?.tomPreferido) tone = (profile as any).tomPreferido;
    if ((profile as any)?.nivel) level = (profile as any).nivel;
  } catch { /* default */ }

  // Tenta LLM narrative para enriquecer header.summaryLine + insights +
  // recommendedAction. Bundle pequeno (1 sessao) -> custo ~$0.013/debrief.
  // Sessao com 0 torneios -> NAO chama LLM (custo zero).
  const model = process.env.COACH_MODEL || DAILY_DEBRIEF_DEFAULT_MODEL;
  let llmHeaderSummary: string | null = null;
  let llmHeaderComparison: string | null = null;
  let llmInsights: Array<{ text: string; citations: string[]; confidence?: "high" | "medium" | "low" }> = [];
  let llmRecommendedAction: string | null = null;
  let usage: any = null;
  let costUsd = 0;
  let degraded = false;
  let degradedReason: string | null = null;
  let llmModelUsed: string | null = null;

  if (hasData) {
    const bundle = {
      tone,
      level,
      sessionSummary: {
        sessionDate: date,
        sessionsCount: agg.sessionsCount,
        tournamentsCount: agg.tournamentsCount,
        profitUsd: agg.profitUsd,
        roiPct: roi,
        itmCount: agg.itmCount,
        finalTables: agg.finalTables,
        cravadas: agg.cravadas,
        spotsCount: agg.spotsCount,
        profitByCurrency: agg.profitByCurrency,
      },
      followUp: followUp ?? null,
    };
    try {
      const out = await callDailyDebriefLlm({ model, bundle, tone, level });
      if ("clientUnavailable" in out) {
        degraded = true;
        degradedReason = "no_anthropic_key";
      } else {
        const p = out.parsed ?? {};
        llmHeaderSummary = typeof p?.header?.summaryLine === "string" ? p.header.summaryLine : null;
        llmHeaderComparison = typeof p?.header?.comparison === "string" ? p.header.comparison : null;
        if (Array.isArray(p?.insights)) {
          llmInsights = p.insights
            .filter((i: any) => i && typeof i.text === "string")
            .slice(0, 2)
            .map((i: any) => ({
              text: i.text,
              citations: Array.isArray(i?.citations) ? i.citations.map(String) : [],
              confidence: i?.confidence === "high" || i?.confidence === "medium" || i?.confidence === "low"
                ? i.confidence
                : "low",
            }));
        }
        if (typeof p?.recommendedAction === "string") {
          llmRecommendedAction = p.recommendedAction;
        }
        usage = out.usage;
        costUsd = computeDailyDebriefCost(usage);
        llmModelUsed = model;
      }
    } catch (err) {
      console.error("daily_debrief.llm.error", { userId, err: err instanceof Error ? err.message : String(err) });
      if (failSoft) {
        degraded = true;
        degradedReason = "llm_failed_3x";
      } else {
        throw err; // caller (reportJobRunner) conta attempts e cai pro failSoft na ultima.
      }
    }
  }

  // Determinismo fallback para header.summaryLine.
  const summaryLine = llmHeaderSummary ??
    (hasData
      ? `${agg.sessionsCount} sessao(oes), ${agg.tournamentsCount} torneios, ${agg.profitUsd >= 0 ? "+" : ""}$${agg.profitUsd.toFixed(2)} USD${roi !== null ? ` (ROI ${roi.toFixed(1)}%)` : ""}.`
      : "Sessao registrada sem torneios — tudo certo?");

  const content: ReportContent = {
    schemaVersion: 2,
    reportType: "daily",
    periodStart: date,
    periodEnd: periodEnd ?? date,
    dataSufficiency: hasData ? "ok" : "low",
    level: (level as any) ?? null,
    tone,
    header: {
      title: `Seu debrief — ${date}`,
      summaryLine,
      ...(llmHeaderComparison ? { comparison: llmHeaderComparison } : {}),
    },
    sections: makeEmptySections(),
    insights: llmInsights,
    nextWeekPlan: {
      gradeSuggestionHref: null,
      studyFocus: null,
      recommendedAction: llmRecommendedAction ?? (hasData ? null : "Registre os torneios na proxima sessao."),
    },
    cta: hasData
      ? [{ label: "Ver detalhes da sessao", kind: "link", href: "/grind" }]
      : [{ label: "Importar historico", kind: "link", href: "/upload" }],
    generation: {
      model: llmModelUsed,
      summarizerModel: null,
      degraded,
      degradedReason,
      costUsdEstimate: costUsd,
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
    ...(followUp ? { followUp } : {}),
  };

  const markdown = buildMarkdown(content, agg);

  return {
    content,
    markdown,
    status: degraded ? "degraded" : "ready",
    model: llmModelUsed,
    usage,
    costUsdEstimate: costUsd,
    degradedReason,
  };
}
