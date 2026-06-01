// =============================================================================
// weeklyPlanningOrchestrator — EST-6 (ADR-224)
//
// Orquestra o Next-Week Planning Flow: 4 sub-decisoes (grind/study/lessons/
// themes) como lista ordenada de passos, persistidas como estado leve em
// weekly_planning_sessions. NAO recria os tools AI-2A — delega a eles.
//
// Ponto de entrada PLUGGAVEL (HTTP /api/coach/planning/start + EST-5 direto):
//   startPlanning(userId, weekStartDate?, opts?) -> { session } (idempotente)
//   getPlanningSession(userId, weekStartDate, injectedStorage?) -> session | null
//   proposeStep(step, weekStartDate, input, ctx) -> { preview, step, status }
//   confirmStep(step, weekStartDate, input, ctx) -> { session, stepResult }
//   skipStep(step, weekStartDate, ctx)           -> { session }
//
// Mapa :step -> tool (DEC-2 / ADR-224):
//   grind   -> bulkProposeGradeTool (preview=fetchPayloadBefore; confirm=executeConfirmed)
//              + markOffDayTool auxiliar quando input.offDays presente
//   study   -> loop scheduleStudyBlockTool.executeConfirmed + upsertStudyWeeklyPlan (UTC)
//   lessons -> recommendLessonTool.handler (whitelist) + createCoachRecommendation (BRT)
//   themes  -> getStatsLeaks (read-only; degrade gracioso — getStatsLeaks=[] e o normal)
//
// Lessons: #34 (injectedStorage por composicao), #32 (sem db.transaction —
// passa tx=undefined aos tools), #9 (log antes do fallback), #28 (mock por path).
// =============================================================================

import {
  PLANNING_STEP_KEYS,
  initialPlanningSteps,
  type PlanningStepKey,
  type PlanningStepStatus,
  type PlanningSteps,
  type PlanningSource,
  type WeeklyPlanningSession,
} from "../../../shared/coach-planning";
import { ymdUtc, ymdToUtcDate, nextMondayUtc, brtMondayYmd } from "./weekKeys";
import { bulkProposeGradeTool } from "../../coachTools/handlers/bulkProposeGrade";
import { scheduleStudyBlockTool } from "../../coachTools/handlers/scheduleStudyBlock";
import { markOffDayTool } from "../../coachTools/handlers/markOffDay";
import { recommendLessonTool } from "../../coachTools/recommendLesson";
import { getReportTier } from "../reportEligibility";

export interface PlanningCtx {
  userId: string;
  injectedStorage?: any;
}

const TOP_LEAKS = 3;

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../../storage");
  return (mod as any).storage;
}

function assertValidStep(step: PlanningStepKey): void {
  if (!PLANNING_STEP_KEYS.includes(step)) {
    throw new Error(`invalid_planning_step: ${step}`);
  }
}

/**
 * DEC-4 defense-in-depth: revalida o tier a cada propose/confirm (nao so no
 * startPlanning). Downgrade pos-start NAO pode permitir escrita. Reusa o mesmo
 * helper de resolucao de user (getUserByPlatformId) + getReportTier do start.
 */
