// =============================================================================
// bVolumeTick — Sprint AI-2A / RF-09 (ADR-167) — categoria B-VOLUME
//
// Terca 11h local. Projecao linear: currentSoFar * (7/daysElapsed). Se
// projecao < baseline * (1 - dropPct/100) (default dropPct=30) -> nudge.
// baseline.sampleSize < 2 -> no-op.
// =============================================================================

import { storage } from "../../storage";
import { shouldSendNudge } from "../nudgeEngine";
import { getEnvNumber, getISOWeekKey, getLocalHour, getLocalWeekday } from "../timezone";
import { LIST_USERS_FOR_CRON_PRO_PLUS } from "../planEligibility";

const LOCAL_HOUR = 11;
const LOCAL_WEEKDAY = 2; // terca

interface TickOptions {
  now?: Date;
  injectedStorage?: any;
}

function isNudgesDisabled(): boolean {
  return process.env.COACH_NUDGES_ENABLED === "false";
}

export async function bVolumeTick(opts: TickOptions = {}): Promise<void> {
  const now = opts.now ?? new Date();
  if (isNudgesDisabled()) {
    console.info("b_volume.skip", { reason: "nudges_globally_disabled" });
    return;
  }
  const store = opts.injectedStorage ?? storage;
  const dropPct = getEnvNumber("COACH_VOLUME_DROP_PCT", 30);
  const triggerRatio = 1 - dropPct / 100; // projecao < baseline*triggerRatio -> trigger

  let users: Array<{ userPlatformId: string; timezone?: string | null; subscriptionPlan?: string | null }> = [];
  try {
    users = (await store.listUsersForCron?.(LIST_USERS_FOR_CRON_PRO_PLUS)) ?? [];
  } catch (err) {
    console.error("b_volume.list_users_error", { err });
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
      if (prefs && prefs.nudgeBVolume === false) continue;

      const currentSoFar = Number((await store.countTournamentsThisWeek?.(userId)) ?? 0);
      const baseline = (await store.avgWeeklyTournaments?.(userId, 4)) ?? { avg: 0, sampleSize: 0 };
      if (Number(baseline.sampleSize ?? 0) < 2) continue;

      // dias decorridos desde segunda local. Para terca 11h local -> 2 dias decorridos.
      const daysElapsed = 2;
      const projection = currentSoFar * (7 / daysElapsed);
      const targetThreshold = Number(baseline.avg) * triggerRatio;
      if (projection >= targetThreshold) continue;

      const cycleKey = getISOWeekKey(now);
      const decision = await shouldSendNudge(userId, {
        category: "B-VOLUME",
        cycleKey,
        now,
      } as any);
      if (!decision.allow) continue;

      const dropPercent = Math.round((1 - projection / Number(baseline.avg)) * 100);
      const body =
        `Volume projetado abaixo do habitual: ${Math.round(projection)} vs media ${Math.round(Number(baseline.avg))} ` +
        `(queda ~${dropPercent}%). Algo aconteceu essa semana? /grade-planner`;

      let chatSessionId: string | null = null;
      try {
        const session = await store.createChatSession?.({ userId, coachType: "tournament", title: "Volume abaixo do habitual" });
        chatSessionId = session?.id ?? null;
        if (chatSessionId) await store.insertChatMessage?.({ chatSessionId, role: "assistant", content: body });
      } catch { /* card-only */ }

      await store.createNudgeLog?.({
        userId,
        category: "B-VOLUME",
        cycleKey,
        status: "sent",
        titleI18n: "Volume abaixo do habitual",
        bodyPreview: body.slice(0, 500),
        chatSessionId,
        triggeredByEvent: "b_volume_check",
      });
      console.info("coach.nudge.b_volume.sent", { userId, cycleKey, projection, baselineAvg: baseline.avg });
    } catch (err) {
      console.error("b_volume.user.error", { userId, err: err instanceof Error ? err.message : String(err) });
    }
  }
}
