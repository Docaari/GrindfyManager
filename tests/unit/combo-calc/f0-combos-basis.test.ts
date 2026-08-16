// RF-00.5 — "Combos vencedores necessarios" coerente fora do river.
// Spec: Docs/specs/range-lab/F0-verdade.md
//
// Sintoma medido (turn, bordo Ad 8h 4h 2c): a tela mostra W = 9 (bucket
// discreto) ao lado de wNeeded = 0,95 (massa efetiva) e de um texto de
// break-even calculado numa terceira base. Tres numeros de bases diferentes na
// mesma linha.
//
// Regra: fora do river, o bloco "Quanto falta", o texto de break-even e o W
// exibido usam a MESMA base do veredito — massa efetiva. O bucket discreto
// continua existindo, rotulado como contagem de combos.
import { describe, it, expect } from "vitest";
import { evaluateSpot, verdictCalcBasis } from "@/lib/combo-calc/evaluateSpot";
import { winningCombosNeeded } from "@/lib/combo-calc/ev";
import { FLOP_SPOT, RIVER_SPOT, TURN_SPOT } from "./f0-fixtures";

describe("RF-00.5 — o veredito expoe a massa efetiva, nao so o bucket discreto", () => {
  it("turn: massa efetiva de vitoria e soma(w*eq), nao a contagem discreta", () => {
    const v = evaluateSpot(TURN_SPOT);
    expect(v.totalWeight).toBeCloseTo(11, 9);
    expect(v.wEff).toBeCloseTo(v.heroEquity * v.totalWeight, 9);
    expect(v.wEff).toBeCloseTo(8.51, 2);
    expect(v.lEff).toBeCloseTo(v.totalWeight - v.wEff, 9);
  });

  it("turn: massa efetiva e contagem discreta sao numeros diferentes", () => {
    const v = evaluateSpot(TURN_SPOT);
    expect(v.W).toBe(9); // contagem discreta preservada
    expect(v.L).toBe(2);
    expect(v.wEff).not.toBeCloseTo(v.W, 1);
  });

  it("wEff + lEff fecha a massa total ponderada em qualquer street", () => {
    for (const spot of [FLOP_SPOT, TURN_SPOT, RIVER_SPOT]) {
      const v = evaluateSpot(spot);
      expect(v.wEff + v.lEff).toBeCloseTo(v.totalWeight, 9);
    }
  });

  it("river sem chop: massa efetiva coincide com o bucket discreto", () => {
    const v = evaluateSpot(RIVER_SPOT);
    expect(v.C).toBe(0);
    expect(v.wEff).toBeCloseTo(v.W, 9);
    expect(v.lEff).toBeCloseTo(v.L, 9);
  });
});

describe("RF-00.5 — verdictCalcBasis diz qual base alimenta o calculo", () => {
  it("river usa o bucket discreto e se declara como tal", () => {
    const v = evaluateSpot(RIVER_SPOT);
    const basis = verdictCalcBasis(v);
    expect(basis.basis).toBe("discrete");
    expect(basis.W).toBeCloseTo(v.W, 9);
    expect(basis.L).toBeCloseTo(v.L, 9);
    expect(basis.C).toBeCloseTo(v.C, 9);
  });

  it("turn usa a massa efetiva e se declara como tal", () => {
    const v = evaluateSpot(TURN_SPOT);
    const basis = verdictCalcBasis(v);
    expect(basis.basis).toBe("effective");
    expect(basis.W).toBeCloseTo(v.wEff, 9);
    expect(basis.L).toBeCloseTo(v.lEff, 9);
    expect(basis.C).toBe(0);
  });

  it("flop usa a massa efetiva e se declara como tal", () => {
    const v = evaluateSpot(FLOP_SPOT);
    const basis = verdictCalcBasis(v);
    expect(basis.basis).toBe("effective");
    expect(basis.W).toBeCloseTo(v.wEff, 9);
    expect(basis.L).toBeCloseTo(v.lEff, 9);
  });

  it("o W exibido no bloco 'Quanto falta' nao e mais o 9 do bucket no turn", () => {
    const v = evaluateSpot(TURN_SPOT);
    expect(verdictCalcBasis(v).W).not.toBeCloseTo(9, 1);
  });
});

describe("RF-00.5 — wNeeded, break-even e o W exibido saem da mesma base", () => {
  it("turn: winningCombosNeeded reproduz-se a partir da base declarada", () => {
    const v = evaluateSpot(TURN_SPOT);
    const basis = verdictCalcBasis(v);
    expect(winningCombosNeeded(v.requiredEquity, basis.L, basis.C)).toBeCloseTo(
      v.winningCombosNeeded,
      9,
    );
  });

  it("flop: winningCombosNeeded reproduz-se a partir da base declarada", () => {
    const v = evaluateSpot(FLOP_SPOT);
    const basis = verdictCalcBasis(v);
    expect(winningCombosNeeded(v.requiredEquity, basis.L, basis.C)).toBeCloseTo(
      v.winningCombosNeeded,
      9,
    );
  });

  it("river: winningCombosNeeded reproduz-se a partir da base declarada", () => {
    const v = evaluateSpot(RIVER_SPOT);
    const basis = verdictCalcBasis(v);
    expect(winningCombosNeeded(v.requiredEquity, basis.L, basis.C)).toBeCloseTo(
      v.winningCombosNeeded,
      9,
    );
  });

  it("break-even e wNeeded dividido pelo MESMO W que a tela mostra", () => {
    for (const spot of [FLOP_SPOT, TURN_SPOT, RIVER_SPOT]) {
      const v = evaluateSpot(spot);
      const basis = verdictCalcBasis(v);
      expect(v.breakevenFrequency).not.toBeNull();
      expect(v.breakevenFrequency!).toBeCloseTo(v.winningCombosNeeded / basis.W, 9);
    }
  });

  it("massa zero nao produz base de calculo com decisao pendurada", () => {
    const v = evaluateSpot({ ...TURN_SPOT, villainRange: [] });
    const basis = verdictCalcBasis(v);
    expect(basis.W).toBe(0);
    expect(basis.L).toBe(0);
    expect(v.decision).toBeNull();
  });
});
