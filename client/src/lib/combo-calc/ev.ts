import type { Decision } from "./types";

export interface EvInputs {
  W: number; // combos ponderados que o heroi ganha
  L: number; // perde
  C: number; // chop
  potCurrent: number; // ja inclui aposta do vilao
  callAmount: number;
}

export interface EvOutputs {
  heroEquity: number; // E
  requiredEquity: number; // alpha
  evCall: number;
  decision: Decision;
  equityGap: number;
  evDeficit: number;
  winningCombosNeeded: number;
  breakevenFrequency: number | null;
}

const EPS = 1e-9;

/** Equity necessaria: alpha = call / (pote_atual + call). */
export function requiredEquity(potCurrent: number, callAmount: number): number {
  const finalPot = potCurrent + callAmount;
  return finalPot > 0 ? callAmount / finalPot : 0;
}

/** Equity ponderada do heroi: (W + 0.5C) / (W + L + C). */
export function heroEquity(W: number, L: number, C: number): number {
  const total = W + L + C;
  return total > 0 ? (W + 0.5 * C) / total : 0;
}

/**
 * Combos vencedores necessarios para break-even (E = alpha), mantendo L e C:
 *   W* = [alpha*L + C*(alpha - 0.5)] / (1 - alpha)
 */
export function winningCombosNeeded(
  alpha: number,
  L: number,
  C: number,
): number {
  const denom = 1 - alpha;
  if (denom <= EPS) return Infinity;
  return (alpha * L + C * (alpha - 0.5)) / denom;
}

export function computeEv(input: EvInputs): EvOutputs {
  const { W, L, C, potCurrent, callAmount } = input;
  const E = heroEquity(W, L, C);
  const alpha = requiredEquity(potCurrent, callAmount);
  const finalPot = potCurrent + callAmount;
  const evCall = E * finalPot - callAmount;

  let decision: Decision;
  if (Math.abs(E - alpha) <= 1e-6) decision = "breakeven";
  else decision = E > alpha ? "call" : "fold";

  const wNeeded = winningCombosNeeded(alpha, L, C);

  // Multiplicador global k nos combos vencedores tal que E(k) = alpha:
  //   (k*W + 0.5C)/(k*W + L + C) = alpha  ->  k = W* / W
  let breakevenFrequency: number | null = null;
  if (W > EPS && Number.isFinite(wNeeded)) {
    breakevenFrequency = wNeeded / W;
  }

  return {
    heroEquity: E,
    requiredEquity: alpha,
    evCall,
    decision,
    equityGap: Math.max(0, alpha - E),
    evDeficit: evCall < 0 ? evCall : 0,
    winningCombosNeeded: wNeeded,
    breakevenFrequency,
  };
}
