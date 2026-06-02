// =============================================================================
// bLife — Coach AI UX Overhaul (Wave 3 / #7) — categoria de nudge B-LIFE
//
// bLifeTick({ now, injectedStorage? }) — roda hora-em-hora (cron 0 * * * *)
// filtrando hora local (11h). Opt-in (nudgeBLife default FALSE — so quem ativou
// recebe; shouldSendNudge checa o toggle). Elegibilidade: Pro+.
//
// Trigger: volume sustentado sem folga. Conta DIAS distintos jogados nos ultimos
// 7 — se >= N (COACH_BLIFE_DAYS_MIN, default 6), sugere um off-day (vida fora do
// poker / sustentabilidade). Self-contained (reusa getGrindSessions). cycleKey
// YYYY-WW (1x/semana).
//
// Lessons: #3, #9 (safe-degrade), `now: Date` injetavel.
// =============================================================================

import { storage } from "../../storage";
import { shouldSendNudge } from "../nudgeEngine";
import { getLocalHour } from "../timezone";
import { isProPlusEligible, LIST_USERS_FOR_CRON_PRO_PLUS } from "../planEligibility";

const LOCAL_HOUR = 11; // meio da manha — antes do grind do dia.
const DEFAULT_DAYS_MIN = 6; // jogou 6+ dos ultimos 7 = sem folga.

interface TickOptions {
  now?: Date;
  injectedStorage?: any;
}

function isNudgesDisabled(): boolean {
  return process.env.COACH_NUDGES_ENABLED === "false";
}

function daysMin(): number {
  const raw = Number(process.env.COACH_BLIFE_DAYS_MIN);
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 7) : DEFAULT_DAYS_MIN;
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

// Dias distintos (YYYY-MM-DD) com sessao nos ultimos 7 dias.
function distinctPlayDaysLast7(sessions: any[], now: Date): number {
  const sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const days = new Set<string>();
  for (const s of Array.isArray(sessions) ? sessions : []) {
    const raw = String(s?.date ?? s?.startDate ?? "");
    const ymd = raw.slice(0, 10);
    if (!ymd) continue;
    const t = new Date(raw).getTime();
    if (Number.isFinite(t) && t >= sevenDaysAgoMs) days.add(ymd);
  }
  return days.size;
}

async function isProPlus(store: any, userId: string, plan?: string): Promise<boolean> {
  try {
    const effectivePlan = plan ?? (await store.getUserSubscriptionPlan?.(userId)) ?? "free";
    return await isProPlusEligible(userId, effectivePlan);
  } catch (err) {
    console.error("b_life.plan.error", { userId, err });
    return false;
  }
}

export async function bLifeTick(opts: TickOptions = {}): Promise<void> {
  const now = opts.now ?? new Date();
  if (isNudgesDisabled()) {
    console.info("b_life.skip", { reason: "nudges_globally_disabled" });
    return;
  }
  const store = await resolveStorage(opts.injectedStorage);
  const minDays = daysMin();

  let users: Array<{ userPlatformId: string; timezone: string; subscriptionPlan: string }> = [];
  try {
    users = (await store.listUsersForCron?.(LIST_USERS_FOR_CRON_PRO_PLUS)) ?? [];
  } catch (err) {
    console.error("b_life.list_users_error", { err });
    return;
  }

  for (const u of users) {
    const userId = u?.userPlatformId;
    if (!userId) continue;
    try {
      const tz = u?.timezone || "America/Sao_Paulo";
      if (getLocalHour(now, tz) !== LOCAL_HOUR) continue;
      if (!(await isProPlus(store, userId, u?.subscriptionPlan))) continue;

      let playDays = 0;
      try {
        const sessions = (await store.getGrindSessions?.(userId, { limit: 50 })) ?? [];
        playDays = distinctPlayDaysLast7(sessions, now);
      } catch (err) {
        console.error("b_life.signal.error", { userId, err });
        continue;
      }
      if (playDays < minDays) continue; // ainda tem folga — nao cobra.

      const cycleKey = getISOWeek(now);
      const decision = await shouldSendNudge(userId, {
        category: "B-LIFE",
        cycleKey,
        now,
        triggeredByEvent: "b_life_check",
      } as any);
      if (!decision.allow) continue;

      const body =
        `Voce grindou ${playDays} dos ultimos 7 dias sem folga. ` +
        `Descanso faz parte do jogo — que tal marcar um off-day essa semana? ` +
        `Teu A-game (e tua banca) agradecem.`;

      let chatSessionId: string | null = null;
      try {
        const session = await store.createChatSession?.({ userId, coachType: "mental", title: "Hora de uma folga" });
        chatSessionId = session?.id ?? null;
        if (chatSessionId) await store.insertChatMessage?.({ chatSessionId, role: "assistant", content: body });
      } catch { /* card-only */ }

      await store.createNudgeLog?.({
        userId,
        category: "B-LIFE",
        cycleKey,
        status: "sent",
        titleI18n: "Hora de uma folga",
        bodyPreview: body.slice(0, 500),
        chatSessionId,
        triggeredByEvent: "b_life_check",
        link: "/grade",
      });
      console.info("coach.nudge.b_life.sent", { userId, cycleKey, playDays });
    } catch (err) {
      console.error("b_life.user.error", { userId, err: err instanceof Error ? err.message : String(err) });
    }
  }
}
