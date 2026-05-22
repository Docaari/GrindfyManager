// =============================================================================
// weeklyReportGenerator — Sprint AI-1B / RF-05 + RF-07 + RF-09 (ADR-155/156)
//
// generateWeeklyReport({ userId, periodStart, periodEnd, failSoft?, injectedStorage? })
//   -> { content: ReportContent; markdown: string; status: 'ready'|'degraded';
//        model: string|null; usage?; costUsdEstimate?; degradedReason? }
//
// Pipeline:
//   1. coleta o "bundle de dados da semana" (queries de storage — toda query de
//      historico filtra grind_session_id IS NULL, §6.1; reusa metodos com o
//      filtro ja injetado).
//   2. back-fills idempotentes: coach_lesson_recommendations (recommendLessonForUser
//      + createCoachRecommendation) + study_weekly_plans (generateWeeklyStudyPlan,
//      source coach_auto). Falha de back-fill NAO derruba o relatorio (lesson #9).
//   3. dados insuficientes (volume 0, sem sessoes, sem snapshot, sem estudo) ->
//      relatorio minimalista (dataSufficiency='low', status='ready', sem LLM,
//      CTA /upload).
//   4. fail-soft: sem ANTHROPIC_API_KEY -> deterministico (degradedReason
//      'no_anthropic_key'); failSoft:true -> tenta o LLM, se falha loga e cai pro
//      deterministico (degradedReason 'llm_failed_3x'); sem failSoft + LLM falha
//      -> loga e re-lanca (o runner conta attempts).
//   5. `new AnthropicCtor(...)` em try/catch (lesson #5/#35).
//   6. monta ReportContent JSONB + markdown.
//
// Lessons: #3 (mock shape real), #5/#35 (new Anthropic), #6 (USD), #7 (schemaVersion),
//   #9 (logar antes de fallback / try-catch granular), #10 (prompt unico), #34
//   (storage injetavel).
// =============================================================================

import { nanoid } from "nanoid";
import type { ReportContent } from "@shared/schema";
import { getCurrentWeekStartBRT } from "../coach/weekHelper";
// Sprint AI-3.2 / RF-B3 (ADR-203) — computeReportCost shared (paridade 5/5
// generators); pricing Sonnet 4.6 vem de server/coach/reportCost.ts.
import { computeReportCost } from "../coach/reportCost";
// Sprint AI-3.2 fix wave / HIGH-1 — top-level import (era lazy `await import`
// dentro de `callLlm`). Path mismatch quebrava mocks `vi.doMock(
// "../coach/anthropicClient")` em testes que escrevem o mock APOS o
// resetModules. Manter top-level pra mock funcionar deterministicamente.
import { callReportLlm } from "../coach/anthropicClient";
import { WEEKLY_REPORT_SYSTEM, buildWeeklyReportPrompt } from "../coach/prompts/weeklyReport";

const DEFAULT_REPORT_MODEL = "claude-sonnet-4-6";

// Hrefs de CTA/nextWeekPlan aceitos do LLM — rotas Wouter REGISTRADAS (lesson #19).
// O LLM pode alucinar /grade-planner, /stats etc.; qualquer href fora dessa lista
// cai pro default seguro (/coach).
const ALLOWED_HREFS = new Set([
  "/coach",
  "/upload",
  "/estudos",
  "/estudos/stats",
  "/grind",
  "/bankroll",
  "/biblioteca",
  "/coach-ai",
]);

function sanitizeHref(href: any, fallback = "/coach"): string {
  return typeof href === "string" && ALLOWED_HREFS.has(href) ? href : fallback;
}

interface GenerateWeeklyReportArgs {
  userId: string;
  periodStart: string;
  periodEnd: string;
  failSoft?: boolean;
  injectedStorage?: any;
}

export interface WeeklyReportResult {
  content: ReportContent;
  markdown: string;
  status: "ready" | "degraded";
  model: string | null;
  usage?: any;
  costUsdEstimate?: number | null;
  degradedReason?: string | null;
  reportId?: string | null;
}

function utcMondayOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay();
  const delta = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - delta);
  return d;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function n(v: any, fallback = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../storage");
  return (mod as any).storage;
}

function computeCost(usage: any): number {
  if (!usage) return 0;
  // Sprint AI-3.2 / RF-B3 — delega para computeReportCost (paridade 5/5).
  // Aceita camelCase legacy (inputTokens etc) — normaliza pra snake_case.
  const normalized = {
    input_tokens: n(usage.input_tokens ?? usage.inputTokens),
    output_tokens: n(usage.output_tokens ?? usage.outputTokens),
    cache_creation_input_tokens: n(usage.cache_creation_input_tokens ?? usage.cacheCreationInputTokens),
    cache_read_input_tokens: n(usage.cache_read_input_tokens ?? usage.cacheReadInputTokens),
  };
  const cost = computeReportCost(normalized, "sonnet46");
  return Math.round(cost * 1e6) / 1e6;
}

function periodLabel(periodStart: string, periodEnd: string): string {
  const fmt = (s: string) => {
    const [, m, d] = s.split("-");
    return `${d}/${m}`;
  };
  return `${fmt(periodStart)} a ${fmt(periodEnd)}`;
}

