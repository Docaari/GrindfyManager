// =============================================================================
// server/coach/goals/computePace.ts — Metas 4DX fatia-1 (ADR-229 DEC-A3)
//
// Pace line linear + status derivado. Helpers PUROS (sem DB, sem Date.now()).
//
//   computeExpectedNow(baseline, target, createdAt, deadline, now): number | null
//     expectedNow = baseline + (target - baseline) * clamp01((now-createdAt)/(deadline-createdAt))
//   deriveStatus(actual, expectedNow, target, direction): GoalStatus
//     thresholds FIXOS (ratio = actual/expectedNow):
//       achieved se actual >= target (override)
//       ahead     ratio > 1.10
//       on_track  0.90 <= ratio <= 1.10
//       behind    0.70 <= ratio < 0.90
//       at_risk   ratio < 0.70
//     Borda div-zero:
//       expectedNow === 0 e actual <= 0 -> on_track (dia-zero, A4 nao crava)
//       expectedNow === 0 e actual  > 0 -> ahead
// =============================================================================

import type { GoalStatus } from "@shared/goals";

export type Direction = "up" | "down";

function toMs(d: Date | number): number {
  return typeof d === "number" ? d : d.getTime();
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Interpolacao linear baseline -> target ao longo de [createdAt, deadline] no
 * instante `now`. clamp01 satura: now<createdAt -> baseline; now>deadline -> target.
 * deadline <= createdAt (dado inconsistente) -> clamp01 retorna 1 -> target.
 */
export function computeExpectedNow(
  baseline: number,
  target: number,
  createdAt: Date | number,
  deadline: Date | number,
  now: Date | number,
): number | null {
  const created = toMs(createdAt);
  const dead = toMs(deadline);
  const at = toMs(now);
  const span = dead - created;
  let frac: number;
  if (span <= 0) {
    // deadline <= createdAt: tempo "100% decorrido" (DEC-A3).
    frac = 1;
  } else {
    frac = clamp01((at - created) / span);
  }
  return baseline + (target - baseline) * frac;
}

/**
 * Status derivado dos thresholds DEC-A3. Fatia-1 so exercita direction='up'.
 */
export function deriveStatus(
  actual: number,
  expectedNow: number | null,
  target: number,
  _direction: Direction = "up",
): GoalStatus {
  // achieved override (qualquer ratio).
  if (actual >= target) return "achieved";

  // Borda divisao por zero (DEC-A3).
  if (expectedNow === null || expectedNow === 0) {
    if (actual > 0) return "ahead";
    return "on_track"; // dia-zero, A4 nao crava
  }

  const ratio = actual / expectedNow;
  if (ratio > 1.1) return "ahead";
  if (ratio >= 0.9) return "on_track";
  if (ratio >= 0.7) return "behind";
  return "at_risk";
}
