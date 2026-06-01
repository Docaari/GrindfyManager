// =============================================================================
// weeklyReviewOrchestrator — EST-5 (ADR-226)
//
// Maquina de estados "Weekly Review" (ritual de segunda). Espelha
// weeklyPlanningOrchestrator. NAO chama LLM (DEC-1) — recap + deep analysis sao
// deterministicos (buildRecap / buildDeepAnalysisNarrative).
//
//   createWeeklyReview(userId, weekStartDate?, opts?) -> { review } (idempotente)
//   getWeeklyReview(userId, weekStartDate, injectedStorage?) -> WeeklyReview|null
//   advanceWeeklyReview(userId, weekStartDate, from, to, injectedStorage?)
//   confirmUpload(userId, weekStartDate, ctx?) -> { review, uploadDetected, source }
//   runDeepAnalysis(userId, weekStartDate, ctx?) -> WeeklyReview
//   handoffToPlanning(userId, weekStartDate, ctx?) -> WeeklyReview
//
// Erros nomeados (err.code): invalid_weekly_review_transition,
//   weekly_review_not_found, tier_not_eligible, weekly_review_persist_failed.
//
// Lessons: #34 (injectedStorage por composicao), #9 (log antes do fallback),
//   #6 (FX->USD herdado dos builders), #28 (mock por path).
// =============================================================================

import {
  VALID_TRANSITIONS,
  type WeeklyReview,
  type WeeklyReviewStatus,
} from "../../../shared/coach-weekly-review";
import { ymdUtc, nextMondayUtc, ymdToUtcDate } from "../planning/weekKeys";
import { getReportTier } from "../reportEligibility";
import { startPlanning } from "../planning/weeklyPlanningOrchestrator";
import {
  gatherBundle,
  buildMentalState,
  buildStudyWeek,
} from "../../services/weeklyReportGenerator";
import { buildRecap } from "./buildRecap";
import { buildAdherenceRecap } from "../adherence";
import { buildDeepAnalysisNarrative } from "./buildDeepAnalysisNarrative";
import { numOr, normalizeRoi } from "./numUtils";

export interface WeeklyReviewCtx {
  injectedStorage?: any;
}

const RECENT_IMPORT_MS = 24 * 60 * 60 * 1000;

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../../storage");
  return (mod as any).storage;
}

function namedError(code: string): Error & { code: string } {
  const err: any = new Error(code);
  err.code = code;
  return err;
}

/**
 * Gate de tier (paridade EST-6 assertTierEligible): relatorios/ritual sao para
 * tier elegivel (Trial/Pro/Premium/admin). Free/expired -> tier_not_eligible.
 * Defesa-em-profundidade: o tick ja gateia, mas o endpoint /start e publico —
 * sem este gate um Free criaria review (HIGH do review EST-5).
 */
async function assertTierEligible(storage: any, userId: string): Promise<void> {
  const user = await storage.getUserByPlatformId?.(userId);
  const tier = await getReportTier(user ?? null);
  if (tier === "free") {
    throw namedError("tier_not_eligible");
  }
}

