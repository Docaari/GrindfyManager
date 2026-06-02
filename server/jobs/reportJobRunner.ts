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
import { PREF_FIELD_BY_KIND, type ReportKind } from "../coach/reportEligibility";
import { sleep } from "../utils/sleep";

// =============================================================================
// Elegibilidade de plano (AI-1B bug fix — `users.subscription_plan` so assume
// 'trial' | 'active' | 'expired' | 'admin'; NUNCA 'pro'/'premium'. A distincao
// pro/premium vem de user_subscriptions JOIN subscription_plans, resolvida por
// resolveUserTier(...) em server/coachAccess.ts -> 'free'|'pro'|'premium'|'admin').
//
// Regra: elegivel se subscriptionPlan === 'trial' OU 'admin' (ou role 'admin')
//        OU resolveUserTier(...) ∈ {'pro','premium','admin'} (user 'active' com
//        subscription pro/premium ativa). 'expired'/'free'/sem-subscription -> NAO.
// O AI-1C vai formalizar isto num modulo reportEligibility.ts; aqui fica inline.
// =============================================================================
const ELIGIBLE_PLAN_OR_TIER = new Set(["trial", "admin", "pro", "premium"]);

/**
 * Resolve o "valor de elegibilidade" para um user a partir do plano cru de
 * `users.subscription_plan`. Retorna o tier elegivel ('trial'|'admin'|'pro'|
 * 'premium') que deve ser gravado em `subscription_plan_at_enqueue`, ou `null`
 * se o user NAO eh elegivel. Erro de resolveUserTier -> null (safe-deny, logado).
 */
async function resolveEligibleTierSnapshot(userId: string, rawPlan?: string | null): Promise<string | null> {
  const plan = String(rawPlan ?? "").toLowerCase();
  if (plan === "admin") return "admin";
  if (plan === "trial") return "trial";
  if (plan === "pro" || plan === "premium") return plan; // defensivo: ja eh tier
  if (plan === "active") {
    try {
      const { resolveUserTier } = await import("../coachAccess");
      const tier = await resolveUserTier({ userPlatformId: userId, subscriptionPlan: "active" });
      if (tier === "pro" || tier === "premium" || tier === "admin") return tier;
      return null; // 'free' (active mas sem subscription pro/premium ativa)
    } catch (err) {
      console.error("report.eligibility.tier.error", { userId, err: err instanceof Error ? err.message : String(err) });
      return null; // safe-deny (lesson #9)
    }
  }
  // 'expired' | 'free' | '' | desconhecido -> nao elegivel
  return null;
}

/**
 * Para a revalidacao no processor: o snapshot `subscription_plan_at_enqueue`
 * normalmente ja contem o tier resolvido ('trial'|'admin'|'pro'|'premium'); se
 * por algum motivo contiver o plano cru 'active' (job legado), re-resolve.
 */
async function isEligibleSnapshot(userId: string, snapshotValue?: string | null): Promise<boolean> {
  const v = String(snapshotValue ?? "").toLowerCase();
  if (ELIGIBLE_PLAN_OR_TIER.has(v)) return true;
  if (v === "active") {
    const resolved = await resolveEligibleTierSnapshot(userId, "active");
    return resolved != null;
  }
  return false;
}

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

/**
 * Decide se o user eh elegivel para o Weekly Report AGORA (enqueue) e, se sim,
 * qual valor gravar em `subscription_plan_at_enqueue`. Retorna `null` quando NAO
 * elegivel (plano fora do conjunto, opt-in desligado, ou erro -> safe-deny).
 */
