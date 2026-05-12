// =============================================================================
// gapCheck — Sprint AI-1B / RF-10 (ADR-157) — categoria de nudge B-GAPCHECK
//
// gapCheckTick({ now, injectedStorage? }) — roda hora-em-hora (cron 0 * * * *)
// filtrando "hoje eh sexta no fuso do user E a hora local eh uma hora util"
// (D-3 antes do Weekly Report de segunda 7h => sexta da mesma semana de jogo).
//
// Elegibilidade: mesma do Weekly Report (Pro+ && opt-in) — gap-check so faz
// sentido pra quem vai receber o relatorio. Faz um check de ESTADO REAL (queries
// no momento, NUNCA flag stale — risco R5): nao importou + tem sessoes / sessoes
// sem reconciliacao / snapshot pendente / 0min de estudo com foco ativo / foco
// sem update de stats. Se algum item -> 1 nudge gentil por ciclo (cycleKey
// YYYY-WW), via shouldSendNudge (anti-fadiga). Nada faltando -> nao manda.
//
// Lessons: #3 (mock shape real), #9 (logar / safe / try-catch por user),
//   `now: Date` injetavel.
// =============================================================================

import { storage } from "../../storage";
import { shouldSendNudge } from "../nudgeEngine";
import { getLocalHour } from "../timezone";
import { getCoachPreferences } from "../../storage/coachPreferences";

const PRO_PLANS = new Set(["pro", "premium", "admin"]);
const D3_LOCAL_HOUR = 10; // hora util — evita quiet hours; engine filtra de qualquer forma.

interface TickOptions {
  now?: Date;
  injectedStorage?: any;
}

function isNudgesDisabled(): boolean {
  return process.env.COACH_NUDGES_ENABLED === "false";
}

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  return storage;
}

function getISOWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-${String(weekNum).padStart(2, "0")}`;
}

/** weekday no fuso do user (0=domingo..6=sabado) para um instante UTC. */
function localWeekday(now: Date, tz: string): number {
  const safeTz = tz || "America/Sao_Paulo";
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: safeTz, weekday: "short" });
    const w = fmt.format(now).trim();
    const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return wdMap[w] ?? now.getUTCDay();
  } catch {
    return now.getUTCDay();
  }
}

async function isWeeklyReportEligible(store: any, userId: string, plan?: string): Promise<boolean> {
  try {
    const effectivePlan = plan ?? (await store.getUserSubscriptionPlan?.(userId)) ?? "free";
    if (!PRO_PLANS.has(String(effectivePlan))) return false;
    const prefs = await getCoachPreferences(userId);
    return prefs?.reportWeeklyEnabled === true;
  } catch (err) {
    console.error("gap_check.eligibility.error", { userId, err });
    return false;
  }
}

async function collectMissing(store: any, userId: string): Promise<string[]> {
  const missing: string[] = [];
  try {
    const hasImport = await store.hasImportThisWeek?.(userId);
    const sessionsThisWeek = await store.countGrindSessionsThisWeek?.(userId);
    if (hasImport === false && Number(sessionsThisWeek ?? 0) > 0) {
      missing.push("import");
    }
  } catch { /* ignore — check parcial */ }
  try {
    if (await store.hasUnreconciledSessionsThisWeek?.(userId)) missing.push("reconcile_sessions");
  } catch { /* ignore */ }
  try {
    if (await store.hasPendingBankrollSnapshot?.(userId)) missing.push("bankroll_snapshot");
  } catch { /* ignore */ }
  try {
    const studyMin = Number((await store.getStudyMinutesThisWeek?.(userId)) ?? 0);
    const activeFocus = (await store.findActiveLeakFocusList?.(userId)) ?? [];
    if (studyMin === 0 && Array.isArray(activeFocus) && activeFocus.length > 0) missing.push("study_focus");
  } catch { /* ignore */ }
  try {
    const activeFocus = (await store.findActiveLeakFocusList?.(userId)) ?? [];
    if (Array.isArray(activeFocus) && activeFocus.length > 0) {
      const hasStats = await store.hasStatsUpdateForActiveFocus?.(userId);
      if (hasStats === false) missing.push("stats_update");
    }
  } catch { /* ignore */ }
  return missing;
}

// Rotas Wouter REGISTRADAS (lesson #19) — `/stats` nao existe, stats vivem em `/estudos/stats`.
const LINKS_BY_ITEM: Record<string, string> = {
  import: "/upload",
  reconcile_sessions: "/grind",
  bankroll_snapshot: "/bankroll",
  study_focus: "/estudos",
  stats_update: "/estudos/stats",
};

export async function gapCheckTick(opts: TickOptions = {}): Promise<void> {
  const now = opts.now ?? new Date();
  if (isNudgesDisabled()) {
    console.info("gap_check.skip", { reason: "nudges_globally_disabled" });
    return;
  }
  const store = await resolveStorage(opts.injectedStorage);
  let users: Array<{ userPlatformId: string; timezone: string; subscriptionPlan: string }> = [];
  try {
    users = (await store.listUsersForCron?.("subscription_plan IN ('pro','premium')")) ?? [];
  } catch (err) {
    console.error("gap_check.list_users_error", { err });
    return;
  }
  for (const u of users) {
    const userId = u?.userPlatformId;
    if (!userId) continue;
    try {
      const tz = u?.timezone || "America/Sao_Paulo";
      if (localWeekday(now, tz) !== 5) continue; // so sexta (D-3 da segunda)
      if (getLocalHour(now, tz) !== D3_LOCAL_HOUR) continue;
      const eligible = await isWeeklyReportEligible(store, userId, u?.subscriptionPlan);
      if (!eligible) continue;

      const missing = await collectMissing(store, userId);
      if (missing.length === 0) continue; // nada faltando — nao cobra quem esta OK (R5)

      // cycleKey = ISO week da semana do report (segunda seguinte = mesma ISO week
      // da sexta).
      const cycleKey = getISOWeek(now);
      const decision = await shouldSendNudge(userId, {
        category: "B-GAPCHECK",
        cycleKey,
        now,
        triggeredByEvent: "gap_check_d3",
      } as any);
      if (!decision.allow) continue;

      const links = missing.map((m) => LINKS_BY_ITEM[m]).filter(Boolean);
      const body =
        `Vi que talvez esteja faltando alguns dados pro seu relatório de segunda: ${missing.join(", ")}.\n` +
        `Se você já fez por outro caminho, pode ignorar. Links: ${links.join(" ")}`;

      let chatSessionId: string | null = null;
      try {
        const session = await store.createChatSession?.({ userId, coachType: "technical", title: "Faltam dados pro relatório de segunda" });
        chatSessionId = session?.id ?? null;
        if (chatSessionId) {
          await store.insertChatMessage?.({ chatSessionId, role: "assistant", content: body });
        }
      } catch { /* card-only e suficiente */ }

      await store.createNudgeLog?.({
        userId,
        category: "B-GAPCHECK",
        cycleKey,
        status: "sent",
        titleI18n: "Faltam dados pro relatório de segunda",
        bodyPreview: body.slice(0, 500),
        chatSessionId,
        triggeredByEvent: "gap_check_d3",
      });
      console.info("coach.nudge.b_gapcheck.sent", { userId, cycleKey, missing });
    } catch (err) {
      console.error("gap_check.user.error", { userId, err: err instanceof Error ? err.message : String(err) });
    }
  }
}
