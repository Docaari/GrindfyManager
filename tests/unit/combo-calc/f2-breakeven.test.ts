// F2 — RF-02.6, ponto de virada do slider fora do river (D-F2-4, ADR-247).
// Spec: Docs/specs/range-lab/F2-range-builder.md (RF-02.6 + "Detalhamento")
// ADR : Docs/architecture/decisions/247-range-lab-f2-range-builder.md (D-F2-4)
//
// Contrato assumido (o implementer cria exatamente isto em
// client/src/lib/combo-calc/breakeven.ts — ARQUIVO NOVO, ev.ts intocado):
//
//   export type BreakevenDegradedReason = "zero_denominator" | "no_flip";
//   export type BreakevenResult =
//     | { k: number; degradedReason: null }
//     | { k: null; degradedReason: BreakevenDegradedReason };
//   export function solveBreakevenMultiplier(
//     verdict: Verdict,
//     subset?: (r: ComboResult) => boolean, // default: r => r.outcome === "win"
//   ): BreakevenResult;
//
// Formula fechada (RF-02.6, sem bisseccao):
//   A = soma_escalado(w*eq)   B = soma_escalado(w)
//   C = soma_resto(w*eq)      D = soma_resto(w)
//   k* = (alpha*D - C) / (A - alpha*B)
//
// Consome Verdict.perCombo (v1, ja existe) — NAO reenumera runout. `ev.ts` nao
// muda: este arquivo e um numero NOVO ao lado, nao uma reescrita do
// `breakevenFrequency` fechado.
import { describe, it, expect } from "vitest";
import { evaluateSpot, heroEquityAtMultiplier } from "@/lib/combo-calc/evaluateSpot";
import type { ComboResult, Verdict } from "@/lib/combo-calc/types";
import { card, FLOP_SPOT, TURN_SPOT, RIVER_SPOT } from "./f0-fixtures";
import { solveBreakevenMultiplier } from "@/lib/combo-calc/breakeven";

// Valores conferidos nesta sessao (2026-08-17) rodando evaluateSpot direto nos
// tres spots de f0-fixtures.ts (pote 36,1 / call 13,8, alpha 27,65%) — ver
// secao "Detalhamento" de F2-range-builder.md. O river bate com
// `verdict.breakevenFrequency` a 1e-16 na pratica; o teste usa 1e-9 (o piso
// pedido pelo criterio de aceite 6).
const FLOP_K = 0.007621097718527866;
const TURN_K = 0.05437127917598511;
const RIVER_K = 0.31855955678670356;

function fakeVerdict(overrides: { perCombo: ComboResult[]; requiredEquity: number }): Verdict {
  return {
    heroEquity: 0,
    requiredEquity: overrides.requiredEquity,
    evCall: 0,
    decision: "fold",
    degradedReason: null,
    W: 0,
    L: 0,
    C: 0,
    totalCombos: overrides.perCombo.length,
    totalWeight: overrides.perCombo.reduce((s, r) => s + r.weight, 0),
    wEff: 0,
    lEff: 0,
    equityGap: 0,
    evDeficit: 0,
    winningCombosNeeded: 0,
    breakevenFrequency: null,
    perCombo: overrides.perCombo,
    emptyEntries: [],
    street: "flop",
  };
}

describe("F2 D-F2-4 — solveBreakevenMultiplier bate com os numeros de referencia da F0", () => {
  it("flop: k* = 0,007621097718527866 (tolerancia 1e-9)", () => {
    const verdict = evaluateSpot(FLOP_SPOT);
    const result = solveBreakevenMultiplier(verdict);
    expect(result.degradedReason).toBeNull();
    expect(result.k).not.toBeNull();
    expect(result.k as number).toBeCloseTo(FLOP_K, 9);
  });

  it("turn: k* = 0,05437127917598511 (tolerancia 1e-9)", () => {
    const verdict = evaluateSpot(TURN_SPOT);
    const result = solveBreakevenMultiplier(verdict);
    expect(result.degradedReason).toBeNull();
    expect(result.k as number).toBeCloseTo(TURN_K, 9);
  });

  it("river: k* = 0,31855955678670356 e bate com verdict.breakevenFrequency (criterio de aceite 6)", () => {
    const verdict = evaluateSpot(RIVER_SPOT);
    const result = solveBreakevenMultiplier(verdict);
    expect(result.degradedReason).toBeNull();
    expect(result.k as number).toBeCloseTo(RIVER_K, 9);
    expect(verdict.breakevenFrequency, "no river os dois modelos coincidem (D11)").not.toBeNull();
    expect(result.k as number).toBeCloseTo(verdict.breakevenFrequency as number, 9);
  });
});