async function weeklyReportEligibleSnapshot(storage: any, userId: string, plan?: string | null): Promise<string | null> {
  try {
    const rawPlan = plan ?? (await storage.getUserSubscriptionPlan?.(userId)) ?? "free";
    const tierSnapshot = await resolveEligibleTierSnapshot(userId, rawPlan);
    if (tierSnapshot == null) return null;
    const prefs = await getCoachPreferences(userId);
    if (prefs?.reportWeeklyEnabled !== true) return null;
    return tierSnapshot;
  } catch (err) {
    console.error("report.eligibility.error", { userId, err: err instanceof Error ? err.message : String(err) });
    return null; // safe-deny (lesson #9)
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
      // `users.subscription_plan` so assume 'trial'|'active'|'expired'|'admin'.
      // Candidatos a elegibilidade: 'trial' (direto), 'active' (re-check via
      // resolveUserTier), 'admin'. 'expired' fica de fora.
      users = (await storage.listUsersForCron?.("subscription_plan IN ('trial','active','admin')")) ?? [];
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
        // Weekly: segunda no fuso do user.
        if (weekday === 1) {
          const tierSnapshot = await weeklyReportEligibleSnapshot(storage, userId, u?.subscriptionPlan);
          if (tierSnapshot != null) {
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
              subscriptionPlanAtEnqueue: tierSnapshot,
              enqueuedBy: "cron_enqueuer",
            });
          }
        }
        // AI-1C / RF-05 — Monthly: dia 1 do mes no fuso do user (7h ja foi checado acima).
        if (civilUtc.getUTCDate() === 1) {
          const monthlyEligible = await monthlyReportEligibleSnapshot(storage, userId, u?.subscriptionPlan);
          if (monthlyEligible != null) {
            const { periodStart, periodEnd } = previousMonthRangeForCivil(civilUtc);
            await storage.insertReportJobOnConflictDoNothing?.({
              id: undefined,
              userId,
              reportType: "monthly",
              periodStart,
              periodEnd,
              scheduledFor: now,
              status: "pending",
              maxAttempts: 3,
              timezone: tz,
              subscriptionPlanAtEnqueue: monthlyEligible,
              enqueuedBy: "cron_enqueuer",
            });
          }
        }
      } catch (err) {
        console.error("report.job.enqueuer.user.error", { userId, err: err instanceof Error ? err.message : String(err) });
      }
    }
  });
}

// AI-1C / RF-05.1 — previous-month range (1o ao ultimo dia do mes que acabou,
// no fuso do user — civilUtc representa o "hoje civil" no fuso do user).
function previousMonthRangeForCivil(civilUtc: Date): { periodStart: string; periodEnd: string } {
  const y = civilUtc.getUTCFullYear();
  const m = civilUtc.getUTCMonth(); // 0..11; "mes anterior" = m-1
  const firstOfPrev = new Date(Date.UTC(y, m - 1, 1));
  const lastOfPrev = new Date(Date.UTC(y, m, 0));
  return { periodStart: ymd(firstOfPrev), periodEnd: ymd(lastOfPrev) };
}

// Elegibilidade do Monthly Report — mesma logica do weekly, mas com a
// preferencia `reportMonthlyEnabled`.
async function monthlyReportEligibleSnapshot(storage: any, userId: string, plan?: string | null): Promise<string | null> {
  try {
    const rawPlan = plan ?? (await storage.getUserSubscriptionPlan?.(userId)) ?? "free";
    const tierSnapshot = await resolveEligibleTierSnapshot(userId, rawPlan);
    if (tierSnapshot == null) return null;
    const prefs = await getCoachPreferences(userId);
    if ((prefs as any)?.reportMonthlyEnabled !== true) return null;
    return tierSnapshot;
  } catch (err) {
    console.error("report.eligibility.monthly.error", { userId, err: err instanceof Error ? err.message : String(err) });
    return null; // safe-deny
  }
}

// AI-1C / RF-03 — Daily Debrief enqueue (event-driven pos-session.completed).
// Chamado de handleUpdateGrindSession quando status='completed'. Best-effort:
// nunca lanca, nunca atrasa a resposta do PUT (caller faz fire-and-forget).
// Idempotencia via UNIQUE (user_id, 'daily', period_start=data).
export interface EnqueueDailyDebriefArgs {
  userId: string;
  sessionId?: string;
  sessionDate?: string; // 'YYYY-MM-DD' no fuso do user; se ausente, deriva de now+tz
  now?: Date;
  injectedStorage?: any;
}

