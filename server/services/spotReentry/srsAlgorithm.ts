/**
 * Sprint Spot-Anki-Reentry-3 — RF-2.2 SM-2 simplified algorithm.
 *
 * Spec: Docs/specs/spot-anki-reentry-3.md §RF-2.2
 * ADRs : 136 (algoritmo SM-2 simplified), 139 (initial state por source)
 *
 * Algoritmo determinista (sem fuzz). Cap interval [1, 120] e ease [1.3, 3.0].
 * Mesmo input → mesmo output sempre.
 */

export type SrsGrade = "again" | "hard" | "good" | "easy";

export type SrsCardState = {
  intervalDays: number;
  easeFactor: number;
};

export type ApplyGradeResult = {
  nextIntervalDays: number;
  newEaseFactor: number;
  nextReviewAt: Date;
};

const INTERVAL_MIN = 1;
const INTERVAL_MAX = 120;
const EASE_MIN = 1.3;
const EASE_MAX = 3.0;
const DAY_MS = 86_400_000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Applies an SM-2 grade to the current card state.
 *
 * - again: reset interval=1, ease *= 0.8 (cap min 1.3).
 * - hard : interval *= 1.2, ease *= 0.9 (cap min 1.3).
 * - good : interval *= ease, ease unchanged.
 * - easy : interval *= ease * 1.3, ease *= 1.15 (cap max 3.0).
 *
 * Caps applied: interval ∈ [1, 120], ease ∈ [1.3, 3.0]. Output rounded to 2dp.
 */
export function applyGrade(
  card: SrsCardState,
  grade: SrsGrade,
): ApplyGradeResult {
  const intervalIn = Number(card.intervalDays);
  const easeIn = Number(card.easeFactor);

  let intervalDays = intervalIn;
  let easeFactor = easeIn;

  switch (grade) {
    case "again":
      intervalDays = 1;
      easeFactor = Math.max(EASE_MIN, easeIn * 0.8);
      break;
    case "hard":
      intervalDays = intervalIn * 1.2;
      easeFactor = Math.max(EASE_MIN, easeIn * 0.9);
      break;
    case "good":
      intervalDays = intervalIn * easeIn;
      // easeFactor unchanged
      break;
    case "easy":
      intervalDays = intervalIn * easeIn * 1.3;
      easeFactor = Math.min(EASE_MAX, easeIn * 1.15);
      break;
  }

  // Caps + rounding
  intervalDays = clamp(intervalDays, INTERVAL_MIN, INTERVAL_MAX);
  easeFactor = clamp(easeFactor, EASE_MIN, EASE_MAX);
  intervalDays = round2(intervalDays);
  easeFactor = round2(easeFactor);

  const now = new Date();
  const nextReviewAt = new Date(now.getTime() + intervalDays * DAY_MS);

  return {
    nextIntervalDays: intervalDays,
    newEaseFactor: easeFactor,
    nextReviewAt,
  };
}

// ============================================================================
// computeInitialState — RF-2.2 + ADR-139
// ============================================================================

export type ComputeInitialStateInput = {
  source: "manual_add" | "drill_gto_difficult_spot" | "coach_session_insight";
  decisionCorrect?: boolean | null;
  confidenceLevel?: number | null;
};

export type InitialStateResult = {
  intervalDays: number;
  easeFactor: number;
  nextReviewAt: Date;
};

/**
 * Computes the initial SRS state for a brand-new card.
 *
 * Sources `manual_add` and `drill_gto_difficult_spot` always default to 1d.
 * For `coach_session_insight`:
 *   - decisionCorrect=false → 1d (priority — erro confirmado).
 *   - confidenceLevel<=2 → 2d (low confidence — let it consolidate).
 *   - default → 1d.
 *
 * Initial easeFactor is always 2.5 (Anki neutral).
 */
export function computeInitialState(
  input: ComputeInitialStateInput,
): InitialStateResult {
  let intervalDays = 1;

  if (input.source === "coach_session_insight") {
    if (input.decisionCorrect === false) {
      intervalDays = 1;
    } else if (
      input.confidenceLevel !== null &&
      input.confidenceLevel !== undefined &&
      input.confidenceLevel <= 2
    ) {
      intervalDays = 2;
    } else {
      intervalDays = 1;
    }
  }
  // manual_add and drill_gto_difficult_spot — always 1d.

  const easeFactor = 2.5;
  const now = new Date();
  const nextReviewAt = new Date(now.getTime() + intervalDays * DAY_MS);

  return { intervalDays, easeFactor, nextReviewAt };
}
