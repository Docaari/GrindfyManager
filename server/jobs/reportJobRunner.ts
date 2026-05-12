// =============================================================================
// reportJobRunner — Sprint AI-1B / RF-03 + RF-06 + RF-09 (ADR-155/156)
//
// Job runner timezone-aware com 2 ticks:
//   - enqueueWeeklyReportJobsTick({ now })  — cron `0 * * * *` (hourly).
//       Para cada user Pro+ opt-in: se `getLocalHour(now, tz) === 7 && segunda no
//       fuso do user` -> INSERT report_jobs ON CONFLICT DO NOTHING (period_start =
//       segunda da semana QUE ACABOU no fuso do user).
//   - processReportJobsTick({ now })        — cron `*/15 * * * *`.
//       claim atomico de jobs pending due -> revalida elegibilidade -> idempotencia
//       (reports row ja existe? job done) -> generateWeeklyReport -> done|retry|fail-soft.
//
// Gating: COACH_NUDGES_ENABLED === 'false' -> os 2 ticks retornam cedo
//   (log nudges_globally_disabled). withAdvisoryLock em torno de cada tick (ADR-144).
//
// Lessons: #3 (mock shape real — listUsersForCron retorna { userPlatformId,
//   timezone, subscriptionPlan }), #9 (logar antes de fallback / safe-deny / try-catch
//   por user), #34 (storage injetavel), #37 (import estatico de node-cron).
// =============================================================================

import nodeCron from "node-cron";
import { withAdvisoryLock } from "../lib/advisoryLock";
import { getLocalHour } from "../coach/timezone";
import { getCoachPreferences } from "../storage/coachPreferences";

const PRO_PLANS = new Set(["pro", "premium", "admin"]);
const BACKOFF_MS = [15 * 60 * 1000, 60 * 60 * 1000, 4 * 60 * 60 * 1000]; // attempt 1->15min, 2->1h, 3->4h
const PROCESS_LIMIT = 25;
const PACING_MS = 200;

function isNudgesDisabled(): boolean {
  return process.env.COACH_NUDGES_ENABLED === "false";
}

function isCronEnabled(): boolean {
  return process.env.NODE_ENV === "production" || process.env.COACH_CRON_ENABLED === "true";
}

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../storage");
  return (mod as any).storage;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Dia da semana (0=domingo..6=sabado) e Y-M-D no fuso do user para um instante UTC.
 * Usa Intl pra obter os componentes "civis" no fuso, depois reconstroi um Date UTC
 * (artificial) so pra extrair getUTCDay / aritmetica de datas.
 */
function localCivilDate(now: Date, tz: string): { weekday: number; civilUtc: Date } {
  const safeTz = tz || "America/Sao_Paulo";
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: safeTz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });
    const parts = fmt.formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const year = Number(get("year"));
    const month = Number(get("month"));
    const day = Number(get("day"));
    const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekday = wdMap[get("weekday")] ?? new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return { weekday, civilUtc: new Date(Date.UTC(year, month - 1, day)) };
  } catch {
    const civilUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { weekday: civilUtc.getUTCDay(), civilUtc };
  }
}

/** period_start = segunda da semana QUE ACABOU (no fuso do user), formato YYYY-MM-DD. */
function previousWeekMonday(civilUtc: Date, weekday: number): { periodStart: string; periodEnd: string } {
  // distancia ate a segunda DESTA semana (hoje eh segunda -> 0).
  const deltaToThisMonday = weekday === 0 ? 6 : weekday - 1;
  const thisMonday = new Date(civilUtc);
  thisMonday.setUTCDate(civilUtc.getUTCDate() - deltaToThisMonday);
  const prevMonday = new Date(thisMonday);
  prevMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  const prevSunday = new Date(prevMonday);
  prevSunday.setUTCDate(prevMonday.getUTCDate() + 6);
  return { periodStart: ymd(prevMonday), periodEnd: ymd(prevSunday) };
}