export async function enqueueDailyDebriefForSession(args: EnqueueDailyDebriefArgs): Promise<void> {
  if (isNudgesDisabled()) return; // kill switch global = no-op
  const now = args.now ?? new Date();
  try {
    const storage = await resolveStorage(args.injectedStorage);
    const userId = args.userId;
    if (!userId) return;

    // Tier elegivel + opt-in do daily.
    const rawPlan = (await storage.getUserSubscriptionPlan?.(userId)) ?? "free";
    const tierSnapshot = await resolveEligibleTierSnapshot(userId, rawPlan);
    if (tierSnapshot == null) return;
    const prefs = await getCoachPreferences(userId);
    if ((prefs as any)?.reportDailyEnabled !== true) return;

    // Data da sessao no fuso do user.
    let tz = "America/Sao_Paulo";
    try { tz = (await storage.getUserTimezone?.(userId)) || tz; } catch { /* fallback */ }
    const date = args.sessionDate ?? localCivilDate(now, tz).civilUtc.toISOString().slice(0, 10);

    await storage.insertReportJobOnConflictDoNothing?.({
      id: undefined,
      userId,
      reportType: "daily",
      periodStart: date,
      periodEnd: date,
      scheduledFor: now,
      status: "pending",
      maxAttempts: 3,
      timezone: tz,
      subscriptionPlanAtEnqueue: tierSnapshot,
      enqueuedBy: "session_completed",
    });
  } catch (err) {
    console.error("report.job.daily_enqueue.error", { userId: args.userId, err: err instanceof Error ? err.message : String(err) });
    // nunca lanca — best-effort
  }
}

// =============================================================================
// AI-2B (ADR-169) — Quarterly enqueuer
// =============================================================================

/**
 * Trigger: dia 1 de jan/abr/jul/out às 7h local (fuso do user) + reportQuarterlyEnabled
 * + isReportEligible(userId, 'quarterly')=true → INSERT report_jobs row 'quarterly'.
 * period_start = 1º dia do trimestre anterior; period_end = último dia.
 * Idempotência: storage.insertReportJob → null on UNIQUE conflict.
 * Kill switch: COACH_NUDGES_ENABLED=false → no-op.
 *
 * Lesson #37: import estático de node-cron já no topo. Lesson #34: storage injetável.
 */