// -----------------------------------------------------------------------------
// Coleta do bundle de dados da semana — mapeado pros metodos/funcoes que existem
// DE VERDADE (lesson #3). §6.1 (grind_session_id IS NULL): getTournaments /
// getPerformanceByPeriod / getDashboardStats / getAnalyticsByModifier ja injetam
// o filtro internamente; queries inline novas (study/grind/wallet/warmup) usam
// tabelas que NAO sao historico de torneio.
// -----------------------------------------------------------------------------
function parseWeekBounds(periodStart: string, periodEnd: string): { weekStart: Date; weekEnd: Date } {
  const weekStart = new Date(`${periodStart}T00:00:00.000Z`);
  const weekEnd = new Date(`${periodEnd}T23:59:59.999Z`);
  return {
    weekStart: isNaN(weekStart.getTime()) ? new Date(0) : weekStart,
    weekEnd: isNaN(weekEnd.getTime()) ? new Date() : weekEnd,
  };
}

async function gatherBundle(storage: any, userId: string, periodStart: string, periodEnd: string) {
  const period = "7d";
  const { weekStart, weekEnd } = parseWeekBounds(periodStart, periodEnd);
  const [
    dashStats7d,
    dashStats30d,
    perfSeries7d,
    tournaments,
    analyticsByModifier,
    leaks,
    consolidated,
    snapshots,
    walletTx,
    studySessionsV2,
    studySessionsV1,
    activeFocus,
    warmupResult,
    plannedTournaments,
    grindSessions,
    aiProfile,
  ] = await Promise.all([
    // getDashboardStats(userId, period) — { count, profit, abi, roi(%), itm(%), finalTables, bigHits, ... }.
    safe(async () => await storage.getDashboardStats?.(userId, period), null),
    safe(async () => await storage.getDashboardStats?.(userId, "30d"), null),
    // getPerformanceByPeriod(userId, period) — serie diaria { date, profit, buyins, count }.
    safe(async () => await storage.getPerformanceByPeriod?.(userId, period), []),
    // getTournaments(userId, limit, offset, period, filters, sortBy) — ja filtra §6.1.
    safe(async () => await storage.getTournaments?.(userId, 5000, 0, period), []),
    safe(async () => await storage.getAnalyticsByModifier?.(userId, { modifier: "speed", period }), null),
    // detectLeaks eh funcao exportada em coachLeakDetection — NAO metodo do storage.
    safe(async () => {
      const { detectLeaks } = await import("../coachLeakDetection");
      return await (detectLeaks as any)(userId, { minSeverity: "low" });
    }, []),
    // getConsolidatedBalance eh metodo do walletService — NAO esta atachado ao
    // objeto storage; importa direto (mesmo pattern de detectLeaks / listWarmupRituals).
    // (Fallback: alguns testes legados mockam storage.getConsolidatedBalance — aceita se existir.)
    safe(async () => {
      if (typeof storage.getConsolidatedBalance === "function") {
        return await storage.getConsolidatedBalance(userId);
      }
      const { walletService } = await import("../services/walletService");
      return await (walletService as any).getConsolidatedBalance(userId);
    }, null),
    // getBankrollSnapshots(userId, { from, to, reason, limit }) — desc por occurredAt.
    // Pega tudo ate o fim da semana pra achar o snapshot mais proximo do inicio.
    safe(async () => await storage.getBankrollSnapshots?.(userId, { to: weekEnd, limit: 200 }), []),
    // listWalletTransactionsByUser(userId, { from, to, reason, limit }) — metodo do DatabaseStorage.
    safe(async () => await storage.listWalletTransactionsByUser?.(userId, { from: weekStart, to: weekEnd }), []),
    // study v2 (registrar sessao) — getStudySessionsV2(userId, { from, to }).
    safe(async () => await storage.getStudySessionsV2?.(userId, { from: weekStart, to: weekEnd, limit: 500 }), []),
    // study v1 (fallback legado) — getStudySessions(userId) e filtra por data.
    safe(async () => {
      const rows = await storage.getStudySessions?.(userId);
      return (Array.isArray(rows) ? rows : []).filter((s: any) => {
        const d = new Date(s?.date ?? s?.createdAt ?? 0);
        return d.getTime() >= weekStart.getTime() && d.getTime() <= weekEnd.getTime();
      });
    }, []),
    safe(async () => await storage.findActiveLeakFocusList?.(userId), []),
    // listWarmupRituals({ userId, from, to, limit }) — funcao LIVRE exportada em storage.ts (nao metodo).
    safe(async () => {
      const mod: any = await import("../storage");
      if (typeof mod.listWarmupRituals === "function") {
        return await mod.listWarmupRituals({ userId, from: weekStart, to: weekEnd, limit: 100 });
      }
      // fallback: alguns testes mockam apenas { storage } — tenta o metodo se existir.
      return await storage.listWarmupRituals?.({ userId, from: weekStart, to: weekEnd, limit: 100 }) ?? { items: [] };
    }, { items: [] }),
    // getPlannedTournaments(userId, dayOfWeek?) — sem dayOfWeek = grade da semana.
    safe(async () => await storage.getPlannedTournaments?.(userId), []),
    // getGrindSessions(userId, { limit }) e filtra por data da semana.
    safe(async () => {
      const rows = await storage.getGrindSessions?.(userId, { limit: 200 });
      return (Array.isArray(rows) ? rows : []).filter((s: any) => {
        const d = new Date(s?.date ?? s?.startTime ?? s?.createdAt ?? 0);
        return d.getTime() >= weekStart.getTime() && d.getTime() <= weekEnd.getTime();
      });
    }, []),
    // getAiStructuredProfile eh funcao LIVRE em storage/aiStructuredProfile.ts —
    // NAO esta atachada ao objeto storage; importa direto.
    // (Fallback: alguns testes legados mockam storage.getAiStructuredProfile — aceita se existir.)
    safe(async () => {
      if (typeof storage.getAiStructuredProfile === "function") {
        return await storage.getAiStructuredProfile(userId);
      }
      const { getAiStructuredProfile } = await import("../storage/aiStructuredProfile");
      return await getAiStructuredProfile(userId);
    }, null),
  ]);

  const studySessions = [
    ...(Array.isArray(studySessionsV2) ? studySessionsV2 : []),
    ...(Array.isArray(studySessionsV1) ? studySessionsV1 : []),
  ];
  const warmupReports = Array.isArray(warmupResult?.items)
    ? warmupResult.items
    : (Array.isArray(warmupResult) ? warmupResult : []);

  return {
    dashStats7d,
    dashStats30d,
    perfSeries7d: Array.isArray(perfSeries7d) ? perfSeries7d : [],
    tournaments: Array.isArray(tournaments) ? tournaments : [],
    analyticsByModifier,
    leaks: Array.isArray(leaks) ? leaks : (Array.isArray((leaks as any)?.leaks) ? (leaks as any).leaks : []),
    consolidated,
    snapshots: Array.isArray(snapshots) ? snapshots : [],
    walletTx: Array.isArray(walletTx) ? walletTx : [],
    studySessions,
    activeFocus: Array.isArray(activeFocus) ? activeFocus : [],
    warmupReports,
    plannedTournaments: Array.isArray(plannedTournaments) ? plannedTournaments : [],
    grindSessions: Array.isArray(grindSessions) ? grindSessions : [],
    aiProfile,
    weekStart,
    weekEnd,
  };
}