async function isWeeklyReportEligible(storage: any, userId: string, plan?: string): Promise<boolean> {
  try {
    const effectivePlan = plan ?? (await storage.getUserSubscriptionPlan?.(userId)) ?? "free";
    if (!PRO_PLANS.has(String(effectivePlan))) return false;
    const prefs = await getCoachPreferences(userId);
    return prefs?.reportWeeklyEnabled === true;
  } catch (err) {
    console.error("report.eligibility.error", { userId, err: err instanceof Error ? err.message : String(err) });
    return false; // safe-deny (lesson #9)
  }
}

// =============================================================================
// Enqueuer
// =============================================================================
export async function enqueueWeeklyReportJobsTick(opts: { now?: Date; injectedStorage?: any } = {}): Promise<void> {
  const now = opts.now ?? new Date();
  if (isNudgesDisabled()) {
    console.info("report.job.enqueuer.skip", { reason: "nudges_globally_disabled" });
    return;
  }
  await withAdvisoryLock("cron:report-job-enqueuer", async () => {
    const storage = await resolveStorage(opts.injectedStorage);
    let users: Array<{ userPlatformId: string; timezone: string; subscriptionPlan: string }> = [];
    try {
      users = (await storage.listUsersForCron?.("subscription_plan IN ('pro','premium')")) ?? [];
    } catch (err) {
      console.error("report.job.enqueuer.list_users_error", { err });
      return;
    }
    for (const u of users) {
      const userId = u?.userPlatformId;
      if (!userId) continue;
      try {
        const tz = u?.timezone || "America/Sao_Paulo";
        if (getLocalHour(now, tz) !== 7) continue;
        const { weekday, civilUtc } = localCivilDate(now, tz);
        if (weekday !== 1) continue; // so segunda no fuso do user
        const eligible = await isWeeklyReportEligible(storage, userId, u?.subscriptionPlan);
        if (!eligible) continue;
        const { periodStart, periodEnd } = previousWeekMonday(civilUtc, weekday);
        await storage.insertReportJobOnConflictDoNothing?.({
          id: undefined,
          userId,
          reportType: "weekly",
          periodStart,
          periodEnd,
          scheduledFor: now,
          status: "pending",
          maxAttempts: 3,
          timezone: tz,
          subscriptionPlanAtEnqueue: u?.subscriptionPlan ?? null,
          enqueuedBy: "cron_enqueuer",
        });
      } catch (err) {
        console.error("report.job.enqueuer.user.error", { userId, err: err instanceof Error ? err.message : String(err) });
      }
    }
  });
}

// =============================================================================
// Processor
// =============================================================================
function buildReportRowFromResult(result: any): Record<string, any> {
  const content = result?.content ?? {};
  const generation = content?.generation ?? {};
  const u = result?.usage ?? {};
  return {
    status: result?.status ?? (generation.degraded ? "degraded" : "ready"),
    content,
    markdown: result?.markdown ?? null,
    modelUsed: result?.model ?? generation.model ?? null,
    summarizerModelUsed: generation.summarizerModel ?? null,
    costUsdEstimate: result?.costUsdEstimate ?? generation.costUsdEstimate ?? 0,
    degradedReason: generation.degradedReason ?? result?.degradedReason ?? null,
    inputTokens: u.input_tokens ?? u.inputTokens ?? null,
    cacheCreationInputTokens: u.cache_creation_input_tokens ?? u.cacheCreationInputTokens ?? null,
    cacheReadInputTokens: u.cache_read_input_tokens ?? u.cacheReadInputTokens ?? null,
    outputTokens: u.output_tokens ?? u.outputTokens ?? null,
  };
}