describe("F2 D-F2-4 — criterio de aceite 7: no k devolvido, a equity reavaliada encosta em requiredEquity", () => {
  it("no flop, heroEquityAtMultiplier(verdict, k*) bate com requiredEquity a 1e-6", () => {
    const verdict = evaluateSpot(FLOP_SPOT);
    const result = solveBreakevenMultiplier(verdict);
    const equityAtK = heroEquityAtMultiplier(verdict, result.k as number);
    expect(equityAtK).toBeCloseTo(verdict.requiredEquity, 6);
  });

  it("no turn, heroEquityAtMultiplier(verdict, k*) bate com requiredEquity a 1e-6", () => {
    const verdict = evaluateSpot(TURN_SPOT);
    const result = solveBreakevenMultiplier(verdict);
    const equityAtK = heroEquityAtMultiplier(verdict, result.k as number);
    expect(equityAtK).toBeCloseTo(verdict.requiredEquity, 6);
  });

  it("hoje o fechado erra feio no turn — o k* do solver NAO e 1 (regressao contra o numero mentiroso)", () => {
    const verdict = evaluateSpot(TURN_SPOT);
    const result = solveBreakevenMultiplier(verdict);
    // O fechado (W*/W) supoe k=1 move so a massa vencedora; a spec mede 6,8pp de
    // erro no turn. Um solver que devolvesse 1 (ou perto disso) estaria repetindo
    // o bug que a F0 tirou da tela.
    expect(Math.abs((result.k as number) - 1)).toBeGreaterThan(0.5);
  });
});

describe("F2 D-F2-4 — degradado nunca satura em silencio (falhar alto)", () => {
  it("subset que nao casa nenhum combo devolve zero_denominator (A=B=0 -> denominador zero)", () => {
    const verdict = evaluateSpot(FLOP_SPOT);
    const result = solveBreakevenMultiplier(verdict, () => false);
    expect(result.k).toBeNull();
    expect(result.degradedReason).toBe("zero_denominator");
  });

  it("verdict sem NENHUM combo 'win' tambem cai em zero_denominator com o subset default", () => {
    const perCombo: ComboResult[] = [
      { combo: [card("Ah"), card("Kh")], weight: 1, outcome: "lose", equity: 0.2 },
      { combo: [card("Qs"), card("Js")], weight: 1, outcome: "chop", equity: 0.5 },
    ];
    const verdict = fakeVerdict({ perCombo, requiredEquity: 0.5 });
    const result = solveBreakevenMultiplier(verdict);
    expect(result.k).toBeNull();
    expect(result.degradedReason).toBe("zero_denominator");
  });

  it("spot que nunca vira (k* < 0) devolve no_flip, nunca um numero negativo", () => {
    // A=0.9 (1 combo win, peso 1, equity 0.9) B=1; C=0.05 (1 combo chop, peso 0.1,
    // equity 0.5) D=0.1; alpha=0.3.
    // k* = (0.3*0.1 - 0.05) / (0.9 - 0.3*1) = -0.02 / 0.6 = -0.0333... < 0.
    const perCombo: ComboResult[] = [
      { combo: [card("Ah"), card("Kh")], weight: 1, outcome: "win", equity: 0.9 },
      { combo: [card("Qs"), card("Js")], weight: 0.1, outcome: "chop", equity: 0.5 },
    ];
    const verdict = fakeVerdict({ perCombo, requiredEquity: 0.3 });
    const result = solveBreakevenMultiplier(verdict);
    expect(result.k).toBeNull();
    expect(result.degradedReason).toBe("no_flip");
  });

  it("nunca devolve k negativo mesmo quando a matematica pediria (satura seria pior que ausente)", () => {
    const perCombo: ComboResult[] = [
      { combo: [card("Ah"), card("Kh")], weight: 1, outcome: "win", equity: 0.9 },
      { combo: [card("Qs"), card("Js")], weight: 0.1, outcome: "chop", equity: 0.5 },
    ];
    const verdict = fakeVerdict({ perCombo, requiredEquity: 0.3 });
    const result = solveBreakevenMultiplier(verdict);
    if (result.k != null) {
      expect(result.k).toBeGreaterThanOrEqual(0);
    } else {
      expect(result.degradedReason).not.toBeNull();
    }
  });
});

describe("F2 D-F2-4 — ev.ts nao muda: breakevenFrequency fechado continua intocado", () => {
  it("o breakevenFrequency fechado do river (ev.ts) e um numero DIFERENTE do solver so por coincidencia de street", () => {
    // Ambos batem no river (D11), mas sao dois calculos distintos — este teste
    // documenta que breakeven.ts nao substitui nem importa de ev.ts alem do que
    // ja existia (o modulo consome Verdict, nao recalcula breakevenFrequency).
    const verdict = evaluateSpot(RIVER_SPOT);
    expect(verdict.breakevenFrequency).not.toBeNull();
    const result = solveBreakevenMultiplier(verdict);
    expect(result.k as number).toBeCloseTo(verdict.breakevenFrequency as number, 9);
  });
});