async function assertTierEligible(storage: any, userId: string): Promise<void> {
  const user = await storage.getUserByPlatformId?.(userId);
  const tier = await getReportTier(user ?? null);
  if (tier === "free") {
    const err: any = new Error("tier_not_eligible");
    err.code = "tier_not_eligible";
    throw err;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

// study_weekly_plans.dailyTargetMinutes (alinhado ao clamp do studyWeeklyPlanService).
const MIN_DAILY_MINUTES = 5;
const MAX_DAILY_MINUTES = 240;
const DEFAULT_DAILY_MINUTES = 30;

// -----------------------------------------------------------------------------
// startPlanning (RF-01) — idempotente + gate de tier
// -----------------------------------------------------------------------------
export async function startPlanning(
  userId: string,
  weekStartDate?: string,
  opts?: { source?: PlanningSource; injectedStorage?: any },
): Promise<{ session: WeeklyPlanningSession }> {
  const storage = await resolveStorage(opts?.injectedStorage);

  // Gate de entrada (DEC-4): tier elegivel != free. Free/expired -> lanca.
  await assertTierEligible(storage, userId);

  const wsd = weekStartDate ?? ymdUtc(nextMondayUtc());
  const source: PlanningSource = opts?.source ?? "coach_manual";

  const session = await storage.createWeeklyPlanningSession({
    userId,
    weekStartDate: wsd,
    status: "in_progress",
    steps: initialPlanningSteps(),
    source,
  });
  return { session: normalizeSession(session) };
}

// -----------------------------------------------------------------------------
// getPlanningSession (RF-06) — contrato pluggavel pro EST-5
// -----------------------------------------------------------------------------
export async function getPlanningSession(
  userId: string,
  weekStartDate: string,
  injectedStorage?: any,
): Promise<WeeklyPlanningSession | null> {
  const storage = await resolveStorage(injectedStorage);
  const session = await storage.getWeeklyPlanningSession(userId, weekStartDate);
  return session ? normalizeSession(session) : null;
}

function normalizeSession(raw: any): WeeklyPlanningSession {
  // Guard contra race: createWeeklyPlanningSession (onConflictDoNothing + re-
  // leitura) pode vir null sob race. Lanca erro nomeado em vez de TypeError.
  if (!raw || typeof raw !== "object") {
    const err: any = new Error("planning_session_persist_failed");
    err.code = "planning_session_persist_failed";
    throw err;
  }
  const steps: PlanningSteps =
    raw?.steps && typeof raw.steps === "object" && raw.steps.grind
      ? raw.steps
      : initialPlanningSteps();
  return {
    id: raw.id,
    userId: raw.userId,
    weekStartDate: raw.weekStartDate,
    status: raw.status,
    source: raw.source,
    steps,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

async function loadSessionOrThrow(
  storage: any,
  userId: string,
  weekStartDate: string,
): Promise<WeeklyPlanningSession> {
  const session = await storage.getWeeklyPlanningSession(userId, weekStartDate);
  if (!session) {
    const err: any = new Error("planning_session_not_found");
    err.code = "planning_session_not_found";
    throw err;
  }
  return normalizeSession(session);
}

// -----------------------------------------------------------------------------
// proposeStep — preview (nao persiste write de torneio/estudo)
// -----------------------------------------------------------------------------
export async function proposeStep(
  step: PlanningStepKey,
  weekStartDate: string,
  input: unknown,
  ctx: PlanningCtx,
): Promise<{ preview: any; step: PlanningStepKey; status: PlanningStepStatus }> {
  assertValidStep(step);
  const storage = await resolveStorage(ctx.injectedStorage);
  // DEC-4 defense-in-depth: revalida tier (downgrade pos-start nao escreve).
  await assertTierEligible(storage, ctx.userId);
  const toolCtx = { userId: ctx.userId, injectedStorage: ctx.injectedStorage };

  let preview: any = null;
  if (step === "grind") {
    // weekStartDate do path vence (alinha o tool ao path; evita ZodError 500).
    const grindInput = { ...(input as any), weekStartDate };
    const res = await bulkProposeGradeTool.fetchPayloadBefore(
      grindInput as any,
      toolCtx,
      undefined,
    );
    preview = (res as any)?.preview ?? res;
  } else if (step === "study") {
    // schedule_study_block.fetchPayloadBefore retorna null — o preview de
    // blocos eh montado a partir do proprio input (sugestao deterministica).
    preview = { blocks: (input as any)?.blocks ?? [] };
  } else if (step === "lessons") {
    const res: any = await recommendLessonTool.handler(input as any, toolCtx);
    preview = res?.data ?? res;
  } else {
    // themes — read-only
    preview = { focus: await deriveThemeFocus(storage, ctx.userId) };
  }

  // Marca o passo como `proposed` (preserva os demais).
  await mutateStep(storage, ctx.userId, weekStartDate, step, (s) => ({
    ...s,
    status: "proposed",
    proposedAt: nowIso(),
  }));

  return { preview, step, status: "proposed" };
}

// -----------------------------------------------------------------------------
// confirmStep — delega ao tool correspondente
// -----------------------------------------------------------------------------
export async function confirmStep(
  step: PlanningStepKey,
  weekStartDate: string,
  input: unknown,
  ctx: PlanningCtx,
): Promise<{ session: WeeklyPlanningSession; stepResult: any }> {
  assertValidStep(step);
  const storage = await resolveStorage(ctx.injectedStorage);
  // DEC-4 defense-in-depth: revalida tier ANTES de qualquer escrita.
  await assertTierEligible(storage, ctx.userId);
  const toolCtx = { userId: ctx.userId, injectedStorage: ctx.injectedStorage };
  const inp: any = input ?? {};

  let stepResult: any = {};
  let patch: any = { status: "confirmed" as PlanningStepStatus, confirmedAt: nowIso() };

  if (step === "grind") {
    // mark_off_day auxiliar: se o jogador pediu folga, marca ANTES de re-propor.
    if (Array.isArray(inp.offDays) && inp.offDays.length > 0) {
      for (const offDate of inp.offDays) {
        await markOffDayTool.executeConfirmed({ offDate }, toolCtx, undefined);
      }
      patch.offDays = inp.offDays;
    }
    // weekStartDate do path vence o body (evita desalinhamento + ZodError 500).
    const grindInput = { ...inp, weekStartDate };
    const res: any = await bulkProposeGradeTool.executeConfirmed(
      grindInput,
      toolCtx,
      undefined,
    );
    const createdIds: string[] = res?.payloadAfter?.createdIds ?? [];
    patch.createdIds = createdIds;
    stepResult = res;
  } else if (step === "study") {
    const blocks: any[] = Array.isArray(inp.blocks) ? inp.blocks : [];
    const sessionIds: string[] = [];
    for (const block of blocks) {
      const res: any = await scheduleStudyBlockTool.executeConfirmed(
        block,
        toolCtx,
        undefined,
      );
      const sid = res?.output?.sessionId ?? res?.payloadAfter?.id;
      if (sid) sessionIds.push(sid);
    }
    // UPSERT do snapshot em study_weekly_plans (chave UTC existente).
    await syncStudyWeeklyPlan(storage, ctx.userId, weekStartDate, blocks);
    patch.sessionIds = sessionIds;
    patch.weeklyPlanSynced = true;
    stepResult = { sessionIds };
  } else if (step === "lessons") {
    stepResult = await confirmLessons(storage, ctx.userId, weekStartDate, inp, toolCtx);
    patch.lessonIds = stepResult.lessonIds;
    patch.recIds = stepResult.recIds;
    if (Array.isArray(stepResult.droppedLessonIds) && stepResult.droppedLessonIds.length > 0) {
      patch.droppedLessonIds = stepResult.droppedLessonIds;
    }
  } else {
    // themes — read-only; deriva focus dos leaks (degrade gracioso).
    const focus = await deriveThemeFocus(storage, ctx.userId);
    patch.focus = focus;
    stepResult = { focus };
  }

  const session = await mutateStep(
    storage,
    ctx.userId,
    weekStartDate,
    step,
    (s) => ({ ...s, ...patch }),
  );
  return { session, stepResult };
}

// -----------------------------------------------------------------------------
// skipStep
// -----------------------------------------------------------------------------
export async function skipStep(
  step: PlanningStepKey,
  weekStartDate: string,
  ctx: PlanningCtx,
): Promise<{ session: WeeklyPlanningSession }> {
  assertValidStep(step);
  // skip nao escreve dominio (so marca status='skipped') -> sem gate de tier;
  // a defesa-em-profundidade vive em proposeStep/confirmStep (que escrevem).
  const storage = await resolveStorage(ctx.injectedStorage);
  const session = await mutateStep(
    storage,
    ctx.userId,
    weekStartDate,
    step,
    (s) => ({ ...s, status: "skipped" as PlanningStepStatus }),
  );
  return { session };
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

/**
 * Aplica `fn` ao passo, persiste via updateWeeklyPlanningSession, recomputa o
 * status da sessao (completed quando todos os 4 passos ∈ {confirmed,skipped}) e,
 * na transicao para completed, posta o resumo no chat (uma vez).
 */
async function mutateStep(
  storage: any,
  userId: string,
  weekStartDate: string,
  step: PlanningStepKey,
  fn: (s: any) => any,
): Promise<WeeklyPlanningSession> {
  const current = await loadSessionOrThrow(storage, userId, weekStartDate);
  const steps: PlanningSteps = {
    ...current.steps,
    [step]: fn((current.steps as any)[step] ?? { status: "pending" }),
  };

  const allDone = PLANNING_STEP_KEYS.every((k) => {
    const st = (steps as any)[k]?.status;
    return st === "confirmed" || st === "skipped";
  });
  const wasCompleted = current.status === "completed";
  const nextStatus = allDone ? "completed" : "in_progress";

  const updated = await storage.updateWeeklyPlanningSession(current.id, {
    steps,
    status: nextStatus,
  });
  const session = normalizeSession(updated ?? { ...current, steps, status: nextStatus });

  if (nextStatus === "completed" && !wasCompleted) {
    await postPlanningSummaryToChat(storage, userId, session);
  }
  return session;
}

/** RF-05 — temas-foco derivados de getStatsLeaks (degrade gracioso). */
async function deriveThemeFocus(storage: any, userId: string): Promise<any[]> {
  try {
    const leaks: any[] = (await storage.getStatsLeaks?.(userId, TOP_LEAKS)) ?? [];
    if (Array.isArray(leaks) && leaks.length > 0) {
      return leaks.slice(0, TOP_LEAKS).map((l) => ({
        statId: l.statId,
        statName: l.statName,
        severity: l.severity,
        source: "leaks" as const,
      }));
    }
  } catch (err) {
    // lesson #9 — loga antes do fallback.
    console.error("planning.derive_theme_focus.leaks.error", { userId, err });
  }
  // Fallback: focus stats (quando disponivel). getStatsLeaks=[] eh o normal.
  try {
    const focusStats: any[] = (await storage.listFocusStats?.(userId)) ?? [];
    if (Array.isArray(focusStats) && focusStats.length > 0) {
      return focusStats.slice(0, TOP_LEAKS).map((f) => ({
        statId: f.statId ?? f.id ?? "focus",
        statName: f.statName ?? f.name ?? "Foco",
        severity: f.severity,
        source: "focus_stats" as const,
      }));
    }
  } catch (err) {
    console.error("planning.derive_theme_focus.focus_stats.error", { userId, err });
  }
  // Nenhum leak/focus -> vazio (flow nao quebra).
  return [];
}

/** RF-03 — UPSERT do snapshot em study_weekly_plans (chave UTC). */
async function syncStudyWeeklyPlan(
  storage: any,
  userId: string,
  weekStartDate: string,
  blocks: any[],
): Promise<void> {
  const totalMinutes = blocks.reduce(
    (acc, b) => acc + (Number(b?.durationMinutes) || 0),
    0,
  );
  // dailyTargetMinutes = media POR DIA distinto (alvo diario, NAO soma semanal).
  // Dias distintos = Set dos YYYY-MM-DD de startAt (clamp 5..240; default 30).
  const distinctDays = new Set(
    blocks
      .map((b) => (typeof b?.startAt === "string" ? b.startAt.slice(0, 10) : ""))
      .filter((d) => d.length === 10),
  );
  const dayCount = distinctDays.size;
  let dailyTargetMinutes =
    dayCount > 0 && totalMinutes > 0
      ? Math.round(totalMinutes / dayCount)
      : DEFAULT_DAILY_MINUTES;
  dailyTargetMinutes = Math.max(
    MIN_DAILY_MINUTES,
    Math.min(MAX_DAILY_MINUTES, dailyTargetMinutes),
  );

  const planJsonb = {
    days: blocks.map((b) => ({
      dayLabel: typeof b?.startAt === "string" ? b.startAt.slice(0, 10) : "",
      date: typeof b?.startAt === "string" ? b.startAt.slice(0, 10) : null,
      activities: [
        {
          itemId: b?.studyThemeId ?? b?.lessonId ?? b?.topic ?? "block",
          type: b?.lessonId ? "lesson" : "study",
          title: b?.topic ?? "Bloco de estudo",
          description: b?.topic ?? "",
          estimatedMinutes: Number(b?.durationMinutes) || 0,
          ctaTarget: null,
          themeId: b?.studyThemeId ?? null,
          lessonId: b?.lessonId ?? null,
          handIds: [],
          reasoning: "",
        },
      ],
    })),
  };

  await storage.upsertStudyWeeklyPlan({
    userId,
    weekStartDate: ymdToUtcDate(weekStartDate),
    planJsonb,
    source: "coach_manual",
    dailyTargetMinutes,
  });
}

/**
 * RF-04 — confirma aulas: whitelist do tool (anti-alucinacao) + delete-then-
 * insert das recs da semana BRT (re-recomendar nao acumula).
 *
 * coach_lesson_recommendations tem UNIQUE (user_id, week_start_date) = 1 row/
 * semana por design (igual ao weeklyReportGenerator que ja preenche essa
 * tabela). Por isso consolidamos TODAS as aulas confirmadas numa UNICA row:
 * lessonId primario = primeira de `granted`; a lista completa fica em
 * inputSummary.lessonIds (superfícies futuras + consumer legado /inicio
 * continua lendo o lessonId unico). Inserir 1 row/aula violaria a UNIQUE
 * (500 + semana parcialmente gravada).
 */
async function confirmLessons(
  storage: any,
  userId: string,
  weekStartDate: string,
  inp: any,
  toolCtx: any,
): Promise<{ lessonIds: string[]; recIds: string[]; droppedLessonIds: string[] }> {
  const requested: string[] = Array.isArray(inp.lessonIds) ? inp.lessonIds : [];

  // whitelist = lessonId que o tool retornou (so grava o que veio do tool).
  let whitelist: string[] = [];
  try {
    const res: any = await recommendLessonTool.handler(
      {
        leakTopic: inp.leakTopic,
        urgency: inp.urgency,
        maxResults: inp.maxResults,
      },
      toolCtx,
    );
    whitelist = (res?.data?.lessons ?? []).map((l: any) => l.id);
  } catch (err) {
    console.error("planning.confirm_lessons.handler.error", { userId, err });
  }

  const granted = requested.filter((id) => whitelist.includes(id));
  const droppedLessonIds = requested.filter((id) => !whitelist.includes(id));

  // chave BRT da semana (distinta da chave UTC do study plan).
  const brtKey = brtMondayYmd(ymdToUtcDate(weekStartDate));

  // delete-then-insert (idempotente — re-recomendar nao acumula).
  await storage.deleteCoachRecommendationsForWeek?.(userId, brtKey, "coach_manual");

  // Nenhuma aula concedida -> delete ja limpou; nao insere (evita UNIQUE).
  if (granted.length === 0) {
    return { lessonIds: [], recIds: [], droppedLessonIds };
  }

  // UMA row consolidada por semana (respeita UNIQUE (user_id, week_start_date)).
  const primaryLessonId = granted[0];
  const rec = await storage.createCoachRecommendation({
    userId,
    lessonId: primaryLessonId,
    weekStartDate: brtKey,
    reason: inp.leakTopic ? `Foco: ${inp.leakTopic}` : "Plano da proxima semana",
    source: "coach_manual",
    inputSummary: { lessonIds: granted, leakTopic: inp.leakTopic ?? null },
  });
  const recIds: string[] = rec?.id ? [rec.id] : [];

  return { lessonIds: granted, recIds, droppedLessonIds };
}

/**
 * RF-06 — posta o resumo do plano no chat do mentor (reusa o canal de
 * relatorios do EST-1: getOrCreateReportChatSession + insertChatMessage).
 */
async function postPlanningSummaryToChat(
  storage: any,
  userId: string,
  session: WeeklyPlanningSession,
): Promise<void> {
  try {
    const chat = await storage.getOrCreateReportChatSession(userId);
    const content = buildSummaryText(session);
    await storage.insertChatMessage({
      chatSessionId: chat.id,
      role: "assistant",
      content,
    });
  } catch (err) {
    console.error("planning.post_summary.error", { userId, err });
  }
}

function buildSummaryText(session: WeeklyPlanningSession): string {
  const s = session.steps;
  const lines: string[] = [];
  lines.push(`Plano da semana de ${session.weekStartDate} montado.`);
  const grindN = s.grind?.createdIds?.length ?? 0;
  lines.push(
    s.grind?.status === "skipped"
      ? "- Grind: pulado."
      : `- Grind: ${grindN} torneio(s) na grade.`,
  );
  const studyN = s.study?.sessionIds?.length ?? 0;
  lines.push(
    s.study?.status === "skipped"
      ? "- Estudo: pulado."
      : `- Estudo: ${studyN} bloco(s) agendado(s).`,
  );
  const lessonsN = s.lessons?.lessonIds?.length ?? 0;
  lines.push(
    s.lessons?.status === "skipped"
      ? "- Aulas: pulado."
      : `- Aulas: ${lessonsN} recomendada(s).`,
  );
  const focusN = s.themes?.focus?.length ?? 0;
  lines.push(
    s.themes?.status === "skipped"
      ? "- Temas-foco: pulado."
      : `- Temas-foco: ${focusN} sugerido(s).`,
  );
  return lines.join("\n");
}
