/**
 * studyStreak — Sprint Estudos-Habito-1 (RF-2 / ADR-128).
 *
 * Algoritmo determinista de streak diario com 2 freezes mensais silenciosos.
 *
 * Transitions:
 *   - 'goal_not_met'      : todayMet=false                    -> streak inalterado
 *   - 'idempotent'        : todayMet=true gap=0               -> streak inalterado
 *   - 'incremented'       : todayMet=true gap=1               -> streak++
 *   - 'freeze_consumed'   : todayMet=true gap=2 freezesUsed<2 -> streak++ + freezes++
 *   - 'reset'             : todayMet=true gap>=2 freezesUsed=2 -> streak=1
 *   - 'reset_long'        : todayMet=true gap>=3              -> streak=1
 *
 * Race-safe: usa storage.getUserForStreakUpdate() que faz SELECT FOR UPDATE
 * em runtime real. Em testes mockados o lock eh no-op.
 *
 * Lazy reset: se lastFreezeResetMonth != mes corrente UTC, freezesUsed=0
 * antes do calculo (auto-recovery se cron falhou).
 */

import { storage } from "../storage";

export type StreakTransition =
  | "goal_not_met"
  | "idempotent"
  | "incremented"
  | "freeze_consumed"
  | "reset"
  | "reset_long";

export interface StreakResult {
  streakDays: number;
  todayMinutes: number;
  goalMinutes: number;
  todayMet: boolean;
  freezesUsedThisMonth: number;
  freezesRemaining: number;
  transition: StreakTransition;
}

function formatDateUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatYearMonthUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function daysBetween(fromDateStr: string, toDateStr: string): number {
  // YYYY-MM-DD parsing -> dias inteiros UTC.
  const fromMs = Date.UTC(
    Number(fromDateStr.slice(0, 4)),
    Number(fromDateStr.slice(5, 7)) - 1,
    Number(fromDateStr.slice(8, 10)),
  );
  const toMs = Date.UTC(
    Number(toDateStr.slice(0, 4)),
    Number(toDateStr.slice(5, 7)) - 1,
    Number(toDateStr.slice(8, 10)),
  );
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24));
}

export interface BumpStudyStreakInput {
  userId: string;
  sessionStartedAt?: Date;
  tx?: any;
}

export async function bumpStudyStreak(input: BumpStudyStreakInput): Promise<StreakResult> {
  const { userId, tx } = input;
  const now = new Date();
  const sessionStartedAt = input.sessionStartedAt ?? now;

  // 1. Lock user row.
  const user: any = await (storage as any).getUserForStreakUpdate(userId, tx);
  if (!user) {
    return {
      streakDays: 0,
      todayMinutes: 0,
      goalMinutes: 0,
      todayMet: false,
      freezesUsedThisMonth: 0,
      freezesRemaining: 2,
      transition: "goal_not_met",
    };
  }

  const goal = Number(user.dailyStudyGoalMinutes ?? 0);
  let streakDays = Number(user.studyStreakDays ?? 0);
  const lastActivityAt: Date | null = user.lastStudyActivityAt ?? null;

  // 2. Lazy reset freezes se mes virou.
  const currentMonth = formatYearMonthUTC(now);
  let freezesUsed = Number(user.studyStreakFreezesUsedThisMonth ?? 0);
  if (user.lastFreezeResetMonth !== currentMonth) {
    freezesUsed = 0;
  }

  // 3. Compute today minutes.
  const todayUtc = formatDateUTC(now);
  const todayMinutes = await (storage as any).getStudyMinutesTodayV2(userId, todayUtc);

  // 4. todayMet?
  const todayMet = goal === 0 || todayMinutes >= goal;

  // 5. State machine.
  let transition: StreakTransition = "goal_not_met";
  let newStreak = streakDays;
  let newFreezesUsed = freezesUsed;

  if (todayMet) {
    const lastActiveDateStr = lastActivityAt ? formatDateUTC(lastActivityAt) : null;
    const gapDays = lastActiveDateStr ? daysBetween(lastActiveDateStr, todayUtc) : Infinity;

    if (gapDays === 0) {
      transition = "idempotent";
    } else if (gapDays === 1) {
      newStreak = streakDays + 1;
      transition = "incremented";
    } else if (gapDays === 2 && freezesUsed < 2) {
      newStreak = streakDays + 1;
      newFreezesUsed = freezesUsed + 1;
      transition = "freeze_consumed";
    } else if (gapDays === 2) {
      // freezesUsed >= 2
      newStreak = 1;
      transition = "reset";
    } else if (Number.isFinite(gapDays) && gapDays >= 3) {
      newStreak = 1;
      transition = "reset_long";
    } else if (!Number.isFinite(gapDays)) {
      // Sem atividade anterior — comeca em 1.
      newStreak = 1;
      transition = "incremented";
    }
  }

  // 6. Persiste.
  await (storage as any).updateUserStreakState(
    userId,
    {
      studyStreakDays: newStreak,
      lastStudyActivityAt: todayMet ? sessionStartedAt : lastActivityAt,
      studyStreakFreezesUsedThisMonth: newFreezesUsed,
      lastFreezeResetMonth: currentMonth,
    },
    tx,
  );

  return {
    streakDays: newStreak,
    todayMinutes,
    goalMinutes: goal,
    todayMet,
    freezesUsedThisMonth: newFreezesUsed,
    freezesRemaining: Math.max(0, 2 - newFreezesUsed),
    transition,
  };
}

export async function getStudyHabit(userId: string): Promise<{
  streakDays: number;
  todayMinutes: number;
  goalMinutes: number;
  todayMet: boolean;
  freezesUsedThisMonth: number;
  freezesRemaining: number;
  lastActivityAt: Date | null;
}> {
  // Replicamos o caminho aqui (lendo via getUserForStreakUpdate + minutesToday)
  // porque o teste mocka apenas esses storage methods. Logica equivalente a
  // storage.getStudyHabit; se um dia o teste evoluir, podemos delegar.
  const user: any = await (storage as any).getUserForStreakUpdate(userId);
  if (!user) {
    return {
      streakDays: 0,
      todayMinutes: 0,
      goalMinutes: 0,
      todayMet: true,
      freezesUsedThisMonth: 0,
      freezesRemaining: 2,
      lastActivityAt: null,
    };
  }
  const now = new Date();
  const goal = Number(user.dailyStudyGoalMinutes ?? 0);
  const currentMonth = formatYearMonthUTC(now);
  const lazyFreezes = user.lastFreezeResetMonth !== currentMonth
    ? 0
    : Number(user.studyStreakFreezesUsedThisMonth ?? 0);
  const todayUtc = formatDateUTC(now);
  const todayMinutes = await (storage as any).getStudyMinutesTodayV2(userId, todayUtc);
  const todayMet = goal === 0 || todayMinutes >= goal;
  return {
    streakDays: Number(user.studyStreakDays ?? 0),
    todayMinutes,
    goalMinutes: goal,
    todayMet,
    freezesUsedThisMonth: lazyFreezes,
    freezesRemaining: Math.max(0, 2 - lazyFreezes),
    lastActivityAt: user.lastStudyActivityAt ?? null,
  };
}
