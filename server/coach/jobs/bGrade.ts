// =============================================================================
// bGradeTick — Sprint AI-2A / RF-10 (ADR-167) — categoria B-GRADE
//
// Domingo 18h local. Planned proxima semana < 3 -> nudge B-GRADE.
// =============================================================================

import { storage } from "../../storage";
import { shouldSendNudge } from "../nudgeEngine";
import { getISOWeekKey, getLocalHour, getLocalWeekday } from "../timezone";
import { LIST_USERS_FOR_CRON_PRO_PLUS } from "../planEligibility";

const LOCAL_HOUR = 18;
const LOCAL_WEEKDAY = 0; // domingo
const PLANNED_THRESHOLD = 3;

interface TickOptions {
  now?: Date;
  injectedStorage?: any;
}

function isNudgesDisabled(): boolean {
  return process.env.COACH_NUDGES_ENABLED === "false";
}

function nextMondayUtc(now: Date, _tz: string): Date {
  const dow = now.getUTCDay();
  const daysToMonday = ((1 - dow) + 7) % 7 || 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToMonday));
}

export async function bGradeTick(opts: TickOptions = {}): Promise<void> {
  const now = opts.now ?? new Date();
  if (isNudgesDisabled()) {
    console.info("b_grade.skip", { reason: "nudges_globally_disabled" });
    return;
  }
  const store = opts.injectedStorage ?? storage;

  let users: Array<{ userPlatformId: string; timezone?: string | null; subscriptionPlan?: string | null }> = [];
  try {
    users = (await store.listUsersForCron?.(LIST_USERS_FOR_CRON_PRO_PLUS)) ?? [];
  } catch (err) {
    console.error("b_grade.list_users_error", { err });
    return;
  }

  for (const u of users) {
    const userId = u?.userPlatformId;
    if (!userId) continue;
    try {
      const tz = u?.timezone || "America/Sao_Paulo";
      if (getLocalWeekday(now, tz) !== LOCAL_WEEKDAY) continue;
      if (getLocalHour(now, tz) !== LOCAL_HOUR) continue;

      const prefs = await store.getCoachPreferences?.(userId);
      if (prefs && prefs.nudgeBGrade === false) continue;

      const nextMon = nextMondayUtc(now, tz);
      const plannedCount = Number((await store.countPlannedTournamentsForWeek?.(userId, nextMon)) ?? 0);
      if (plannedCount >= PLANNED_THRESHOLD) continue;

      // Aderencia da semana passada (opcional)
      let adherence: { planned: number; played: number; adherencePct: number } | null = null;
      try {
        const lastWeekStart = new Date(nextMon.getTime() - 7 * 24 * 60 * 60 * 1000);
        adherence = await store.getGradeAdherenceForWeek?.(userId, lastWeekStart);
      } catch (err) {
        console.error("b_grade.adherence.error", { userId, err });
      }

      const cycleKey = getISOWeekKey(now);
      const decision = await shouldSendNudge(userId, {
        category: "B-GRADE",
        cycleKey,
        now,
      } as any);
      if (!decision.allow) continue;

      const adherenceLine = adherence
        ? `Semana passada aderencia ${adherence.adherencePct}% (${adherence.played}/${adherence.planned}).`
        : "";
      const body =
        `Sua grade pra proxima semana esta com ${plannedCount} torneios planejados. ` +
        `${adherenceLine} Bora montar? /grade-planner`;

      let chatSessionId: string | null = null;
      try {
        const session = await store.createChatSession?.({ userId, coachType: "tournament", title: "Monte sua grade" });
        chatSessionId = session?.id ?? null;
        if (chatSessionId) await store.insertChatMessage?.({ chatSessionId, role: "assistant", content: body });
      } catch { /* card-only */ }

      await store.createNudgeLog?.({
        userId,
        category: "B-GRADE",
        cycleKey,
        status: "sent",
        titleI18n: "Monte sua grade",
        bodyPreview: body.slice(0, 500),
        chatSessionId,
        triggeredByEvent: "b_grade_check",
      });
      console.info("coach.nudge.b_grade.sent", { userId, cycleKey, plannedCount });
    } catch (err) {
      console.error("b_grade.user.error", { userId, err: err instanceof Error ? err.message : String(err) });
    }
  }
}