// Persiste o reports row a partir do resultado do gerador. Se o gerador JA
// persistiu (result.reportId presente) NAO re-faz upsert (re-upsert sem os
// campos de token zeraria o que persistReport gravou) — so retorna o id. Se o
// gerador NAO persistiu (mock de teste, ou fallback determinista interno do
// runner), faz o upsert com tokens propagados.
async function persistOrFetchReportId(storage: any, claimed: any, result: any): Promise<string | null> {
  if (result?.reportId) {
    return result.reportId;
  }
  const row = buildReportRowFromResult(result);
  const saved = await storage.upsertReport?.({
    userId: claimed.userId,
    reportType: "weekly",
    periodStart: claimed.periodStart,
    periodEnd: claimed.periodEnd,
    ...row,
  });
  return saved?.id ?? null;
}

// Revalidacao de elegibilidade no momento de processar: usa o snapshot
// `subscription_plan_at_enqueue` gravado no job (defesa-em-profundidade barata —
// nao depende de um lookup user que precisa resolver userPlatformId) + re-check
// do opt-in via getCoachPreferences (que funciona com userPlatformId). Fallback
// pra getUserSubscriptionPlan(userPlatformId) so se o snapshot estiver ausente.
async function revalidateEligibility(storage: any, claimed: any): Promise<boolean> {
  const userId = claimed?.userId;
  try {
    const prefs = await getCoachPreferences(userId);
    if (prefs?.reportWeeklyEnabled !== true) return false;
  } catch (err) {
    console.error("report.job.revalidate.prefs.error", { userId, err });
    return false; // safe-deny
  }
  // plano: prioriza o snapshot do enqueue; senao consulta o storage por userPlatformId.
  let plan: string | undefined =
    typeof claimed?.subscriptionPlanAtEnqueue === "string" && claimed.subscriptionPlanAtEnqueue
      ? claimed.subscriptionPlanAtEnqueue
      : undefined;
  if (plan == null) {
    try {
      const p = await storage.getUserSubscriptionPlan?.(userId);
      plan = typeof p === "string" ? p : undefined;
    } catch (err) {
      console.error("report.job.revalidate.plan.error", { userId, err });
    }
  }
  // se nem o snapshot nem o lookup deram um plano, confia no opt-in (ja revalidado
  // acima) — nao bloqueia por incerteza de plano (o enqueuer ja filtrou Pro+).
  if (plan == null) return true;
  return PRO_PLANS.has(String(plan));
}

