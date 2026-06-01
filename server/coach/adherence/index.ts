// =============================================================================
// server/coach/adherence/index.ts — Motor de Aderência (ADR-227)
//
// Serviço PURO, read-only, stateless, on-demand. Compara o plano intencionado
// (EST-6) com o realizado por janela. SEM migration — lê tabelas existentes.
//
//   getPlannedVsActual(userId, sourceMetric, period, injectedStorage?) -> PlannedVsActual
//   buildAdherenceRecap(userId, weekStartDate, injectedStorage?) -> AdherenceRecap
//
// Lessons: #34/#36 (injectedStorage 3º arg + lazy import; tipos como import type),
//   #9 (log antes do fallback), #11 (nunca fabrica dado), #6 (FX N/A nesta fase),
//   #3 (mock shape real), #10 (tom A4 em arquivo único: adherenceRecapTone.ts).
// =============================================================================

import { ymdToUtcDate, brtMondayYmd, ymdUtc } from "../planning/weekKeys";
import { computeCompliance } from "./compute";
import { DIMENSION_KEY_BY_METRIC, SOURCE_METRIC_MAP } from "./sourceMetricMap";
import { buildAdherenceSummary } from "./adherenceRecapTone";
import type {
  AdherenceNote,
  AdherencePeriod,
  AdherenceRecap,
  DimensionKey,
  PlannedVsActual,
  SourceMetric,
} from "./types";
import { UnknownSourceMetricError } from "./types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Resolve storage (lesson #34/#36). injected ?? lazy import. */
async function resolveStorage(injected?: unknown): Promise<any> {
  if (injected) return injected;
  const mod = await import("../../storage");
  return (mod as any).storage;
}

/** Limites da janela [start, end) em ms UTC. month/quarter alinhados ao period_start. */
function windowBounds(period: AdherencePeriod): { startMs: number; endMs: number } {
  const start = ymdToUtcDate(period.weekStartDate);
  const startMs = start.getTime();
  if (period.kind === "month" || period.kind === "quarter") {
    const monthOffset = period.kind === "month" ? 1 : 3;
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + monthOffset, start.getUTCDate(), 0, 0, 0, 0));
    return { startMs, endMs: end.getTime() };
  }
  return { startMs, endMs: startMs + WEEK_MS };
}

/**
 * Janela em curso (DEC-MA7). Truncamos `now` para meia-noite UTC: a janela está
 * aberta quando o DIA corrente está estritamente entre o início e o fim da janela.
 * No dia exato do início (= weekStart) a janela conta como fechada (recap sempre
 * compara a semana anterior, que já fechou).
 */
function isWindowOpen(startMs: number, endMs: number, now: Date = new Date()): boolean {
  const nowMid = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
  return nowMid > startMs && nowMid < endMs;
}

function inWindow(d: Date, startMs: number, endMs: number): boolean {
  const t = d.getTime();
  return t >= startMs && t < endMs;
}

function dateOf(row: any): Date {
  return new Date(row?.date ?? row?.startTime ?? row?.startedAt ?? row?.registeredAt ?? row?.createdAt ?? 0);
}

/** grind_sessions completas na janela (filtro status+data in-memory — SQL não filtra). */
async function completedGrindSessions(storage: any, userId: string, startMs: number, endMs: number): Promise<any[]> {
  const sessions = await storage.getGrindSessions(userId, { limit: 200 });
  return (Array.isArray(sessions) ? sessions : []).filter(
    (s: any) => s?.status === "completed" && inWindow(dateOf(s), startMs, endMs),
  );
}

/** study_sessions_v2 completas na janela (filtro status+data in-memory). */
async function completedStudySessions(storage: any, userId: string, startMs: number, endMs: number): Promise<any[]> {
  const sessions = await storage.getStudySessionsV2(userId, { from: new Date(startMs), to: new Date(endMs), limit: 500 });
  return (Array.isArray(sessions) ? sessions : []).filter(
    (s: any) => s?.status === "completed" && inWindow(dateOf(s), startMs, endMs),
  );
}

/** Resultado degradado (lesson #11 — não fabrica dado). */
function degraded(
  sourceMetric: SourceMetric,
  period: AdherencePeriod,
  note: AdherenceNote,
  actual = 0,
): PlannedVsActual {
  return {
    sourceMetric,
    period,
    planned: null,
    actual,
    compliancePct: null,
    dataSufficiency: "low",
    breakdown: { skipped: false, shortfall: null, overachieved: false, note },
  };
}

