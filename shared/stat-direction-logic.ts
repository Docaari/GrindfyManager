// =============================================================================
// Sprint Stats-V2 — Direction semantics logic (RF-06, ADR-063)
//
// Decide cor (green/red/orange/gray) por stat baseando-se em `direction` +
// posicao do `value` em relacao a [targetMin, targetMax].
//
// Regras:
//   on-target (targetMin <= value <= targetMax): green sempre
//   off-target lower (value < targetMin):
//     higher_better => red
//     lower_better  => green
//     context       => orange
//     neutral       => gray
//   off-target upper (value > targetMax):
//     higher_better => green
//     lower_better  => red
//     context       => orange
//     neutral       => gray
//   value=null OU undefined => gray sempre
// =============================================================================

import type { StatDirection, StatField } from "./hud-stat-catalog";

export type StatColor = "green" | "red" | "orange" | "gray";

interface RangeLike {
  targetMin: number;
  targetMax: number;
  direction: StatDirection;
}

export function getStatColor(
  stat: RangeLike | StatField,
  value: number | null | undefined,
): StatColor {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "gray";
  }

  const { targetMin, targetMax, direction } = stat;

  if (value >= targetMin && value <= targetMax) {
    return "green";
  }

  const above = value > targetMax;

  switch (direction) {
    case "higher_better":
      return above ? "green" : "red";
    case "lower_better":
      return above ? "red" : "green";
    case "context":
      return "orange";
    case "neutral":
    default:
      return "gray";
  }
}

const TOOLTIPS: Record<StatDirection, string> = {
  higher_better: "Quanto maior, melhor — alvo de referencia indica leak abaixo do range.",
  lower_better: "Quanto menor, melhor — alvo de referencia indica leak acima do range.",
  context:
    "Depende do estilo (TAG/LAG). Coach interpreta — fora do range nao significa leak automatico.",
  neutral: "Stat informativo, sem direcao boa/ruim absoluta.",
};

const FALLBACK_TOOLTIP =
  "Stat sem direcao explicita — Coach interpreta caso a caso.";

export function getDirectionTooltip(direction: StatDirection | string): string {
  return TOOLTIPS[direction as StatDirection] ?? FALLBACK_TOOLTIP;
}
