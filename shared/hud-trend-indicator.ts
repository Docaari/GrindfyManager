// =============================================================================
// Sprint Stats-V3 — getTrendIndicator helper (RF-15)
//
// Spec : docs/specs/sprint-stats-v3.md (RF-15 trend indicator + threshold por unit)
// ADR  : 066 (3-way comparison semantics — secao "Trend indicator")
//
// Threshold por `unit`:
//   pct:   <1% estavel | 1-5% moderado | >=5% grande
//   bb:    <0.1 estavel | 0.1-0.5 moderado | >=0.5 grande
//   count: <1 estavel | 1-5 moderado | >=5 grande
//
// Direction-aware:
//   higher_better: delta>0 -> ↑ (good); delta<0 -> ↓ (leak)
//   lower_better:  delta>0 -> ↓ (leak); delta<0 -> ↑ (good — invertido visual)
//   context|neutral: sempre →
// =============================================================================

import type { StatDirection, StatUnit } from "./hud-stat-catalog";

export type TrendIcon = "→" | "↑" | "↓" | "↑↑" | "↓↓";

export type TrendKind =
  | "stable"
  | "small_positive"
  | "small_negative"
  | "big_positive"
  | "big_negative"
  | "n_a";

export interface TrendIndicator {
  icon: TrendIcon;
  kind: TrendKind;
}

interface UnitThreshold {
  small: number; // delta abs >= this para sair de stable
  big: number; // delta abs >= this para virar big_*
}

const THRESHOLDS: Record<StatUnit, UnitThreshold> = {
  pct: { small: 1, big: 5 },
  bb: { small: 0.1, big: 0.5 },
  count: { small: 1, big: 5 },
};

export function getTrendIndicator(
  direction: StatDirection,
  snap1Value: number | null,
  snap2Value: number | null,
  unit: StatUnit,
): TrendIndicator | null {
  if (snap1Value === null || snap2Value === null) return null;

  const delta = snap2Value - snap1Value;
  const absDelta = Math.abs(delta);
  const threshold = THRESHOLDS[unit] ?? THRESHOLDS.pct;

  // Estavel: |delta| abaixo do threshold small
  if (absDelta < threshold.small) {
    return { icon: "→", kind: "stable" };
  }

  // Context / neutral: sempre →, mas mantendo "stable" para consumidores
  // que queiram diferenciar magnitude. Default render = →.
  if (direction === "context" || direction === "neutral") {
    return { icon: "→", kind: "stable" };
  }

  // higher_better: delta>0 = good; lower_better: delta>0 = leak.
  const isPositive = direction === "higher_better" ? delta > 0 : delta < 0;
  const big = absDelta >= threshold.big;

  if (big) {
    return isPositive
      ? { icon: "↑↑", kind: "big_positive" }
      : { icon: "↓↓", kind: "big_negative" };
  }
  return isPositive
    ? { icon: "↑", kind: "small_positive" }
    : { icon: "↓", kind: "small_negative" };
}