/** Lê o step da dimensão de `steps` (graceful quando ausente — steps {} ou parcial). */
function readStep(steps: any, dim: DimensionKey): { status?: string; raw: any } | null {
  if (!steps || typeof steps !== "object") return null;
  const raw = (steps as any)[dim];
  if (!raw || typeof raw !== "object") return null;
  return { status: raw.status, raw };
}

export async function getPlannedVsActual(
  userId: string,
  sourceMetric: SourceMetric,
  period: AdherencePeriod,
  injectedStorage?: unknown,
): Promise<PlannedVsActual> {
  // RF-01 — allowlist. warmup_compliance está no union mas sem entrada no MAP.
  const spec = (SOURCE_METRIC_MAP as any)[sourceMetric];
  if (!spec) {
    throw new UnknownSourceMetricError(String(sourceMetric));
  }

  const storage = await resolveStorage(injectedStorage);
  const dim: DimensionKey = DIMENSION_KEY_BY_METRIC[sourceMetric as Exclude<SourceMetric, "warmup_compliance">];
  const { startMs, endMs } = windowBounds(period);
  const windowOpen = isWindowOpen(startMs, endMs);

  // Plano (steps) — chave UTC crua (CLAUDE.md §10, NÃO converte para BRT).
  let planning: any = null;
  try {
    planning = await storage.getWeeklyPlanningSession(userId, period.weekStartDate);
  } catch (err) {
    console.error("adherence.planning.error", { userId, sourceMetric, err });
    return degraded(sourceMetric, period, "source_error");
  }

  // Sem plano -> no_plan / low (não cobrar).
  if (!planning) {
    return degraded(sourceMetric, period, "no_plan");
  }

  const step = readStep(planning.steps, dim);
  // Step ausente em steps parcial -> sem plano para esta dimensão.
  if (!step) {
    return degraded(sourceMetric, period, "no_plan");
  }
  const skipped = step.status === "skipped";

  try {
    switch (sourceMetric) {
      case "grind_sessions_count":
        return await computeGrind(storage, userId, period, sourceMetric, skipped, windowOpen, startMs, endMs, "sessions");
      case "grind_days":
        return await computeGrind(storage, userId, period, sourceMetric, skipped, windowOpen, startMs, endMs, "days");
      case "planned_tournaments_count":
        return await computePlannedTournaments(storage, userId, period, sourceMetric, skipped, windowOpen, startMs, endMs);
      case "study_minutes":
        return await computeStudyMinutes(storage, userId, period, sourceMetric, planning, step, skipped, windowOpen, startMs, endMs);
      case "study_sessions_count":
        return await computeStudySessions(storage, userId, period, sourceMetric, step, skipped, windowOpen, startMs, endMs);
      case "lessons_recommended_done":
        return await computeLessons(storage, userId, period, sourceMetric, step, skipped, windowOpen);
      case "themes_focus_studied":
        return await computeThemes(storage, userId, period, sourceMetric, step, skipped, windowOpen, startMs, endMs);
      default:
        throw new UnknownSourceMetricError(String(sourceMetric));
    }
  } catch (err) {
    if (err instanceof UnknownSourceMetricError) throw err;
    // lesson #9 — loga com contexto antes do fallback degradado (RF-07).
    console.error("adherence.source.error", { userId, sourceMetric, err });
    return degraded(sourceMetric, period, "source_error");
  }
}

// --- planned helpers ---------------------------------------------------------
//
// TODO(adherence/MEDIUM-1 — Metas fatia-2): `planned` de grind/planned_tournaments
// conta dias-de-grade distintos / torneios ativos UMA vez, ignorando a janela.
// Correto só para kind:'week' (cada dayOfWeek aparece <=1x/semana). Para
// kind:'month'/'quarter' é preciso EXPANDIR as ocorrências recorrentes dentro de
// [startMs, endMs) antes de a Metas consumir (senão planned subestima -> compliance
// inflado). Nesta fase só `week` é exercitado (recap semanal). Ver ADR-227 §Consequências.

/** Dias distintos de planned_tournaments ativos (RECORRENTE — distinct dayOfWeek). */
async function loadActivePlannedTournaments(storage: any, userId: string): Promise<any[]> {
  const rows = await storage.getPlannedTournaments(userId);
  const list = Array.isArray(rows) ? rows : [];
  return list.filter((t: any) => t?.isActive !== false);
}

function distinctDays(rows: any[]): number {
  const days = new Set<number>();
  for (const r of rows) {
    if (typeof r?.dayOfWeek === "number") days.add(r.dayOfWeek);
  }
  return days.size;
}

// --- grind (sessions_count / days) -------------------------------------------