// -----------------------------------------------------------------------------
// Secoes deterministicas (numeros)
// -----------------------------------------------------------------------------
function buildSections(bundle: any): ReportContent["sections"] {
  // getDashboardStats: { count, profit, abi, roi(%), itm(%), finalTables(count), bigHits(count), ... }
  const ds7: any = bundle.dashStats7d ?? {};
  const ds30: any = bundle.dashStats30d ?? {};

  const completedSessions = bundle.grindSessions.filter(
    (s: any) => String(s?.status ?? "").toLowerCase() === "completed" || s?.completed === true,
  );
  const sessionsCompleted = completedSessions.length;
  const sessionsPlanned = bundle.plannedTournaments.length || bundle.grindSessions.length;
  const tournamentsN = n(ds7.count ?? ds7.totalTournaments ?? bundle.tournaments.length);
  // itm: getDashboardStats devolve em % (0-100).
  const itmPct = ds7.itm != null && Number.isFinite(Number(ds7.itm)) ? Math.round(Number(ds7.itm) * 10) / 10 : null;
  const finalTables = n(ds7.finalTables ?? ds7.finalTablesCount ?? 0);
  const wins = n(ds7.bigHits ?? ds7.firstPlaceCount ?? 0);
  const roiWeek = ds7.roi != null && Number.isFinite(Number(ds7.roi)) ? Math.round(Number(ds7.roi) * 10) / 10 : null;
  const roi30d = ds30.roi != null && Number.isFinite(Number(ds30.roi)) ? Math.round(Number(ds30.roi) * 10) / 10 : null;

  // bankroll — fonte canonica em USD = walletService.getConsolidatedBalance().totalUSD (lesson #6).
  const consolidated: any = bundle.consolidated ?? {};
  const walletEntries: any[] = Array.isArray(consolidated.wallets)
    ? consolidated.wallets
    : (Array.isArray(consolidated.main) ? consolidated.main : (Array.isArray(consolidated.byCurrency) ? consolidated.byCurrency : []));
  const totalUsdRaw = consolidated.totalUSD ?? consolidated.totalUsd;
  const bankrollNow = totalUsdRaw != null && Number.isFinite(Number(totalUsdRaw)) ? Math.round(Number(totalUsdRaw) * 100) / 100 : null;
  // bankrollStart = snapshot mais proximo do inicio da semana (newAmount, ja em USD do user).
  // getBankrollSnapshots(userId, { to: weekEnd }) devolve desc por occurredAt.
  //  - se existe snapshot com occurredAt < weekStart -> pega o mais recente desses (1o da lista).
  //  - senao (primeiro snapshot ja eh dentro da semana) -> pega o mais antigo da lista (ultimo).
  const weekStartMs = (bundle.weekStart instanceof Date ? bundle.weekStart : new Date(bundle.weekStart ?? 0)).getTime();
  const snaps: any[] = Array.isArray(bundle.snapshots) ? bundle.snapshots : [];
  const tsOf = (s: any) => new Date(s?.occurredAt ?? s?.takenAt ?? 0).getTime();
  const beforeWeek = snaps.find((s: any) => { const t = tsOf(s); return Number.isFinite(t) && t < weekStartMs; }) ?? null;
  const startSnap: any = beforeWeek ?? (snaps.length > 0 ? snaps[snaps.length - 1] : null);
  const startAmtRaw = startSnap?.newAmount ?? startSnap?.totalUsd ?? startSnap?.totalUSD;
  const bankrollStart = startAmtRaw != null && Number.isFinite(Number(startAmtRaw)) ? Math.round(Number(startAmtRaw) * 100) / 100 : null;
  const profitByCurrency = walletEntries.map((w: any) => {
    const cur = String(w?.nativeCurrency ?? w?.currency ?? "USD");
    const native = n(w?.balanceNative ?? w?.native ?? w?.amount ?? 0);
    const usdRaw = w?.balanceUSD ?? w?.usd;
    const usd = usdRaw != null && Number.isFinite(Number(usdRaw)) ? Number(usdRaw) : (cur === "USD" ? native : native);
    return { currency: cur, native, usd: Math.round(usd * 100) / 100 };
  });
  // wallet_transactions: { direction:'in'|'out', reason, usdAmount, nativeAmount, transferGroupId? }.
  const withdrawals = (bundle.walletTx as any[])
    .filter((t: any) => String(t?.reason ?? "").toLowerCase() === "withdrawal")
    .reduce((acc: number, t: any) => acc + Math.abs(n(t?.usdAmount ?? t?.amountUsd ?? t?.nativeAmount ?? 0)), 0);
  const transfers = (bundle.walletTx as any[])
    .filter((t: any) => {
      const r = String(t?.reason ?? "").toLowerCase();
      return r.includes("transfer") || (t?.transferGroupId != null);
    })
    .reduce((acc: number, t: any) => acc + Math.abs(n(t?.usdAmount ?? t?.amountUsd ?? t?.nativeAmount ?? 0)), 0);

  // selection — getAnalyticsByModifier({ modifier: 'speed' }) -> { byModifier: [{ label, roi, n }] } (roi fracao).
  const byMod: any[] = Array.isArray(bundle.analyticsByModifier?.byModifier)
    ? bundle.analyticsByModifier.byModifier
    : (Array.isArray(bundle.analyticsByModifier) ? bundle.analyticsByModifier : []);
  const positives = byMod.filter((m: any) => n(m?.roi) >= 0)
    .sort((a: any, b: any) => n(b?.roi) - n(a?.roi))
    .slice(0, 3)
    .map((m: any) => ({ label: String(m?.label ?? m?.value ?? ""), roi: n(m?.roi), n: n(m?.n ?? m?.count) }));
  const negatives = byMod.filter((m: any) => n(m?.roi) < 0)
    .sort((a: any, b: any) => n(a?.roi) - n(b?.roi))
    .slice(0, 3)
    .map((m: any) => ({ label: String(m?.label ?? m?.value ?? ""), roi: n(m?.roi), n: n(m?.n ?? m?.count), suggestBlock: n(m?.roi) < -0.05 && n(m?.n ?? m?.count) >= 30 }));
  const adherencePct = sessionsPlanned > 0 ? Math.min(100, Math.round((sessionsCompleted / sessionsPlanned) * 100)) : null;

  // study — v2: { durationMinutes, themeId, lessonId }; v1: { duration }.
  const minutesLogged = (bundle.studySessions as any[]).reduce(
    (acc: number, s: any) => acc + n(s?.durationMinutes ?? s?.duration ?? s?.minutes ?? 0),
    0,
  );
  const topicsCovered: string[] = Array.from(
    new Set(
      (bundle.studySessions as any[])
        .map((s: any) => String(s?.themeId ?? s?.theme ?? s?.topic ?? "").trim())
        .filter((x: string) => x.length > 0),
    ),
  ) as string[];
  const focusOfMonth = bundle.aiProfile?.focoDoMes ?? (bundle.activeFocus[0]?.leakCode ?? bundle.activeFocus[0]?.leakTag ?? null);

  // mentalOps — listWarmupRituals items: { emotionalCheckScore(0-10), overrideUsed, decisionToPlay }.
  let mentalOps: ReportContent["sections"]["mentalOps"];
  if ((bundle.warmupReports as any[]).length > 0) {
    const w = bundle.warmupReports as any[];
    const scores = w.map((r: any) => n(r?.emotionalCheckScore ?? r?.focusRating)).filter((x: number) => x > 0);
    // emotionalCheckScore eh 0-10; mapeia pra 0-5 (avgFocusRating) p/ consistencia visual.
    const avg10 = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null;
    mentalOps = {
      hasWarmupData: true,
      warmupSessions: w.length,
      // proxy de "tilt"/sessao ruim: overrideUsed (jogou apesar de score baixo) ou decisionToPlay === false.
      tiltSessions: w.filter((r: any) => r?.overrideUsed === true || r?.decisionToPlay === false).length,
      avgFocusRating: avg10 != null ? Math.round((avg10 / 2) * 10) / 10 : null,
    };
  }

  return {
    volumeResults: {
      sessionsCompleted,
      sessionsPlanned,
      tournaments: tournamentsN,
      itmPct,
      finalTables,
      wins,
      roiWeek,
      roi30d,
    },
    bankroll: {
      profitByCurrency,
      bankrollStart,
      bankrollNow,
      transfers,
      withdrawals,
    },
    selection: {
      ranThisWeek: null,
      adherencePct,
      topCategories: positives,
      bottomCategories: negatives,
    },
    study: {
      minutesLogged,
      topicsCovered,
      focusOfMonth,
      focusCoveragePct: null,
      recommendedLesson: null,
    },
    ...(mentalOps ? { mentalOps } : {}),
  };
}