function normalizeReview(raw: any): WeeklyReview {
  if (!raw || typeof raw !== "object") {
    throw namedError("weekly_review_persist_failed");
  }
  return {
    id: raw.id,
    userId: raw.userId,
    weekStartDate: raw.weekStartDate,
    status: raw.status,
    recapContent: raw.recapContent ?? raw.recap_content ?? null,
    analysisContent: raw.analysisContent ?? raw.analysis_content ?? null,
    uploadSource: raw.uploadSource ?? raw.upload_source ?? null,
    planningSessionId: raw.planningSessionId ?? raw.planning_session_id ?? null,
    chatSessionId: raw.chatSessionId ?? raw.chat_session_id ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/** Periodo da semana ANTERIOR (segunda..domingo) relativo a chave da review. */
function prevWeekPeriod(weekStartDate: string): { periodStart: string; periodEnd: string } {
  const monday = ymdToUtcDate(weekStartDate);
  const prevMonday = new Date(monday.getTime());
  prevMonday.setUTCDate(prevMonday.getUTCDate() - 7);
  const prevSunday = new Date(prevMonday.getTime());
  prevSunday.setUTCDate(prevSunday.getUTCDate() + 6);
  return { periodStart: ymdUtc(prevMonday), periodEnd: ymdUtc(prevSunday) };
}

/** Periodo dos ultimos 7 dias (hoje-7d .. hoje) para a deep analysis. */
function last7dPeriod(now: Date = new Date()): { periodStart: string; periodEnd: string } {
  const end = new Date(now.getTime());
  const start = new Date(now.getTime());
  start.setUTCDate(start.getUTCDate() - 7);
  return { periodStart: ymdUtc(start), periodEnd: ymdUtc(end) };
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    const v = await fn();
    return v === undefined || v === null ? fallback : v;
  } catch (err) {
    // lesson #9 — loga antes do fallback.
    console.error("weekly_review.recap.gather.error", { err });
    return fallback;
  }
}

/**
 * Monta o recap_content (RF-04) da semana anterior. NAO usa gatherBundle (que e
 * reservado para a deep analysis 7d em runDeepAnalysis) — coleta os dados da
 * semana anterior direto do storage (best-effort). Em ambiente sem esses metodos
 * (testes), degrada para recap minimalista (hasData=false). DEC-1: sem LLM.
 */
async function buildWeeklyRecapContent(
  storage: any,
  userId: string,
  periodStart: string,
  periodEnd: string,
): Promise<any> {
  const weekStart = ymdToUtcDate(periodStart);
  const weekEnd = ymdToUtcDate(periodEnd);

  // MEDIUM-3 (review): performance alinhada ao intervalo Mon-Sun anunciado no
  // cabecalho (NAO janela rolante "7d"). 'custom' + dateFrom/dateTo cobre o
  // domingo inteiro (fim do dia). getDashboardStats ja filtra historico (§6.1).
  const customFilters = { dateFrom: periodStart, dateTo: `${periodEnd}T23:59:59.999Z` };
  const [dashStats, grindSessions, studyV2] = await Promise.all([
    safe(async () => await storage.getDashboardStats?.(userId, "custom", customFilters), null),
    safe(async () => {
      const rows = await storage.getGrindSessions?.(userId, { limit: 200 });
      return (Array.isArray(rows) ? rows : []).filter((s: any) => {
        const d = new Date(s?.date ?? s?.startTime ?? s?.createdAt ?? 0);
        return d.getTime() >= weekStart.getTime() && d.getTime() <= weekEnd.getTime();
      });
    }, [] as any[]),
    safe(
      async () =>
        await storage.getStudySessionsV2?.(userId, {
          from: weekStart,
          to: weekEnd,
          limit: 500,
        }),
      [] as any[],
    ),
  ]);

  // break_feedbacks das sessoes da semana (EST-2) — best-effort.
  const sessionIds = (Array.isArray(grindSessions) ? grindSessions : [])
    .map((s: any) => s?.id)
    .filter((id: any): id is string => typeof id === "string" && id.length > 0);
  const breakFeedbacks = await safe(
    async () => (await storage.getBreakFeedbacksBySessionIds?.(userId, sessionIds)) ?? [],
    [] as any[],
  );

  // Reusa os builders deterministicos do EST-2 (sem gatherBundle).
  const recapBundle: any = {
    dashStats7d: dashStats,
    grindSessions,
    studySessions: Array.isArray(studyV2) ? studyV2 : [],
    breakFeedbacks: Array.isArray(breakFeedbacks) ? breakFeedbacks : [],
    weekStart,
    weekEnd,
  };
  const mentalState = safeSync(() => buildMentalState(recapBundle), null);
  const studyWeek = safeSync(() => buildStudyWeek(recapBundle), null);

  // DEC-MA6 (ADR-227) — Motor de Aderência: compara plano (EST-6) x realizado da
  // semana anterior. Best-effort (lesson #9 — degrade se motor falhar); ausente
  // -> recap byte-idêntico (lesson #7). A janela é a semana anterior (periodStart).
  const adherence = await safe(
    async () => await buildAdherenceRecap(userId, periodStart, storage),
    null,
  );

  return buildRecap({
    periodStart,
    periodEnd,
    dashStats7d: dashStats,
    mentalState,
    studyWeek,
    adherence,
  });
}

function safeSync<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn();
    return v === undefined || v === null ? fallback : v;
  } catch (err) {
    console.error("weekly_review.recap.build.error", { err });
    return fallback;
  }
}

async function postToChat(
  storage: any,
  userId: string,
  content: string,
): Promise<string | null> {
  try {
    const chat = await storage.getOrCreateReportChatSession(userId);
    await storage.insertChatMessage({
      chatSessionId: chat?.id,
      role: "assistant",
      content,
    });
    return chat?.id ?? null;
  } catch (err) {
    console.error("weekly_review.post_chat.error", { userId, err });
    return null;
  }
}