async function computeGrind(
  storage: any,
  userId: string,
  period: AdherencePeriod,
  sourceMetric: SourceMetric,
  skipped: boolean,
  windowOpen: boolean,
  startMs: number,
  endMs: number,
  mode: "sessions" | "days",
): Promise<PlannedVsActual> {
  // Planejado = dias distintos (dayOfWeek) das planned_tournaments ativas.
  const planned = distinctDays(await loadActivePlannedTournaments(storage, userId));

  // Realizado: grind_sessions status='completed' + data na janela (filtro in-memory).
  const completed = await completedGrindSessions(storage, userId, startMs, endMs);
  const actual = mode === "days"
    ? new Set(completed.map((s: any) => ymdUtc(dateOf(s)))).size
    : completed.length;

  const r = computeCompliance({ planned, actual, skipped, windowOpen });
  return { sourceMetric, period, planned, actual, ...r };
}

// --- planned_tournaments_count -----------------------------------------------

async function computePlannedTournaments(
  storage: any,
  userId: string,
  period: AdherencePeriod,
  sourceMetric: SourceMetric,
  skipped: boolean,
  windowOpen: boolean,
  startMs: number,
  endMs: number,
): Promise<PlannedVsActual> {
  // Planejado = total de planned_tournaments ativos (torneios, não dias distintos).
  const activeRows = await loadActivePlannedTournaments(storage, userId);
  const planned = activeRows.length;

  // Realizado (§6.1 / DEC-MA3): session_tournaments das grind_sessions da janela.
  const completed = await completedGrindSessions(storage, userId, startMs, endMs);
  let actual = 0;
  for (const s of completed) {
    const sts = await storage.getSessionTournaments(userId, s.id);
    actual += Array.isArray(sts) ? sts.length : 0;
  }

  const r = computeCompliance({ planned, actual, skipped, windowOpen });
  return { sourceMetric, period, planned, actual, ...r };
}

// --- study minutes -----------------------------------------------------------

async function computeStudyMinutes(
  storage: any,
  userId: string,
  period: AdherencePeriod,
  sourceMetric: SourceMetric,
  planning: any,
  step: { status?: string; raw: any },
  skipped: boolean,
  windowOpen: boolean,
  startMs: number,
  endMs: number,
): Promise<PlannedVsActual> {
  // DEC-MA4: fonte primária = study_weekly_plans (dailyTargetMinutes × dias do plano)
  // quando steps.study não carrega durações próprias. Fallback sinalizado por note.
  const studyStep = step.raw;
  // TODO(adherence/DEC-MA4): steps.study não carrega durationMinutes hoje
  // (shared/coach-planning.ts). Quando carregar, derivar planned do step.
  const hasStepDurations = false;

  let planned: number | null = null;
  let note: AdherenceNote = null;

  // Sem sessionIds no step E sem study_weekly_plans -> sem plano.
  const hasSessionIds = Array.isArray(studyStep?.sessionIds) && studyStep.sessionIds.length > 0;

  const weeklyPlan = await storage.getStudyWeeklyPlan(userId, ymdToUtcDate(period.weekStartDate));
  if (weeklyPlan && typeof weeklyPlan.dailyTargetMinutes === "number") {
    const days = Array.isArray(weeklyPlan?.planJsonb?.days) ? weeklyPlan.planJsonb.days.length : 0;
    planned = weeklyPlan.dailyTargetMinutes * days;
    // Fallback sinalizado quando o study step não trouxe seus próprios blocos/durações.
    if (!hasStepDurations && !hasSessionIds) {
      note = "plan_from_weekly_plan";
    }
  } else if (!hasSessionIds) {
    // Sem study_weekly_plans e sem steps.study -> sem plano.
    return degraded(sourceMetric, period, "no_plan");
  }

  // Realizado: study_sessions_v2 completas + data na janela, soma durationMinutes.
  const completed = await completedStudySessions(storage, userId, startMs, endMs);
  const actual = completed.reduce((acc: number, s: any) => acc + (typeof s?.durationMinutes === "number" ? s.durationMinutes : 0), 0);

  const r = computeCompliance({ planned, actual, skipped, windowOpen, presetNote: note });
  return { sourceMetric, period, planned, actual, ...r };
}

// --- study sessions count ----------------------------------------------------

async function computeStudySessions(
  storage: any,
  userId: string,
  period: AdherencePeriod,
  sourceMetric: SourceMetric,
  step: { status?: string; raw: any },
  skipped: boolean,
  windowOpen: boolean,
  startMs: number,
  endMs: number,
): Promise<PlannedVsActual> {
  const sessionIds = Array.isArray(step.raw?.sessionIds) ? step.raw.sessionIds : [];
  const planned = sessionIds.length;

  const completed = await completedStudySessions(storage, userId, startMs, endMs);
  const actual = completed.length;

  const r = computeCompliance({ planned, actual, skipped, windowOpen });
  return { sourceMetric, period, planned, actual, ...r };
}

