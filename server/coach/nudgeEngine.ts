// =============================================================================
// shouldSendNudge — Sprint Coach Sprint 0 / RF-03 (ADR-085)
//
// Fonte unica de verdade para "posso disparar nudge X agora?".
//
// 5 checks sequenciais:
//   1. Categoria toggle off
//   2. Quiet hours (timezone-aware, wrap-around)
//   3. Daily cap (excludeStatus = ['snoozed'])
//   4. Hourly cap
//   5. One-shot per cycle (cycleKey + statusIn = ['sent','engaged','dismissed'])
//
// Lessons:
//   - DI now: Date para tests deterministicos.
//   - #9: safe-deny on error + console.error LOGADO antes do fallback.
//   - #3: mocks integration validam shape REAL.
// =============================================================================

import { getCoachPreferences, type CoachPreferences } from "../storage/coachPreferences";
import { storage } from "../storage";

export type NudgeCategory =
  | "B-SNAPSHOT"
  | "B-LEAK"
  | "B-STUDY"
  | "B-VOLUME"
  | "B-GRADE"
  | "B-DOWNSWING"
  | "B-LIFE"
  | "B-MENTAL";

export type NudgeDenyReason =
  | "category_disabled"
  | "quiet_hours"
  | "daily_cap_reached"
  | "hourly_cap_reached"
  | "already_sent_this_cycle"
  | "engine_error";

export type NudgeDecision =
  | { allow: true }
  | { allow: false; reason: NudgeDenyReason };

export interface NudgeContext {
  category: NudgeCategory;
  isCritical?: boolean;
  cycleKey?: string;
  now?: Date;
}

const CATEGORY_TOGGLE_MAP: Record<NudgeCategory, keyof CoachPreferences> = {
  "B-SNAPSHOT": "nudgeBSnapshot",
  "B-LEAK": "nudgeBLeak",
  "B-STUDY": "nudgeBStudy",
  "B-VOLUME": "nudgeBVolume",
  "B-GRADE": "nudgeBGrade",
  "B-DOWNSWING": "nudgeBDownswing",
  "B-LIFE": "nudgeBLife",
  "B-MENTAL": "nudgeBMental",
};

export function categoryToToggle(category: NudgeCategory): keyof CoachPreferences {
  return CATEGORY_TOGGLE_MAP[category];
}

/** ADR-084: wrap-around (start > end cruza meia-noite); start === end => disabled. */
export function isInQuietHours(
  localHour: number,
  start: number,
  end: number,
): boolean {
  if (start === end) return false; // disabled
  if (start < end) return localHour >= start && localHour < end;
  // wrap-around (ex: 21..9 inclui 21,22,23,0,1,..,8)
  return localHour >= start || localHour < end;
}

// Re-export para back-compat. Implementacao em ./timezone.
export { getLocalHour } from "./timezone";
import { getLocalHour as _getLocalHour } from "./timezone";

export async function shouldSendNudge(
  userId: string,
  ctx: NudgeContext,
): Promise<NudgeDecision> {
  const now = ctx.now ?? new Date();

  try {
    // 1. Categoria toggle
    const prefs = await getCoachPreferences(userId);
    const toggleField = categoryToToggle(ctx.category);
    const isEnabled = Boolean((prefs as any)[toggleField]);
    if (!isEnabled) {
      console.info("coach.nudge.deny", {
        userId,
        category: ctx.category,
        reason: "category_disabled",
      });
      return { allow: false, reason: "category_disabled" };
    }

    // 2. Quiet hours (bypassada se isCritical)
    if (!ctx.isCritical) {
      const tz = await (storage as any).getUserTimezone?.(userId);
      const localHour = _getLocalHour(now, tz);
      if (
        isInQuietHours(localHour, prefs.quietHoursStart, prefs.quietHoursEnd)
      ) {
        console.info("coach.nudge.deny", {
          userId,
          category: ctx.category,
          reason: "quiet_hours",
        });
        return { allow: false, reason: "quiet_hours" };
      }
    }

    // 3. Daily cap
    const dailySince = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dailyCount = await (storage as any).countNudgeLog(userId, {
      since: dailySince,
      excludeStatus: ["snoozed"],
    });
    if (dailyCount >= prefs.maxNudgesPerDay) {
      console.info("coach.nudge.deny", {
        userId,
        category: ctx.category,
        reason: "daily_cap_reached",
      });
      return { allow: false, reason: "daily_cap_reached" };
    }

    // 4. Hourly cap
    const hourlySince = new Date(now.getTime() - 60 * 60 * 1000);
    const hourlyCount = await (storage as any).countNudgeLog(userId, {
      since: hourlySince,
      excludeStatus: ["snoozed"],
    });
    if (hourlyCount >= prefs.maxNudgesPerHour) {
      console.info("coach.nudge.deny", {
        userId,
        category: ctx.category,
        reason: "hourly_cap_reached",
      });
      return { allow: false, reason: "hourly_cap_reached" };
    }

    // 5. One-shot per cycle (idempotencia)
    if (ctx.cycleKey) {
      const existing = await (storage as any).findNudgeLog(
        userId,
        ctx.category,
        ctx.cycleKey,
        { statusIn: ["sent", "engaged", "dismissed"] },
      );
      if (existing) {
        console.info("coach.nudge.deny", {
          userId,
          category: ctx.category,
          reason: "already_sent_this_cycle",
          cycleKey: ctx.cycleKey,
        });
        return { allow: false, reason: "already_sent_this_cycle" };
      }
    }

    console.info("coach.nudge.allow", {
      userId,
      category: ctx.category,
      cycleKey: ctx.cycleKey,
    });
    return { allow: true };
  } catch (err) {
    console.error("coach.nudge.engine.error", {
      userId,
      category: ctx.category,
      err,
    });
    return { allow: false, reason: "engine_error" };
  }
}