function renderMarkdown(content: ReportContent): string {
  const lines: string[] = [];
  lines.push(`# ${content.header.title}`);
  lines.push("");
  lines.push(content.header.summaryLine);
  if (content.header.comparison) lines.push(`_${content.header.comparison}_`);
  lines.push("");
  const s = content.sections;
  lines.push("## Volume + Resultados");
  lines.push(`- Sessões: ${s.volumeResults.sessionsCompleted}/${s.volumeResults.sessionsPlanned}`);
  lines.push(`- Torneios: ${s.volumeResults.tournaments}${s.volumeResults.itmPct != null ? ` · ITM ${s.volumeResults.itmPct}%` : ""} · FTs ${s.volumeResults.finalTables} · Cravadas ${s.volumeResults.wins}`);
  if (s.volumeResults.roiWeek != null) lines.push(`- ROI semana: ${s.volumeResults.roiWeek}%${s.volumeResults.roi30d != null ? ` (30d: ${s.volumeResults.roi30d}%)` : ""}`);
  if (s.volumeResults.narrative) lines.push(`> ${s.volumeResults.narrative}`);
  lines.push("");
  lines.push("## Bankroll");
  if (s.bankroll.bankrollNow != null) lines.push(`- Banca atual: $${s.bankroll.bankrollNow}${s.bankroll.bankrollStart != null ? ` (início da semana: $${s.bankroll.bankrollStart})` : ""}`);
  for (const p of s.bankroll.profitByCurrency) lines.push(`- ${p.currency}: ${p.native} (≈ $${p.usd})`);
  lines.push(`- Transferências: $${s.bankroll.transfers} · Saques: $${s.bankroll.withdrawals}`);
  if (s.bankroll.narrative) lines.push(`> ${s.bankroll.narrative}`);
  lines.push("");
  lines.push("## Seleção");
  if (s.selection.topCategories.length) lines.push(`- Top: ${s.selection.topCategories.map((c) => `${c.label} ROI ${Math.round(c.roi * 100)}% (n=${c.n})`).join(", ")}`);
  if (s.selection.bottomCategories.length) lines.push(`- Bottom: ${s.selection.bottomCategories.map((c) => `${c.label} ROI ${Math.round(c.roi * 100)}% (n=${c.n})${c.suggestBlock ? " — bloquear?" : ""}`).join(", ")}`);
  if (s.selection.narrative) lines.push(`> ${s.selection.narrative}`);
  lines.push("");
  lines.push("## Estudos");
  lines.push(`- Tempo: ${s.study.minutesLogged}min${s.study.focusOfMonth ? ` · Foco do mês: ${s.study.focusOfMonth}` : ""}`);
  if (s.study.topicsCovered.length) lines.push(`- Tópicos: ${s.study.topicsCovered.join(", ")}`);
  if (s.study.recommendedLesson) lines.push(`- Aula recomendada: ${s.study.recommendedLesson.title} — ${s.study.recommendedLesson.reason}`);
  if (s.study.narrative) lines.push(`> ${s.study.narrative}`);
  lines.push("");
  if (s.mentalOps) {
    lines.push("## Mental + Operacional");
    lines.push(`- Warm-ups: ${s.mentalOps.warmupSessions}${s.mentalOps.avgFocusRating != null ? ` · Foco médio: ${s.mentalOps.avgFocusRating}/5` : ""} · Sessões com tilt: ${s.mentalOps.tiltSessions}`);
    if (s.mentalOps.narrative) lines.push(`> ${s.mentalOps.narrative}`);
    lines.push("");
  }
  if (content.insights.length) {
    lines.push("## Insights");
    for (const i of content.insights) lines.push(`- ${i.text}${i.citations.length ? ` ${i.citations.join(" ")}` : ""}`);
    lines.push("");
  }
  lines.push("## Plano da próxima semana");
  if (content.nextWeekPlan.recommendedAction) lines.push(`- ${content.nextWeekPlan.recommendedAction}`);
  if (content.nextWeekPlan.studyFocus) lines.push(`- Foco de estudo: ${content.nextWeekPlan.studyFocus}`);
  return lines.join("\n");
}