// --- lessons recommended done (chave BRT) ------------------------------------

async function computeLessons(
  storage: any,
  userId: string,
  period: AdherencePeriod,
  sourceMetric: SourceMetric,
  step: { status?: string; raw: any },
  skipped: boolean,
  windowOpen: boolean,
): Promise<PlannedVsActual> {
  const lessonIds = Array.isArray(step.raw?.lessonIds) ? step.raw.lessonIds : [];
  const planned = lessonIds.length;

  // coach_lesson_recommendations é chave BRT — converte explicitamente (CLAUDE.md §10).
  const brtKey = brtMondayYmd(ymdToUtcDate(period.weekStartDate));
  const rec = await storage.getCoachRecommendationByUserAndWeek(userId, brtKey);
  // Realizado = aulas concluídas (consumedAt setado). Sem fonte de consumo confiável
  // nesta fase -> conta 0 quando consumedAt ausente (não fabrica dado, lesson #11).
  // TODO(adherence/MEDIUM-2 — Metas fatia-2): `actual` é estruturalmente binário
  // (0 OU todas-as-recomendadas) porque consumedAt indica consumo do CARD, não
  // conclusão por-aula. Isso pode emitir compliancePct:100 falso (viola D9/lesson #11
  // do contrato). Quando existir fonte de conclusão real por aula, tratar como `themes`
  // (dataSufficiency:'low' + note enquanto a fonte não existir). Ver ADR-227.
  let actual = 0;
  if (rec && rec.consumedAt) {
    const ids = Array.isArray(rec?.inputSummary?.lessonIds) ? rec.inputSummary.lessonIds : [rec.lessonId].filter(Boolean);
    actual = ids.length;
  }

  const r = computeCompliance({ planned: planned > 0 ? planned : null, actual, skipped, windowOpen });
  return { sourceMetric, period, planned: planned > 0 ? planned : null, actual, ...r };
}

// --- themes focus studied (getStatsLeaks stub -> degrade) --------------------

async function computeThemes(
  storage: any,
  userId: string,
  period: AdherencePeriod,
  sourceMetric: SourceMetric,
  step: { status?: string; raw: any },
  skipped: boolean,
  windowOpen: boolean,
  startMs: number,
  endMs: number,
): Promise<PlannedVsActual> {
  const focus = Array.isArray(step.raw?.focus) ? step.raw.focus : [];
  // Sem focus -> origem em getStatsLeaks stub ([]) -> degrade gracioso (RF-07).
  if (focus.length === 0) {
    // lesson #9 — loga antes do fallback.
    console.warn("adherence.themes.no_focus", { userId, sourceMetric, note: "source_stub" });
    return degraded(sourceMetric, period, "source_stub");
  }

  const focusStatIds = new Set(
    focus.map((f: any) => f?.statId).filter((id: any): id is string => typeof id === "string"),
  );
  const planned = focusStatIds.size;

  const completed = await completedStudySessions(storage, userId, startMs, endMs);
  const studiedThemes = new Set(
    completed
      .map((s: any) => s?.themeId)
      .filter((t: any): t is string => typeof t === "string" && focusStatIds.has(t)),
  );
  const actual = studiedThemes.size;

  const r = computeCompliance({ planned, actual, skipped, windowOpen });
  return { sourceMetric, period, planned, actual, ...r };
}

// =============================================================================
// RF-08 — buildAdherenceRecap (batcha grind + estudo da semana passada)
// =============================================================================

export async function buildAdherenceRecap(
  userId: string,
  weekStartDate: string,
  injectedStorage?: unknown,
): Promise<AdherenceRecap> {
  const storage = await resolveStorage(injectedStorage);
  const period: AdherencePeriod = { kind: "week", weekStartDate };

  // TODO(adherence/MEDIUM-4 — perf follow-up): cada getPlannedVsActual re-lê
  // getWeeklyPlanningSession + sessions da mesma janela. Aceitável no volume atual
  // (recap 1x/semana/user). Se a Metas batchar N dimensões/janela, extrair um
  // loader único de plano+sessions e despachar as dimensões. Ver ADR-227 §RNF.
  const grind = await getPlannedVsActual(userId, "grind_sessions_count", period, storage);
  const study = await getPlannedVsActual(userId, "study_minutes", period, storage);

  const summaryText = buildAdherenceSummary(grind, study);
  return { grind, study, summaryText };
}