// -----------------------------------------------------------------------------
// createWeeklyReview (RF-01) — idempotente + recap no chat + avanca p/ awaiting_upload
// -----------------------------------------------------------------------------
export async function createWeeklyReview(
  userId: string,
  weekStartDate?: string,
  opts?: { injectedStorage?: any },
): Promise<{ review: WeeklyReview }> {
  const storage = await resolveStorage(opts?.injectedStorage);

  // Gate de tier (HIGH do review): Free/expired nao cria review nem recebe ritual.
  await assertTierEligible(storage, userId);

  const wsd = weekStartDate ?? ymdUtc(nextMondayUtc());

  // Monta o recap (deterministico — DEC-1) da semana anterior. O recap so e
  // montado uma vez, na criacao; gatherBundle e reservado para a deep analysis
  // (RF-06) — aqui usamos buildWeeklyRecapContent que coleta os dados via
  // gatherWeeklyRecapBundle (best-effort, log antes do fallback — lesson #9).
  const { periodStart, periodEnd } = prevWeekPeriod(wsd);
  const recapContent = await buildWeeklyRecapContent(storage, userId, periodStart, periodEnd);

  // Cria a review (idempotente por UNIQUE) em recap_sent.
  const created = await storage.createWeeklyReview({
    userId,
    weekStartDate: wsd,
    status: "recap_sent",
    recapContent,
  });
  const review = normalizeReview(created);

  // Idempotencia: se ja existia (status != recap_sent), nao re-posta/avanca.
  if (review.status !== "recap_sent") {
    return { review };
  }

  // Posta o recap no chat (RF-03) — falha NAO derruba a criacao (lesson #9 / R-2).
  const chatSessionId = await postToChat(storage, userId, String(recapContent?.markdown ?? ""));

  // Avanca p/ awaiting_upload (recap postado).
  const updated = await storage.updateWeeklyReview(review.id, {
    status: "awaiting_upload",
    chatSessionId,
  });
  return { review: normalizeReview(updated ?? { ...review, status: "awaiting_upload", chatSessionId }) };
}

// -----------------------------------------------------------------------------
// getWeeklyReview (RF-01) — null se nao existe (NAO lanca)
// -----------------------------------------------------------------------------
export async function getWeeklyReview(
  userId: string,
  weekStartDate: string,
  injectedStorage?: any,
): Promise<WeeklyReview | null> {
  const storage = await resolveStorage(injectedStorage);
  const raw = await storage.getWeeklyReview(userId, weekStartDate);
  return raw ? normalizeReview(raw) : null;
}

// -----------------------------------------------------------------------------
// advanceWeeklyReview (RF-01) — transicao guardada por VALID_TRANSITIONS
// -----------------------------------------------------------------------------
export async function advanceWeeklyReview(
  userId: string,
  weekStartDate: string,
  fromStatus: WeeklyReviewStatus,
  toStatus: WeeklyReviewStatus,
  injectedStorage?: any,
): Promise<WeeklyReview> {
  const storage = await resolveStorage(injectedStorage);
  const raw = await storage.getWeeklyReview(userId, weekStartDate);
  if (!raw) throw namedError("weekly_review_not_found");

  assertTransition(fromStatus, toStatus);

  const review = normalizeReview(raw);
  const updated = await storage.updateWeeklyReview(review.id, { status: toStatus });
  return normalizeReview(updated ?? { ...review, status: toStatus });
}

function assertTransition(from: WeeklyReviewStatus, to: WeeklyReviewStatus): void {
  const allowed = VALID_TRANSITIONS.get(from);
  if (!allowed || !allowed.has(to)) {
    throw namedError("invalid_weekly_review_transition");
  }
}

// -----------------------------------------------------------------------------
// confirmUpload (RF-05) — sinal explicito vence + heuristico recent_import
// -----------------------------------------------------------------------------
export async function confirmUpload(
  userId: string,
  weekStartDate: string,
  ctx?: { injectedStorage?: any },
): Promise<{ review: WeeklyReview; uploadDetected: boolean; source: "explicit" | "recent_import" }> {
  const storage = await resolveStorage(ctx?.injectedStorage);
  const raw = await storage.getWeeklyReview(userId, weekStartDate);
  if (!raw) throw namedError("weekly_review_not_found");
  let review = normalizeReview(raw);

  // Heuristica: import < 24h -> recent_import; senao explicit (botao sempre confirma).
  const lastUploadAt: Date | null = (await storage.getLastUploadAt?.(userId)) ?? null;
  const lastMs = lastUploadAt ? new Date(lastUploadAt).getTime() : null;
  const recent = lastMs != null && Date.now() - lastMs < RECENT_IMPORT_MS;
  const uploadDetected = recent;
  const source: "explicit" | "recent_import" = recent ? "recent_import" : "explicit";

  // Estado terminal -> no-op (nao reprocessa).
  if (review.status === "deep_analysis_done" || review.status === "planning") {
    return { review, uploadDetected, source };
  }

  // Confirma: awaiting_upload -> upload_confirmed.
  if (review.status === "awaiting_upload") {
    const updated = await storage.updateWeeklyReview(review.id, {
      status: "upload_confirmed",
      uploadSource: source,
    });
    review = normalizeReview(updated ?? { ...review, status: "upload_confirmed", uploadSource: source });
  } else {
    // Estado nao permite confirmar (ex: recap_sent) -> transicao invalida.
    throw namedError("invalid_weekly_review_transition");
  }

  // Deep analysis síncrona best-effort. Falha -> review fica em upload_confirmed.
  try {
    review = await runDeepAnalysis(userId, weekStartDate, ctx);
  } catch (err) {
    console.error("weekly_review.confirm.deep_analysis.error", { userId, weekStartDate, err });
    return { review, uploadDetected, source };
  }

  // Handoff p/ planning (best-effort). tier_not_eligible -> fica em deep_analysis_done.
  try {
    review = await handoffToPlanning(userId, weekStartDate, ctx);
  } catch (err) {
    console.error("weekly_review.confirm.handoff.error", { userId, weekStartDate, err });
  }

  return { review, uploadDetected, source };
}

