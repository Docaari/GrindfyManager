// =============================================================================
// weeklyReviewMonday — EST-5 / ADR-226 (RF-02)
//
// weeklyReviewMondayTick({ now?, injectedStorage? }) — roda hora-em-hora (cron
// 0 * * * *) e dispara o ritual de segunda apenas no horario-alvo local de
// segunda-feira. Molde = server/coach/jobs/bImport.ts.
//
// Gates (ordem barato -> caro):
//   1. COACH_NUDGES_ENABLED === "false" -> skip imediato (nudges_globally_disabled).
//   2. listUsersForCron(LIST_USERS_FOR_REPORTS_FILTER).
//   3. pre-check local: getLocalWeekday(now,tz)===1 (segunda) && getLocalHour===MONDAY_HOUR.
//   4. getReportTier(user) !== 'free'.
//   5. reportWeeklyEnabled === true.
//   6. idempotencia: getWeeklyReview(user, ymdUtc(nextMondayUtc(now))) -> skip se existe.
//   7. createWeeklyReview (recap_sent -> posta -> awaiting_upload).
//
// Lessons: #34 (now/injectedStorage injetaveis), #9 (log antes do fallback,
//   try/catch por user), #37 (imports estaticos para mocks por path funcionarem).
// =============================================================================

import { getLocalHour, getLocalWeekday } from "../timezone";
import {
  getReportTier,
  LIST_USERS_FOR_REPORTS_FILTER,
} from "../reportEligibility";
import {
  createWeeklyReview,
  getWeeklyReview,
} from "../weeklyReview/weeklyReviewOrchestrator";
import { ymdUtc, nextMondayUtc } from "../planning/weekKeys";

export const MONDAY_HOUR = 9; // manhã útil — o jogador planeja antes de grindar.

interface TickOptions {
  now?: Date;
  injectedStorage?: any;
}

function isNudgesDisabled(): boolean {
  return process.env.COACH_NUDGES_ENABLED === "false";
}

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../../storage");
  return (mod as any).storage;
}

export async function weeklyReviewMondayTick(opts: TickOptions = {}): Promise<void> {
  const now = opts.now ?? new Date();

  if (isNudgesDisabled()) {
    console.info("weekly_review_monday.skip", { reason: "nudges_globally_disabled" });
    return;
  }

  const storage = await resolveStorage(opts.injectedStorage);

  let users: Array<{
    userPlatformId: string;
    timezone?: string;
    subscriptionPlan?: string;
  }> = [];
  try {
    users = (await storage.listUsersForCron?.(LIST_USERS_FOR_REPORTS_FILTER)) ?? [];
  } catch (err) {
    console.error("weekly_review_monday.list_users_error", { err });
    return;
  }

  const wsd = ymdUtc(nextMondayUtc(now));

  for (const u of users) {
    const userId = u?.userPlatformId;
    if (!userId) continue;
    try {
      const tz = u?.timezone || "America/Sao_Paulo";
      // Gate 3 — pre-check local-Monday/hora (sem query pesada).
      if (getLocalWeekday(now, tz) !== 1) continue;
      if (getLocalHour(now, tz) !== MONDAY_HOUR) continue;

      // Gate 4 — tier elegivel != free.
      const tier = await getReportTier({
        userPlatformId: userId,
        subscriptionPlan: u?.subscriptionPlan ?? null,
      } as any);
      if (tier === "free") continue;

      // Gate 5 — opt-in reportWeeklyEnabled.
      const prefs = (await storage.getCoachPreferences?.(userId)) ?? {};
      if (prefs?.reportWeeklyEnabled !== true) continue;

      // Gate 6 — idempotencia da semana.
      const existing = await getWeeklyReview(userId, wsd, storage);
      if (existing) continue;

      // Gate 7 — cria a review (posta recap + avanca para awaiting_upload).
      await createWeeklyReview(userId, wsd, { injectedStorage: storage });
      console.info("weekly_review_monday.created", { userId, weekStartDate: wsd });
    } catch (err) {
      console.error("weekly_review_monday.user.error", {
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