// -----------------------------------------------------------------------------
// Persistencia idempotente do reports row (UPSERT por (user, type, period_start)).
// -----------------------------------------------------------------------------
async function persistReport(
  storage: any,
  userId: string,
  content: ReportContent,
  markdown: string,
  status: "ready" | "degraded",
  model: string | null,
  usage: any,
  cost: number | null,
): Promise<string | null> {
  try {
    if (typeof storage?.upsertReport !== "function") return null;
    const row: any = {
      id: nanoid(),
      userId,
      reportType: "weekly",
      periodStart: content.periodStart,
      periodEnd: content.periodEnd,
      status,
      content,
      markdown,
      modelUsed: model,
      summarizerModelUsed: content.generation.summarizerModel ?? null,
      costUsdEstimate: cost ?? 0,
      inputTokens: usage ? n(usage.input_tokens ?? usage.inputTokens) : null,
      cacheCreationInputTokens: usage ? n(usage.cache_creation_input_tokens ?? usage.cacheCreationInputTokens) : null,
      cacheReadInputTokens: usage ? n(usage.cache_read_input_tokens ?? usage.cacheReadInputTokens) : null,
      outputTokens: usage ? n(usage.output_tokens ?? usage.outputTokens) : null,
      degradedReason: content.generation.degradedReason ?? null,
    };
    const saved = await storage.upsertReport(row);
    return saved?.id ?? row.id;
  } catch (err) {
    console.error("report.persist.error", { userId, err });
    return null;
  }
}

