// =============================================================================
// bDownswingTick — Sprint AI-2A / RF-08 (ADR-167) — categoria B-DOWNSWING
//
// Tick hourly. Para users Pro+ com toggle nudgeBDownswing on:
//   - getDrawdownInWindow(userId, COACH_DOWNSWING_WINDOW_DAYS)
//   - drawdownPct >= COACH_DOWNSWING_DRAWDOWN_PCT (default 15) + sampleConfidence='high'
//   - cycleKey YYYY-WW (1/semana), via shouldSendNudge.
//
// Lessons: #9 (try/catch por user), `now: Date` injetavel.
// =============================================================================

import { storage } from "../../storage";
import { shouldSendNudge } from "../nudgeEngine";
import { isProPlusEligible, LIST_USERS_FOR_CRON_PRO_PLUS } from "../planEligibility";
import { getEnvNumber, getISOWeekKey } from "../timezone";

interface TickOptions {
  now?: Date;
  injectedStorage?: any;
}

function isNudgesDisabled(): boolean {
  return process.env.COACH_NUDGES_ENABLED === "false";
}

async function resolveStorage(injected?: any): Promise<any> {
  return injected ?? storage;
}

async function isProPlus(store: any, userId: string, plan?: string): Promise<boolean> {
  try {
    const effectivePlan = plan ?? (await store.getUserSubscriptionPlan?.(userId)) ?? "free";
    return await isProPlusEligible(userId, effectivePlan);
  } catch (err) {
    console.error("b_downswing.plan.error", { userId, err });
    return false;
  }
}

export async function bDownswingTick(opts: TickOptions = {}): Promise<void> {
  const now = opts.now ?? new Date();
  if (isNudgesDisabled()) {
    console.info("b_downswing.skip", { reason: "nudges_globally_disabled" });
    return;
  }
  const store = await resolveStorage(opts.injectedStorage);
  const threshold = getEnvNumber("COACH_DOWNSWING_DRAWDOWN_PCT", 15);
  const windowDays = getEnvNumber("COACH_DOWNSWING_WINDOW_DAYS", 7);

  let users: Array<{ userPlatformId: string; timezone?: string | null; subscriptionPlan?: string | null }> = [];
  try {
    users = (await store.listUsersForCron?.(LIST_USERS_FOR_CRON_PRO_PLUS)) ?? [];
  } catch (err) {
    console.error("b_downswing.list_users_error", { err });
    return;
  }

  for (const u of users) {
    const userId = u?.userPlatformId;
    if (!userId) continue;
    try {
      if (!(await isProPlus(store, userId, u?.subscriptionPlan ?? undefined))) continue;
      const prefs = await store.getCoachPreferences?.(userId);
      if (prefs && prefs.nudgeBDownswing === false) continue;

      const cycleKey = getISOWeekKey(now);
      const decision = await shouldSendNudge(userId, {
        category: "B-DOWNSWING",
        cycleKey,
        now,
      } as any);
      if (!decision.allow) continue;

      const dd = await store.getDrawdownInWindow?.(userId, windowDays);
      if (!dd) continue;
      if (dd.sampleConfidence === "low") continue;
      if (Number(dd.drawdownPct ?? 0) < threshold) continue;

      const body =
        `Detectei um downswing de ${Number(dd.drawdownPct).toFixed(1)}% nos ultimos ${dd.windowDays}d ` +
        `(${Math.round(dd.refBankrollUsd)} -> ${Math.round(dd.currentBankrollUsd)} USD). ` +
        `Isso pode ser variancia, mas vale revisar os leaks.`;

      let chatSessionId: string | null = null;
      try {
        const session = await store.createChatSession?.({ userId, coachType: "technical", title: "Downswing detectado" });
        chatSessionId = session?.id ?? null;
        if (chatSessionId) await store.insertChatMessage?.({ chatSessionId, role: "assistant", content: body });
      } catch { /* card-only */ }

      await store.createNudgeLog?.({
        userId,
        category: "B-DOWNSWING",
        cycleKey,
        status: "sent",
        titleI18n: "Downswing detectado",
        bodyPreview: body.slice(0, 500),
        chatSessionId,
        triggeredByEvent: "b_downswing_check",
      });
      console.info("coach.nudge.b_downswing.sent", { userId, cycleKey, drawdownPct: dd.drawdownPct });
    } catch (err) {
      console.error("b_downswing.user.error", { userId, err: err instanceof Error ? err.message : String(err) });
    }
  }
}