export async function enqueueQuarterlyReportJobsTick(
  now?: Date,
  injectedStorage?: any,
): Promise<void> {
  if (isNudgesDisabled()) return;
  const nowDate = now ?? new Date();

  // AI-3 efficiency (HIGH-1): pre-check UTC barato antes do SQL. Quarterly trigger
  // só pode disparar em UTC do dia 1 mês quarterly (tz UTC-12 a UTC+0), dia 2
  // (tz UTC+0 a UTC+14), ou último dia do mês anterior (tz UTC+1 a UTC+14 que
  // cruza meia-noite). Fora dessa janela: descartar sem SQL roundtrip.
  const utcMonth = nowDate.getUTCMonth() + 1;
  const utcDay = nowDate.getUTCDate();
  const QUARTERLY_MONTHS_UTC = new Set([1, 4, 7, 10]);
  const PREV_OF_QUARTERLY_UTC = new Set([12, 3, 6, 9]);
  const isCandidateUtc =
    (QUARTERLY_MONTHS_UTC.has(utcMonth) && (utcDay === 1 || utcDay === 2)) ||
    (PREV_OF_QUARTERLY_UTC.has(utcMonth) && utcDay >= 28);
  if (!isCandidateUtc) return;

  const storage = await resolveStorage(injectedStorage);

  // AI-3 / RF-04 (ADR-174 §2.4) — paridade weekly/monthly: usa listUsersForCron
  // com filtro SQL canônico em vez de iterateUsersWithTimezone full-scan.
  let users: Array<{ userPlatformId: string; timezone: string; subscriptionPlan: string }> = [];
  try {
    users = (await storage.listUsersForCron?.("subscription_plan IN ('trial','active','admin')")) ?? [];
  } catch (err) {
    console.error("quarterly.enqueuer.list_users_error", { err: err instanceof Error ? err.message : String(err) });
    return;
  }
  try {
    for (const u of users) {
      const userId = u?.userPlatformId;
      if (!userId) continue;
      const tz = u?.timezone || "America/Sao_Paulo";
      try {
        // Mês deve ser jan(1), abr(4), jul(7), out(10).
        const QUARTERLY_MONTHS = new Set([1, 4, 7, 10]);
        let localMonth: number;
        let localDay: number;
        try {
          const fmt = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          const parts = fmt.formatToParts(nowDate);
          localMonth = parseInt(parts.find((p) => p.type === "month")?.value ?? "0", 10);
          localDay = parseInt(parts.find((p) => p.type === "day")?.value ?? "0", 10);
        } catch {
          localMonth = nowDate.getUTCMonth() + 1;
          localDay = nowDate.getUTCDate();
        }
        if (!QUARTERLY_MONTHS.has(localMonth)) continue;
        if (localDay !== 1) continue;
        if (getLocalHour(nowDate, tz) !== 7) continue;

        // Opt-in.
        const prefs = await storage.getUserCoachPreferences?.(userId);
        if (!prefs || prefs.reportQuarterlyEnabled !== true) continue;

        // Tier elegível — AI-3 / RF-04: confiamos no filtro SQL `IN ('trial','active','admin')`.
        // O snapshot grava o plano cru; revalidateEligibility no processor faz o deep check
        // (resolveUserTier para 'active') antes de gerar o relatório.
        const planRaw = String(u?.subscriptionPlan ?? "").toLowerCase();
        const tierSnapshot = planRaw === "admin" || planRaw === "trial" || planRaw === "active"
          ? planRaw
          : await resolveEligibleTierSnapshot(userId, u?.subscriptionPlan);
        if (tierSnapshot == null) continue;

        // Calcula período = trimestre anterior.
        const year = nowDate.getUTCFullYear();
        // localMonth ∈ {1,4,7,10}; trimestre anterior:
        // jan(1) → Q4 ano anterior (out-dez)
        // abr(4) → Q1 (jan-mar)
        // jul(7) → Q2 (abr-jun)
        // out(10) → Q3 (jul-set)
        let qStartYear = year;
        let qStartMonth: number;
        let qEndMonth: number;
        if (localMonth === 1) {
          qStartYear = year - 1;
          qStartMonth = 10;
          qEndMonth = 12;
        } else if (localMonth === 4) {
          qStartMonth = 1;
          qEndMonth = 3;
        } else if (localMonth === 7) {
          qStartMonth = 4;
          qEndMonth = 6;
        } else {
          qStartMonth = 7;
          qEndMonth = 9;
        }
        const periodStart = `${qStartYear}-${String(qStartMonth).padStart(2, "0")}-01`;
        const lastDay = new Date(Date.UTC(qStartYear, qEndMonth, 0));
        const periodEnd = `${qStartYear}-${String(qEndMonth).padStart(2, "0")}-${String(lastDay.getUTCDate()).padStart(2, "0")}`;

        await storage.insertReportJob?.({
          userId,
          reportType: "quarterly",
          periodStart,
          periodEnd,
          scheduledFor: nowDate,
          status: "pending",
          maxAttempts: 3,
          timezone: tz,
          subscriptionPlanAtEnqueue: tierSnapshot,
          enqueuedBy: "cron_enqueuer",
        });
      } catch (err) {
        console.error("quarterly.enqueuer.user.error", { userId, err: err instanceof Error ? err.message : String(err) });
      }
    }
  } catch (err) {
    console.error("quarterly.enqueuer.iter.error", { err: err instanceof Error ? err.message : String(err) });
  }
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
    reportType: String(claimed?.reportType ?? "weekly"),
    periodStart: claimed.periodStart,
    periodEnd: claimed.periodEnd,
    ...row,
  });
  return saved?.id ?? null;
}