// -----------------------------------------------------------------------------
// Back-fills (idempotentes)
// -----------------------------------------------------------------------------
async function runBackfills(
  storage: any,
  userId: string,
  bundle: any,
): Promise<{ recommendedLesson: ReportContent["sections"]["study"]["recommendedLesson"] | null; weeklyStudyPlanRef: { weekStartDate: string } | null }> {
  const now = new Date();
  const brtMonday = getCurrentWeekStartBRT(now);
  const utcMonday = utcMondayOfWeek(now);
  let recommendedLesson: any = null;
  let weeklyStudyPlanRef: { weekStartDate: string } | null = null;

  // coach_lesson_recommendations — mesmas chamadas que o cron antigo generateCoachRecommendations.
  try {
    const { recommendLessonForUser } = await import("../coach/recommendLessonForUser");
    const ds7: any = bundle.dashStats7d ?? {};
    const ds30: any = bundle.dashStats30d ?? {};
    const analytics = {
      // getDashboardStats devolve roi em % — recommendLessonForUser espera fracao em alguns paths,
      // mas o cron antigo passava perf?.last7DaysRoi/roi cru; mantemos cru (best-effort).
      last7DaysRoi: n(ds7.roi),
      last7DaysVolume: n(ds7.count ?? ds7.totalTournaments ?? bundle.tournaments.length),
      last7DaysProfit: n(ds7.profit ?? ds7.totalProfit),
      last30DaysRoi: n(ds30.roi),
    };
    const activeProfile = await safe(async () => await storage.getActiveProfile?.(userId), null);
    const result = await recommendLessonForUser({
      userId,
      leaks: Array.isArray(bundle.leaks) ? bundle.leaks : [],
      analytics,
      activeProfile: (activeProfile as any) ?? null,
      accessibleLessonIds: [],
      lastConsumedLessonIds: await safe(async () => await storage.getLastConsumedLessonIds?.(userId, 10), []),
      catalogLessons: await safe(async () => await storage.getCatalogLessonsForRecommendation?.({ limit: 200, orderBy: "createdAt DESC" }), []),
      weekStartDate: ymd(brtMonday),
    } as any);
    if (result) {
      await storage.createCoachRecommendation?.({
        userId,
        lessonId: result.lessonId,
        weekStartDate: ymd(brtMonday),
        reason: result.reason,
        source: result.source,
        inputSummary: { analytics, leaks: bundle.leaks, profile: activeProfile, sampleSize: (bundle.leaks as any[])?.length ?? 0 },
        chatSessionId: result.chatSessionId ?? null,
      });
      // Hidrata o titulo real + ctaHref pra a aula (lesson #19).
      let title = (result as any).title ?? null;
      let ctaHref = "/biblioteca";
      try {
        const lesson = await storage.getLibraryLessonById?.(result.lessonId);
        if (lesson) {
          title = lesson.title ?? title;
          if (lesson.courseSlug && (lesson.slug || lesson.lessonSlug)) {
            ctaHref = `/biblioteca/curso/${lesson.courseSlug}/${lesson.slug ?? lesson.lessonSlug}/play`;
          }
        }
      } catch { /* deixa o /biblioteca generico */ }
      recommendedLesson = {
        lessonId: result.lessonId,
        title: title ?? result.lessonId,
        reason: result.reason,
        ctaHref,
      };
    }
  } catch (err) {
    console.error("report.backfill.lesson_rec.error", { userId, err });
    recommendedLesson = null;
  }

  // study_weekly_plans
  try {
    const { generateWeeklyStudyPlan } = await import("./studyWeeklyPlanService");
    await generateWeeklyStudyPlan({ userId, source: "coach_auto", weekStartDate: utcMonday } as any);
    weeklyStudyPlanRef = { weekStartDate: ymd(utcMonday) };
  } catch (err) {
    console.error("report.backfill.study_plan.error", { userId, err });
    weeklyStudyPlanRef = null;
  }

  return { recommendedLesson, weeklyStudyPlanRef };
}

