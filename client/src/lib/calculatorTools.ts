import { Calculator, Target, Award, Trophy, Dices, Gift, Layers } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Fonte unica de verdade das calculadoras (usado em /calculadoras + /grind-live).
export interface CalculatorTool {
  value: string;
  label: string;
  icon: LucideIcon;
}

export const calculatorTools: CalculatorTool[] = [
  { value: "size-geometrico", label: "Size Geometrico", icon: Calculator },
  { value: "rp-icm", label: "RP/ICM", icon: Target },
  { value: "mystery-bounty", label: "Mystery Bounty", icon: Gift },
  { value: "pko-bounty", label: "PKO Bounty", icon: Award },
  { value: "satelites", label: "Satelites", icon: Trophy },
  { value: "combos", label: "Combos", icon: Layers },
  { value: "randomizador", label: "Randomizador", icon: Dices },
];

const toolPopupSizes: Record<string, { width: number; height: number }> = {
  "size-geometrico": { width: 500, height: 700 },
  "rp-icm": { width: 650, height: 750 },
  "mystery-bounty": { width: 650, height: 850 },
  "pko-bounty": { width: 700, height: 850 },
  "satelites": { width: 700, height: 900 },
  "combos": { width: 820, height: 1000 },
  "randomizador": { width: 350, height: 300 },
};

export function openCalculatorPopup(toolKey: string) {
  const size = toolPopupSizes[toolKey] ?? { width: 600, height: 700 };
  const left = window.screenX + (window.outerWidth - size.width) / 2;
  const top = window.screenY + (window.outerHeight - size.height) / 2;
  window.open(
    `/calculadora-popup/${toolKey}`,
    `tool-${toolKey}`,
    `width=${size.width},height=${size.height},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`,
  );
}
