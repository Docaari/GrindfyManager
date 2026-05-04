// =============================================================================
// generateCoachRecommendations — Sprint home-reform-4 / Item 4 (RF-02, ADR-112).
//
// Cron tick semanal segunda 06:00 BRT. Itera users elegiveis e gera 1
// recomendacao por user via recommendLessonForUser. Idempotente: se user ja
// tem rec na semana corrente, skip.
//
// Lessons aplicadas:
//   #9  try/catch por user — falha de 1 nao quebra batch.
// =============================================================================

import { storage } from "../../storage";
import { recommendLessonForUser } from "../recommendLessonForUser";
import { getCurrentWeekStartBRT } from "../weekHelper";
import { detectLeaks } from "../../coachLeakDetection";

interface TickOptions {
  now?: Date;
}

interface TickSummary {
  generated: number;
  skipped: number;
  errors: number;
}

export type GenerateForUserResult =
  | "created"
  | "skipped"
  | "skipped_empty"
  | "error";

function weekStartIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function gatherInput(
  userId: string,
  weekStart: Date,
): Promise<{
  leaks: any[];
  analytics: {
    last7DaysRoi: number;
    last7DaysVolume: number;
    last7DaysProfit: number;
    last30DaysRoi: number;
  };
  activeProfile: "A" | "B" | "C" | null;
  accessibleLessonIds: string[];
  lastConsumedLessonIds: string[];
  catalogLessons: any[];
}> {
  const [leaks, perf7d, perf30d, profile, lastConsumed, catalog] =
    await Promise.all([
      safe(async () => await detectLeaks(userId, { minSeverity: "low" }), []),
      safe(
        async () =>
          await (storage as any).getPerformanceByPeriod?.(userId, "7d"),
        null,
      ),
      safe(
        async () =>
          await (storage as any).getPerformanceByPeriod?.(userId, "30d"),
        null,
      ),
      safe(
        async () => await (storage as any).getActiveProfile?.(userId),
        null,
      ),
      safe(
        async () =>
          await (storage as any).getLastConsumedLessonIds?.(userId, 10),
        [],
      ),
      safe(
        async () =>
          await (storage as any).getCatalogLessonsForRecommendation?.({
            limit: 200,
            orderBy: "createdAt DESC",
          }),
        [],
      ),
    ]);

  const last7DaysRoi = Number(perf7d?.last7DaysRoi ?? perf7d?.roi ?? 0);
  const last7DaysVolume = Number(
    perf7d?.last7DaysVolume ?? perf7d?.volume ?? 0,
  );
  const last7DaysProfit = Number(
    perf7d?.last7DaysProfit ?? perf7d?.profit ?? 0,
  );
  const last30DaysRoi = Number(perf30d?.last30DaysRoi ?? perf30d?.roi ?? 0);

  return {
    leaks: Array.isArray(leaks) ? leaks : [],
    analytics: {
      last7DaysRoi,
      last7DaysVolume,
      last7DaysProfit,
      last30DaysRoi,
    },
    activeProfile: (profile as "A" | "B" | "C" | null) ?? null,
    accessibleLessonIds: [],
    lastConsumedLessonIds: Array.isArray(lastConsumed) ? lastConsumed : [],
    catalogLessons: Array.isArray(catalog) ? catalog : [],
  };
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function generateForUser(
  userId: string,
  weekStart: Date,
): Promise<GenerateForUserResult> {
  // Idempotencia: se ja tem rec, skip antes de chamar Anthropic.
  const existing = await (storage as any).getCoachRecommendationByUserAndWeek(
    userId,
    weekStartIso(weekStart),
  );
  if (existing) return "skipped";

  const input = await gatherInput(userId, weekStart);

  const result = await recommendLessonForUser({
    userId,
    leaks: input.leaks,
    analytics: input.analytics,
    activeProfile: input.activeProfile,
    accessibleLessonIds: input.accessibleLessonIds,
    lastConsumedLessonIds: input.lastConsumedLessonIds,
    catalogLessons: input.catalogLessons,
    weekStartDate: weekStartIso(weekStart),
  });

  if (!result) return "skipped_empty";

  await (storage as any).createCoachRecommendation({
    userId,
    lessonId: result.lessonId,
    weekStartDate: weekStartIso(weekStart),
    reason: result.reason,
    source: result.source,
    inputSummary: {
      leaks: input.leaks,
      analytics: input.analytics,
      profile: input.activeProfile,
      sampleSize: input.leaks.length,
    },
    chatSessionId: result.chatSessionId ?? null,
  });

  return "created";
}

export async function generateCoachRecommendationsTick(
  opts: TickOptions = {},
): Promise<TickSummary> {
  const weekStart = getCurrentWeekStartBRT(opts.now);
  const summary: TickSummary = { generated: 0, skipped: 0, errors: 0 };

  let users: Array<{ userPlatformId: string }> = [];
  try {
    users = await (storage as any).listUsersForCron(
      "subscription_plan IN ('free','pro','premium')",
    );
  } catch (err) {
    console.error("coach.cron.weekly_rec.list_users_error", { err });
    return summary;
  }

  for (const user of users) {
    const userId = user?.userPlatformId;
    if (!userId) continue;
    try {
      const result = await generateForUser(userId, weekStart);
      if (result === "created") summary.generated++;
      else if (result === "skipped" || result === "skipped_empty")
        summary.skipped++;
    } catch (err) {
      summary.errors++;
      console.error("coach.cron.weekly_rec.user.error", {
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.info("coach.cron.weekly_rec.done", {
    weekStart: weekStart.toISOString(),
    generated: summary.generated,
    skipped: summary.skipped,
    errors: summary.errors,
  });

  return summary;
}