// -----------------------------------------------------------------------------
// LLM (sonnet 4.6) — narrativas + 3 insights + plano
// Sprint AI-3.2 / RF-B1 (ADR-203) — delega para callReportLlm (paridade 5/5
// generators: weekly + monthly + daily + quarterly + summarizer + recommendLesson).
// -----------------------------------------------------------------------------
async function callLlm(
  model: string,
  bundle: any,
  tone: string,
  level: string | null,
): Promise<{ parsed: any; usage: any } | { clientUnavailable: true; degradedReason?: string }> {
  // Sprint AI-3.2 fix wave / HIGH-1 — imports movidos pro top-level (ver header).
  const out = await callReportLlm({
    systemPrompt: WEEKLY_REPORT_SYSTEM,
    userPromptBuilder: (b, opts) => buildWeeklyReportPrompt({
      tone: opts.tone ?? tone,
      level: opts.level ?? level,
      bundle: b,
    } as any),
    model,
    bundle,
    tone,
    level,
    maxTokens: 3000,
    parseOnError: "fallback-degraded",
  });

  if (out.degradedReason) {
    // Lesson #9 — log error antes do fallback (paridade AI-1B).
    console.error("report.weekly.llm.degraded", {
      degradedReason: out.degradedReason,
      model,
    });
    return { clientUnavailable: true, degradedReason: out.degradedReason };
  }
  return { parsed: out.content ?? {}, usage: out.usage ?? null };
}

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------
export async function generateWeeklyReport(args: GenerateWeeklyReportArgs): Promise<WeeklyReportResult> {
  const { userId, periodStart, periodEnd, failSoft } = args;
  const storage = await resolveStorage(args.injectedStorage);

  // tom / nivel — perfil estruturado (tomPreferido / nivel) tem prioridade;
  // fallback coachTone das preferences.
  let tone: "gentle" | "balanced" | "direct" = "balanced";
  let level: string | null = null;
  try {
    const { getCoachPreferences } = await import("../storage/coachPreferences");
    const prefs = await getCoachPreferences(userId);
    if (prefs?.coachTone) tone = prefs.coachTone as any;
  } catch {
    /* sem prefs — usa default */
  }

  const bundle = await gatherBundle(storage, userId, periodStart, periodEnd);
  if (bundle.aiProfile?.tomPreferido) tone = bundle.aiProfile.tomPreferido;
  if (bundle.aiProfile?.nivel) level = bundle.aiProfile.nivel;

  const sections = buildSections(bundle);

  // dados insuficientes? (volume 0, sem sessoes, sem snapshot, sem estudo)
  const lowData =
    sections.volumeResults.tournaments === 0 &&
    sections.volumeResults.sessionsCompleted === 0 &&
    bundle.snapshots.length === 0 &&
    sections.study.minutesLogged === 0;

  const model = process.env.COACH_MODEL ?? DEFAULT_REPORT_MODEL;
  const label = periodLabel(periodStart, periodEnd);

  // back-fills (idempotentes) — rodam em ok / low / fail-soft.
  const { recommendedLesson, weeklyStudyPlanRef } = await runBackfills(storage, userId, bundle);
  sections.study.recommendedLesson = recommendedLesson;

  // ---- caminho "dados insuficientes" (NAO eh fail-soft; status='ready') ----
  if (lowData) {
    const content: ReportContent = {
      schemaVersion: 1,
      reportType: "weekly",
      periodStart,
      periodEnd,
      dataSufficiency: "low",
      level: level as any,
      tone,
      header: {
        title: `Sua semana — ${label}`,
        summaryLine: "Semana tranquila — você não registrou torneios essa semana. Quer importar seu histórico?",
      },
      sections,
      insights: [],
      nextWeekPlan: {
        gradeSuggestionHref: "/coach",
        studyFocus: sections.study.focusOfMonth ?? null,
        recommendedAction: "Importe seu histórico pra eu acompanhar seus resultados.",
        weeklyStudyPlanRef,
      },
      cta: [
        { label: "Importar histórico", kind: "link", href: "/upload" },
        ...(recommendedLesson ? [{ label: "Ver aula recomendada", kind: "link" as const, href: "/biblioteca" }] : []),
      ],
      generation: { model: null, summarizerModel: null, degraded: false, degradedReason: null, costUsdEstimate: 0 },
    };
    const md = renderMarkdown(content);
    const reportId = await persistReport(storage, userId, content, md, "ready", null, null, 0);
    return { content, markdown: md, status: "ready", model: null, costUsdEstimate: 0, reportId };
  }

  // ---- fail-soft: sem ANTHROPIC_API_KEY -> deterministico direto ----
  if (!process.env.ANTHROPIC_API_KEY && !failSoft) {
    return await buildDeterministic({
      storage,
      userId,
      periodStart,
      periodEnd,
      label,
      sections,
      tone,
      level,
      recommendedLesson,
      weeklyStudyPlanRef,
      degradedReason: "no_anthropic_key",
    });
  }

  // ---- tenta o LLM ----
  let parsed: any = {};
  let usage: any = null;
  let degradedReason: string | null = null;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const out = await callLlm(model, bundle, tone, level);
      if ((out as any).clientUnavailable) {
        // SDK/cliente indisponivel OU callReportLlm retornou degradedReason
        // (Sprint AI-3.2 / RF-B1 — paridade monthly/quarterly).
        // Traduz degradedReason direto para preservar a paridade do schema
        // ('no_anthropic_key' | 'llm_failed_3x' | 'llm_parse_error' | 'llm_timeout').
        const reason = (out as any).degradedReason;
        degradedReason = (reason && typeof reason === "string") ? reason : "no_anthropic_key";
      } else {
        parsed = (out as any).parsed ?? {};
        usage = (out as any).usage ?? null;
      }
    } catch (err) {
      // lesson #9 — logar ANTES do fallback.
      console.error("report.job.error", { userId, periodStart, attempt: "llm", err: err instanceof Error ? err.message : String(err) });
      if (!failSoft) {
        // o runner conta attempts — re-lanca.
        throw err;
      }
      degradedReason = "llm_failed_3x";
    }
  } else {
    // failSoft true + sem key.
    degradedReason = "no_anthropic_key";
  }

  if (degradedReason) {
    return await buildDeterministic({
      storage,
      userId,
      periodStart,
      periodEnd,
      label,
      sections,
      tone,
      level,
      recommendedLesson,
      weeklyStudyPlanRef,
      degradedReason,
    });
  }

  // ---- merge LLM (narrativas + insights + plano) sobre os numeros ----
  const merged = mergeLlm(sections, parsed);
  const insights: ReportContent["insights"] = Array.isArray(parsed?.insights)
    ? parsed.insights.slice(0, 3).map((i: any) => ({
        text: String(i?.text ?? ""),
        citations: Array.isArray(i?.citations) && i.citations.length > 0 ? i.citations.map((c: any) => String(c)) : ["fonte: relatorio semanal"],
        ...(i?.confidence ? { confidence: i.confidence } : {}),
      }))
    : [];
  // garante exatamente 3 (preenche deterministicamente se o LLM nao deu 3).
  while (insights.length < 3) {
    insights.push({
      text: `Você jogou ${merged.volumeResults.tournaments} torneios essa semana.`,
      citations: ["fonte: getPerformanceByPeriod:tournaments:7d"],
      confidence: "high",
    });
  }

  const cost = computeCost(usage);
  const content: ReportContent = {
    schemaVersion: 1,
    reportType: "weekly",
    periodStart,
    periodEnd,
    dataSufficiency: "ok",
    level: level as any,
    tone,
    header: {
      title: parsed?.header?.title ? String(parsed.header.title) : `Sua semana — ${label}`,
      summaryLine: parsed?.header?.summaryLine ? String(parsed.header.summaryLine) :
        `Você jogou ${merged.volumeResults.tournaments} torneios essa semana.`,
      ...(parsed?.header?.comparison ? { comparison: String(parsed.header.comparison) } : {}),
    },
    sections: { ...merged, study: { ...merged.study, recommendedLesson } },
    insights,
    nextWeekPlan: {
      // sanitiza o href do LLM contra rotas registradas (lesson #19) — aluc -> /coach.
      gradeSuggestionHref: sanitizeHref(parsed?.nextWeekPlan?.gradeSuggestionHref, "/coach"),
      studyFocus: parsed?.nextWeekPlan?.studyFocus ?? merged.study.focusOfMonth ?? null,
      recommendedAction: parsed?.nextWeekPlan?.recommendedAction ?? null,
      weeklyStudyPlanRef,
    },
    cta: buildCtas(merged, recommendedLesson),
    generation: { model, summarizerModel: null, degraded: false, degradedReason: null, costUsdEstimate: cost },
  };

  const md = renderMarkdown(content);
  const reportId = await persistReport(storage, userId, content, md, "ready", model, usage, cost);
  return { content, markdown: md, status: "ready", model, usage, costUsdEstimate: cost, reportId };
}