// -----------------------------------------------------------------------------
// runDeepAnalysis (RF-06) — deterministica, sem LLM, posta no chat
// -----------------------------------------------------------------------------
export async function runDeepAnalysis(
  userId: string,
  weekStartDate: string,
  ctx?: { injectedStorage?: any },
): Promise<WeeklyReview> {
  const storage = await resolveStorage(ctx?.injectedStorage);
  const raw = await storage.getWeeklyReview(userId, weekStartDate);
  if (!raw) throw namedError("weekly_review_not_found");
  const review = normalizeReview(raw);

  const { periodStart, periodEnd } = last7dPeriod();
  // Historico (grind_session_id IS NULL) + break_feedbacks + estudo via gatherBundle.
  const bundle: any = await gatherBundle(storage, userId, periodStart, periodEnd);
  const mentalState = buildMentalState(bundle);
  const studyWeek = buildStudyWeek(bundle);
  const dash = bundle?.dashStats7d ?? {};
  const analysisContent = buildDeepAnalysisNarrative({
    periodStart,
    periodEnd,
    performance7d: {
      volume: numOr((dash as any)?.count, 0),
      profitUsd: numOr((dash as any)?.profit, 0),
      roiPct: normalizeRoi((dash as any)?.roi),
    },
    mentalState,
    studyWeek,
    deltaVsPrevWeek: null,
  });

  // Posta a analise no chat (RF-03).
  await postToChat(storage, userId, String(analysisContent.markdown ?? ""));

  // Persiste analysis_content + avanca p/ deep_analysis_done (se permitido).
  const patch: any = { analysisContent };
  if (review.status === "upload_confirmed") {
    patch.status = "deep_analysis_done";
  }
  const updated = await storage.updateWeeklyReview(review.id, patch);
  return normalizeReview(updated ?? { ...review, ...patch });
}

// -----------------------------------------------------------------------------
// handoffToPlanning (RF-07) — startPlanning + transicao p/ planning
// -----------------------------------------------------------------------------
export async function handoffToPlanning(
  userId: string,
  weekStartDate: string,
  ctx?: { injectedStorage?: any },
): Promise<WeeklyReview> {
  const storage = await resolveStorage(ctx?.injectedStorage);
  const raw = await storage.getWeeklyReview(userId, weekStartDate);
  if (!raw) throw namedError("weekly_review_not_found");
  let review = normalizeReview(raw);

  // Ja em planning -> no-op (startPlanning idempotente, mas evitamos re-chamar).
  if (review.status === "planning") {
    return review;
  }

  let planningSessionId: string | null = review.planningSessionId;
  try {
    const res: any = await startPlanning(userId, weekStartDate, {
      source: "est5_ritual",
      injectedStorage: ctx?.injectedStorage,
    });
    planningSessionId = res?.session?.id ?? planningSessionId;
  } catch (err: any) {
    // tier downgrade pos-tick -> review fica em deep_analysis_done (lesson #9).
    console.error("weekly_review.handoff.start_planning.error", { userId, weekStartDate, err });
    const failPatch: any = { status: "deep_analysis_done" };
    const failUpdated = await storage.updateWeeklyReview(review.id, failPatch);
    return normalizeReview(failUpdated ?? { ...review, ...failPatch });
  }

  const patch: any = { planningSessionId, status: "planning" };
  const updated = await storage.updateWeeklyReview(review.id, patch);
  review = normalizeReview(updated ?? { ...review, ...patch });
  return review;
}
