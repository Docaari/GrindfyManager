// Ponto de virada do slider fora do river (F2, RF-02.6, D-F2-4, ADR-247).
// `ev.ts` NAO muda: este e um numero NOVO ao lado, nao uma reescrita do
// `breakevenFrequency` fechado. Consome `Verdict.perCombo` (v1) ja calculado —
// nao reenumera runout.
import type { ComboResult, Verdict } from "./types";

export type BreakevenDegradedReason = "zero_denominator" | "no_flip";

export type BreakevenResult =
  | { k: number; degradedReason: null }
  | { k: null; degradedReason: BreakevenDegradedReason };

const EPS = 1e-9;

/**
 * Resolve k* tal que E(k) = (kA + C) / (kB + D) = alpha, escalando o peso dos
 * combos que casam com `subset` (default: os que o heroi GANHA). Forma
 * fechada, sem bisseccao — uma unica passada por `perCombo`.
 *
 * Devolve `null` com razao nomeada quando o denominador zera ou quando k*
 * seria negativo (spot que nunca vira) — nunca satura silenciosamente.
 */
export function solveBreakevenMultiplier(
  verdict: Verdict,
  subset: (r: ComboResult) => boolean = (r) => r.outcome === "win",
): BreakevenResult {
  let A = 0;
  let B = 0;
  let C = 0;
  let D = 0;

  for (const r of verdict.perCombo) {
    const w = r.weight;
    if (subset(r)) {
      A += w * r.equity;
      B += w;
    } else {
      C += w * r.equity;
      D += w;
    }
  }

  const alpha = verdict.requiredEquity;
  const denom = A - alpha * B;

  if (Math.abs(denom) <= EPS) {
    return { k: null, degradedReason: "zero_denominator" };
  }

  const k = (alpha * D - C) / denom;

  if (k < 0) {
    return { k: null, degradedReason: "no_flip" };
  }

  return { k, degradedReason: null };
}