function mergeLlm(sections: ReportContent["sections"], parsed: any): ReportContent["sections"] {
  const out = JSON.parse(JSON.stringify(sections)) as ReportContent["sections"];
  const pSec = parsed?.sections ?? {};
  if (pSec.volumeResults?.narrative) out.volumeResults.narrative = String(pSec.volumeResults.narrative);
  if (pSec.bankroll?.narrative) out.bankroll.narrative = String(pSec.bankroll.narrative);
  if (pSec.selection?.narrative) out.selection.narrative = String(pSec.selection.narrative);
  if (pSec.study?.narrative) out.study.narrative = String(pSec.study.narrative);
  if (out.mentalOps && pSec.mentalOps?.narrative) out.mentalOps.narrative = String(pSec.mentalOps.narrative);
  return out;
}

function buildCtas(
  sections: ReportContent["sections"],
  recommendedLesson: ReportContent["sections"]["study"]["recommendedLesson"] | null,
): ReportContent["cta"] {
  const ctas: ReportContent["cta"] = [];
  // selection: se ha bottom category com suggestBlock -> CTA registrar na grade.
  if (sections.selection.bottomCategories.some((c) => c.suggestBlock)) {
    ctas.push({ label: "Registrar torneio na grade", kind: "tool", toolName: "register_tournament_in_grade" });
  }
  ctas.push({ label: "Abrir grade", kind: "link", href: "/coach" });
  if (recommendedLesson) {
    ctas.push({ label: "Ver aula recomendada", kind: "link", href: "/biblioteca" });
  }
  ctas.push({ label: "Importar histórico", kind: "link", href: "/upload" });
  // sempre ao menos 1 tool E 1 link — garante variedade. Se nenhuma tool, adiciona log_leak_focus.
  if (!ctas.some((c) => c.kind === "tool")) {
    ctas.push({ label: "Registrar foco de leak", kind: "tool", toolName: "log_leak_focus" });
  }
  return ctas;
}

async function buildDeterministic(opts: {
  storage: any;
  userId: string;
  periodStart: string;
  periodEnd: string;
  label: string;
  sections: ReportContent["sections"];
  tone: "gentle" | "balanced" | "direct";
  level: string | null;
  recommendedLesson: ReportContent["sections"]["study"]["recommendedLesson"] | null;
  weeklyStudyPlanRef: { weekStartDate: string } | null;
  degradedReason: string;
}): Promise<WeeklyReportResult> {
  const { storage, userId, periodStart, periodEnd, label, sections, tone, level, recommendedLesson, weeklyStudyPlanRef, degradedReason } = opts;
  const content: ReportContent = {
    schemaVersion: 1,
    reportType: "weekly",
    periodStart,
    periodEnd,
    dataSufficiency: "ok",
    level: level as any,
    tone,
    header: {
      title: `Sua semana — ${label}`,
      summaryLine: `Relatório gerado em modo simplificado — os números estão completos abaixo. Você jogou ${sections.volumeResults.tournaments} torneios essa semana.`,
    },
    sections: { ...sections, study: { ...sections.study, recommendedLesson } },
    insights: [],
    nextWeekPlan: {
      gradeSuggestionHref: "/coach",
      studyFocus: sections.study.focusOfMonth ?? null,
      recommendedAction: null,
      weeklyStudyPlanRef,
    },
    cta: [
      { label: "Abrir grade", kind: "link", href: "/coach" },
      ...(recommendedLesson ? [{ label: "Ver aula recomendada", kind: "link" as const, href: "/biblioteca" }] : []),
      { label: "Importar histórico", kind: "link", href: "/upload" },
    ],
    generation: { model: null, summarizerModel: null, degraded: true, degradedReason, costUsdEstimate: 0 },
  };
  const md = renderMarkdown(content);
  const reportId = await persistReport(storage, userId, content, md, "degraded", null, null, 0);
  return { content, markdown: md, status: "degraded", model: null, degradedReason, costUsdEstimate: 0, reportId };
}