async function processOneJob(storage: any, job: any, now: Date): Promise<void> {
  const userId = job?.userId;
  // claim atomico — UPDATE ... SET status='running', attempts=attempts+1 WHERE id=? AND status='pending' RETURNING *
  const claimed = await storage.claimReportJob?.({ jobId: job.id, now });
  if (!claimed) return; // outro runner pegou

  // revalida elegibilidade no momento de processar (defesa em profundidade).
  const eligible = await revalidateEligibility(storage, claimed);
  if (!eligible) {
    await storage.updateReportJob?.(job.id, { status: "skipped", lastError: "no_longer_eligible", updatedAt: new Date() });
    return;
  }

  // idempotencia da geracao — reports row ja existe?
  try {
    const existing = await storage.getReportForPeriod?.(userId, "weekly", claimed.periodStart);
    if (existing) {
      await storage.updateReportJob?.(job.id, { status: "done", reportId: existing.id, updatedAt: new Date() });
      return;
    }
  } catch (err) {
    console.error("report.job.idempotency_check.error", { jobId: job.id, userId, err });
  }

  const attempts = Number(claimed.attempts ?? job.attempts ?? 1);
  const maxAttempts = Number(claimed.maxAttempts ?? job.maxAttempts ?? 3);
  const failSoft = attempts >= maxAttempts;

  try {
    const { generateWeeklyReport } = await import("../services/weeklyReportGenerator");
    const result = await generateWeeklyReport({
      userId,
      periodStart: claimed.periodStart,
      periodEnd: claimed.periodEnd,
      ...(failSoft ? { failSoft: true } : {}),
      injectedStorage: storage,
    } as any);

    const reportId: string | null = await persistOrFetchReportId(storage, claimed, result);
    await storage.updateReportJob?.(job.id, { status: "done", reportId, updatedAt: new Date() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("report.job.error", { jobId: job.id, userId, attempts, err: msg });
    if (attempts < maxAttempts) {
      const idx = Math.min(attempts - 1, BACKOFF_MS.length - 1);
      const nextAt = new Date(now.getTime() + BACKOFF_MS[Math.max(0, idx)]);
      await storage.updateReportJob?.(job.id, { status: "pending", lastError: msg.slice(0, 1000), nextAttemptAt: nextAt, updatedAt: new Date() });
    } else {
      // fail-soft (RF-09) — gera o relatorio deterministico e marca done (nunca failed).
      try {
        const { generateWeeklyReport } = await import("../services/weeklyReportGenerator");
        const fallback = await generateWeeklyReport({
          userId,
          periodStart: claimed.periodStart,
          periodEnd: claimed.periodEnd,
          failSoft: true,
          injectedStorage: storage,
        } as any);
        let reportId: string | null = await persistOrFetchReportId(storage, claimed, fallback);
        // garante que um reports row degraded existe mesmo se o gerador mockado nao persistiu
        // nem incluiu reportId — neste caso persistOrFetchReportId ja chamou upsertReport
        // com o row construido (status=degraded, degradedReason=llm_failed_3x via buildReportRowFromResult).
        await storage.updateReportJob?.(job.id, { status: "done", reportId, lastError: msg.slice(0, 1000), updatedAt: new Date() });
      } catch (err2) {
        console.error("report.job.failsoft.error", { jobId: job.id, userId, err: err2 instanceof Error ? err2.message : String(err2) });
        await storage.updateReportJob?.(job.id, { status: "done", lastError: msg.slice(0, 1000), updatedAt: new Date() });
      }
    }
  }
}

export async function processReportJobsTick(opts: { now?: Date; injectedStorage?: any } = {}): Promise<void> {
  const now = opts.now ?? new Date();
  if (isNudgesDisabled()) {
    console.info("report.job.processor.skip", { reason: "nudges_globally_disabled" });
    return;
  }
  await withAdvisoryLock("cron:report-job-runner", async () => {
    const storage = await resolveStorage(opts.injectedStorage);
    let jobs: any[] = [];
    try {
      jobs = (await storage.listDueReportJobs?.({ now, limit: PROCESS_LIMIT })) ?? [];
    } catch (err) {
      console.error("report.job.processor.list_error", { err });
      return;
    }
    for (const job of jobs) {
      try {
        await processOneJob(storage, job, now);
      } catch (err) {
        console.error("report.job.processor.job_error", { jobId: job?.id, err: err instanceof Error ? err.message : String(err) });
      }
      if (PACING_MS > 0) await sleep(PACING_MS);
    }
  });
}

// =============================================================================
// Registro
// =============================================================================
let _registered = false;

export async function registerReportJobRunner(): Promise<void> {
  if (_registered) return;
  if (!isCronEnabled()) {
    console.info("report.job.runner.disabled", { reason: "env_off" });
    return;
  }
  const cron: any = (nodeCron as any)?.default ?? (nodeCron as any);
  if (!cron || typeof cron.schedule !== "function") {
    console.info("report.job.runner.disabled", { reason: "node-cron not available" });
    return;
  }
  if (isNudgesDisabled()) {
    _registered = true;
    console.info("report.job.runner.disabled", { reason: "kill switch (COACH_NUDGES_ENABLED=false)", nudges_disabled: true });
    return;
  }
  cron.schedule("0 * * * *", () => {
    enqueueWeeklyReportJobsTick({}).catch((err) => console.error("report.job.enqueuer.tick.error", { err }));
  });
  cron.schedule("*/15 * * * *", () => {
    processReportJobsTick({}).catch((err) => console.error("report.job.processor.tick.error", { err }));
  });
  _registered = true;
  console.info("report.job.runner.started", { enqueuer: "0 * * * *", processor: "*/15 * * * *" });
}

/** Helper de teste — reseta o flag de registro. */
export function _resetReportJobRunnerForTests(): void {
  _registered = false;
}
