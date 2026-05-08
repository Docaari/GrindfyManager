/**
 * StudyHeaderHabit — Sprint Estudos-Habito-1 (RF-2.4).
 *
 * Header /estudos com streak + meta + freezes.
 * Goal=0 oculta freezes.
 *
 * data-testid:
 *   study-header-habit (root)
 *   study-header-streak-days
 *   study-header-meta-progress
 *   study-header-meta-current
 *   study-header-meta-goal
 *   study-header-freezes
 *   study-header-freezes-tooltip
 */

import * as React from "react";
import { Flame, Info } from "lucide-react";

// P2: constante para os freezes mensais (alinhada com ADR-128).
const FREEZES_PER_MONTH = 2;

export interface StudyHeaderHabitData {
  streakDays: number;
  todayMinutes: number;
  goalMinutes: number;
  todayMet: boolean;
  freezesUsedThisMonth: number;
  freezesRemaining: number;
}

export interface StudyHeaderHabitProps {
  data: StudyHeaderHabitData;
}

export function StudyHeaderHabit({ data }: StudyHeaderHabitProps) {
  const showFreezes = data.goalMinutes > 0;
  const progressPct = data.goalMinutes > 0
    ? Math.min(100, Math.round((data.todayMinutes / data.goalMinutes) * 100))
    : 0;
  const progressColor = data.todayMet
    ? "bg-green-500"
    : "bg-amber-500";

  return (
    <div
      data-testid="study-header-habit"
      className="flex flex-wrap items-center gap-6 p-4 border border-border rounded-lg bg-card"
    >
      <div className="flex items-center gap-2">
        <Flame className="h-5 w-5 text-orange-500" aria-hidden />
        <div>
          <div className="text-xs text-muted-foreground">Streak</div>
          <div data-testid="study-header-streak-days" className="text-lg font-semibold">
            {data.streakDays} {data.streakDays === 1 ? "dia" : "dias"}
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-[180px]">
        <div className="text-xs text-muted-foreground mb-1">
          Meta hoje:{" "}
          <span data-testid="study-header-meta-current">{data.todayMinutes}</span>
          {data.goalMinutes > 0 ? (
            <>
              /<span data-testid="study-header-meta-goal">{data.goalMinutes}</span> min
            </>
          ) : (
            <> min (sem meta)</>
          )}
        </div>
        {data.goalMinutes > 0 && (
          <div
            data-testid="study-header-meta-progress"
            className="h-2 bg-muted rounded overflow-hidden"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full transition-all ${progressColor}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </div>

      {showFreezes && (
        <div
          data-testid="study-header-freezes"
          className="flex items-center gap-1 text-sm"
        >
          <span>Freezes:</span>
          <span className="font-medium">{data.freezesRemaining}/{FREEZES_PER_MONTH}</span>
          <button
            type="button"
            data-testid="study-header-freezes-tooltip"
            title={`Streak conta dias com meta atingida. ${FREEZES_PER_MONTH} freezes/mes te protegem se voce esquecer 1 dia.`}
            aria-label="Sobre freezes"
            className="cursor-help text-muted-foreground"
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

export default StudyHeaderHabit;