// AI-1C / RF-04 — despacho do gerador por reportType. Default weekly preserva
// compat com os jobs e tests do AI-1B (que nao setam reportType explicito em
// alguns fixtures). `'daily'` -> dailyDebriefGenerator; `'monthly'` ->
// monthlyReportGenerator; `'quarterly'`/desconhecido -> retorna null (caller
// loga + marca skipped).
async function callGeneratorByType(
  reportType: string,
  args: { userId: string; periodStart: string; periodEnd: string; failSoft?: boolean; injectedStorage?: any },
): Promise<any | null> {
  const type = String(reportType ?? "weekly").toLowerCase();
  if (type === "weekly") {
    const { generateWeeklyReport } = await import("../services/weeklyReportGenerator");
    return generateWeeklyReport(args as any);
  }
  if (type === "daily") {
    const { generateDailyDebrief } = await import("../services/dailyDebriefGenerator");
    return generateDailyDebrief(args as any);
  }
  if (type === "monthly") {
    const { generateMonthlyReport } = await import("../services/monthlyReportGenerator");
    return generateMonthlyReport(args as any);
  }
  if (type === "quarterly") {
    const { generateQuarterlyReport } = await import("../services/quarterlyReportGenerator");
    return generateQuarterlyReport(args as any);
  }
  return null;
}

// Revalidacao de elegibilidade no momento de processar: usa o snapshot
// `subscription_plan_at_enqueue` gravado no job (defesa-em-profundidade barata —
// nao depende de um lookup user que precisa resolver userPlatformId) + re-check
// do opt-in via getCoachPreferences (que funciona com userPlatformId). Fallback
// pra getUserSubscriptionPlan(userPlatformId) so se o snapshot estiver ausente.
async function revalidateEligibility(storage: any, claimed: any): Promise<boolean> {
  const userId = claimed?.userId;
  const reportType = (claimed?.reportType ?? "weekly") as ReportKind;
  try {
    const prefs = await getCoachPreferences(userId);
    const field = PREF_FIELD_BY_KIND[reportType];
    if (!field || prefs?.[field] !== true) return false;
  } catch (err) {
    console.error("report.job.revalidate.prefs.error", { userId, reportType, err });
    return false; // safe-deny
  }
  // plano/tier: prioriza o snapshot do enqueue (que ja contem o tier resolvido —
  // 'trial'|'admin'|'pro'|'premium'); senao consulta o storage por userPlatformId.
  let value: string | undefined =
    typeof claimed?.subscriptionPlanAtEnqueue === "string" && claimed.subscriptionPlanAtEnqueue
      ? claimed.subscriptionPlanAtEnqueue
      : undefined;
  if (value == null) {
    try {
      const p = await storage.getUserSubscriptionPlan?.(userId);
      value = typeof p === "string" ? p : undefined;
    } catch (err) {
      console.error("report.job.revalidate.plan.error", { userId, err });
    }
  }
  // se nem o snapshot nem o lookup deram um valor, confia no opt-in (ja revalidado
  // acima) — nao bloqueia por incerteza de plano (o enqueuer ja filtrou).
  if (value == null) return true;
  try {
    return await isEligibleSnapshot(userId, value);
  } catch (err) {
    console.error("report.job.revalidate.tier.error", { userId, err });
    return false; // safe-deny
  }
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

  // AI-1C / RF-04 — reportType pode ser 'weekly' (AI-1B default), 'daily', 'monthly'.
  const reportType = String(claimed?.reportType ?? "weekly").toLowerCase();

  // idempotencia da geracao — reports row ja existe?
  try {
    const existing = await storage.getReportForPeriod?.(userId, reportType, claimed.periodStart);
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
    const result = await callGeneratorByType(reportType, {
      userId,
      periodStart: claimed.periodStart,
      periodEnd: claimed.periodEnd,
      ...(failSoft ? { failSoft: true } : {}),
      injectedStorage: storage,
    });
    if (result == null) {
      console.error("report.job.unsupported_report_type", { jobId: job.id, userId, reportType });
      await storage.updateReportJob?.(job.id, { status: "skipped", lastError: `unsupported_report_type:${reportType}`, updatedAt: new Date() });
      return;
    }

    // #12 — debrief inteligente: generator pode suprimir (sessao trivial). Marca
    // o job 'skipped' sem persistir relatorio nem entregar (sem spam).
    if ((result as any).suppressed === true) {
      await storage.updateReportJob?.(job.id, { status: "skipped", lastError: "below_relevance_threshold", updatedAt: new Date() });
      return;
    }

    const reportId: string | null = await persistOrFetchReportId(storage, claimed, result);
    await storage.updateReportJob?.(job.id, { status: "done", reportId, updatedAt: new Date() });
    if (reportId) {
      // Sprint EST-1 (ADR-223 §Decisão 5/6) — entrega tripla (in-app → chat → email)
      // para weekly/daily/monthly via deliverReport (email coberto internamente).
      if (reportType === "weekly" || reportType === "daily" || reportType === "monthly") {
        try {
          const { deliverReport } = await import("../services/reportDelivery");
          void deliverReport({ reportId, userId, reportType }, storage).catch((err) =>
            console.error("report.job.deliver.error", { reportId, userId, reportType, err: err instanceof Error ? err.message : String(err) }),
          );
        } catch (err) {
          console.error("report.job.deliver.import.error", { reportId, userId, err: err instanceof Error ? err.message : String(err) });
        }
      } else if (reportType === "quarterly") {
        // Quarterly fica fora de EST-1 — preserva o email do AI-2B (não regredir).
        try {
          const { sendReportEmail } = await import("../services/reportEmailSender");
          void sendReportEmail({ reportId, userId, kind: "report_quarterly" }, storage).catch((err) =>
            console.error("report.job.email.send.error", { reportId, userId, kind: "report_quarterly", err: err instanceof Error ? err.message : String(err) }),
          );
        } catch (err) {
          console.error("report.job.email.import.error", { reportId, userId, err: err instanceof Error ? err.message : String(err) });
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("report.job.error", { jobId: job.id, userId, reportType, attempts, err: msg });
    if (attempts < maxAttempts) {
      const idx = Math.min(attempts - 1, BACKOFF_MS.length - 1);
      const nextAt = new Date(now.getTime() + BACKOFF_MS[Math.max(0, idx)]);
      await storage.updateReportJob?.(job.id, { status: "pending", lastError: msg.slice(0, 1000), nextAttemptAt: nextAt, updatedAt: new Date() });
    } else {
      // fail-soft (RF-09) — gera o relatorio deterministico e marca done (nunca failed).
      try {
        const fallback = await callGeneratorByType(reportType, {
          userId,
          periodStart: claimed.periodStart,
          periodEnd: claimed.periodEnd,
          failSoft: true,
          injectedStorage: storage,
        });
        let reportId: string | null = fallback ? await persistOrFetchReportId(storage, claimed, fallback) : null;
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
  cron.schedule("0 * * * *", () => {
    enqueueQuarterlyReportJobsTick(new Date()).catch((err) => console.error("report.job.quarterly.tick.error", { err }));
  });
  cron.schedule("*/15 * * * *", () => {
    processReportJobsTick({}).catch((err) => console.error("report.job.processor.tick.error", { err }));
  });
  _registered = true;
  console.info("report.job.runner.started", { enqueuer: "0 * * * *", quarterly: "0 * * * *", processor: "*/15 * * * *" });
}

/** Helper de teste — reseta o flag de registro. */
export function _resetReportJobRunnerForTests(): void {
  _registered = false;
}
