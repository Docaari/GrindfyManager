// RF-00.1 — Slider de sensibilidade correto em turn e flop.
// Spec: Docs/specs/range-lab/F0-verdade.md
//
// Sintoma medido (turn, bordo Ad 8h 4h 2c, heroi As 6s, range A7s/76s/KK):
//   evaluateSpot(spot).heroEquity       = 77,3760%
//   heroEquityAtMultiplier(spot, k = 1) = 82,4462%
// k = 1 e o multiplicador neutro: os dois numeros TEM que ser identicos.
//
// Causa: heroEquityAtMultiplier acumula w*eq so no bucket `win` e w*(1-eq) so no
// bucket `lose`, entao fora do river o denominador deixa de ser a massa total.
import { describe, it, expect } from "vitest";
import {
  evaluateSpot,
  heroEquityAtMultiplier,
} from "@/lib/combo-calc/evaluateSpot";
import type { ComboResult, Verdict } from "@/lib/combo-calc/types";
import { FLOP_SPOT, RIVER_SPOT, TURN_SPOT, card } from "./f0-fixtures";

/** Contrato da spec: equity ponderada e sempre soma(w*eq) / soma(w). */
function weightedEquity(perCombo: ComboResult[], scale: (r: ComboResult) => number): number {
  let num = 0;
  let den = 0;
  for (const r of perCombo) {
    const w = r.weight * scale(r);
    num += w * r.equity;
    den += w;
  }
  return den > 0 ? num / den : 0;
}

const TOL = 1e-9;

describe("RF-00.1 — k=1 e neutro: slider bate com o veredito nos tres streets", () => {
  it("flop: heroEquityAtMultiplier(spot, 1) devolve exatamente evaluateSpot(spot).heroEquity", () => {
    const v = evaluateSpot(FLOP_SPOT);
    expect(heroEquityAtMultiplier(FLOP_SPOT, 1)).toBeCloseTo(v.heroEquity, 9);
    expect(Math.abs(heroEquityAtMultiplier(FLOP_SPOT, 1) - v.heroEquity)).toBeLessThan(TOL);
  });

  it("turn: heroEquityAtMultiplier(spot, 1) devolve exatamente evaluateSpot(spot).heroEquity", () => {
    const v = evaluateSpot(TURN_SPOT);
    expect(heroEquityAtMultiplier(TURN_SPOT, 1)).toBeCloseTo(v.heroEquity, 9);
    expect(Math.abs(heroEquityAtMultiplier(TURN_SPOT, 1) - v.heroEquity)).toBeLessThan(TOL);
  });

  it("river: heroEquityAtMultiplier(spot, 1) devolve exatamente evaluateSpot(spot).heroEquity", () => {
    const v = evaluateSpot(RIVER_SPOT);
    expect(heroEquityAtMultiplier(RIVER_SPOT, 1)).toBeCloseTo(v.heroEquity, 9);
    expect(Math.abs(heroEquityAtMultiplier(RIVER_SPOT, 1) - v.heroEquity)).toBeLessThan(TOL);
  });

  it("turn: o slider parado no meio nao mostra mais os 82,45% do bug", () => {
    const v = evaluateSpot(TURN_SPOT);
    expect(v.heroEquity).toBeCloseTo(0.773760, 5); // valor correto, nao regride
    expect(heroEquityAtMultiplier(TURN_SPOT, 1)).not.toBeCloseTo(0.824462, 4);
  });

  it("flop: o slider parado no meio nao mostra mais os 83,42% do bug", () => {
    const v = evaluateSpot(FLOP_SPOT);
    expect(v.heroEquity).toBeCloseTo(0.725849, 5);
    expect(heroEquityAtMultiplier(FLOP_SPOT, 1)).not.toBeCloseTo(0.834170, 4);
  });

  it("k=1 e neutro qualquer que seja o subset escalado", () => {
    const v = evaluateSpot(TURN_SPOT);
    const onLosers = heroEquityAtMultiplier(TURN_SPOT, 1, (r) => r.outcome === "lose");
    const onAll = heroEquityAtMultiplier(TURN_SPOT, 1, () => true);
    expect(onLosers).toBeCloseTo(v.heroEquity, 9);
    expect(onAll).toBeCloseTo(v.heroEquity, 9);
  });
});

describe("RF-00.1 — equity ponderada e soma(w*eq)/soma(w) em qualquer k", () => {
  it("turn: k=0 remove a massa dos vencedores e usa o denominador restante", () => {
    const v = evaluateSpot(TURN_SPOT);
    const expected = weightedEquity(v.perCombo, (r) => (r.outcome === "win" ? 0 : 1));
    expect(heroEquityAtMultiplier(TURN_SPOT, 0)).toBeCloseTo(expected, 9);
  });

  it("turn: k=0.5 escala so os vencedores e mantem a massa total coerente", () => {
    const v = evaluateSpot(TURN_SPOT);
    const expected = weightedEquity(v.perCombo, (r) => (r.outcome === "win" ? 0.5 : 1));
    expect(heroEquityAtMultiplier(TURN_SPOT, 0.5)).toBeCloseTo(expected, 9);
  });

  it("flop: k=1.5 escala so os vencedores e mantem a massa total coerente", () => {
    const v = evaluateSpot(FLOP_SPOT);
    const expected = weightedEquity(v.perCombo, (r) => (r.outcome === "win" ? 1.5 : 1));
    expect(heroEquityAtMultiplier(FLOP_SPOT, 1.5)).toBeCloseTo(expected, 9);
  });

  it("k negativo e tratado como 0 (nao gera massa negativa)", () => {
    expect(heroEquityAtMultiplier(TURN_SPOT, -2)).toBeCloseTo(
      heroEquityAtMultiplier(TURN_SPOT, 0),
      9,
    );
  });

  it("turn: a equity continua monotonica crescente em k", () => {
    const at = (k: number) => heroEquityAtMultiplier(TURN_SPOT, k);
    expect(at(0)).toBeLessThanOrEqual(at(0.5));
    expect(at(0.5)).toBeLessThanOrEqual(at(1));
    expect(at(1)).toBeLessThanOrEqual(at(1.5));
  });
});

describe("RF-00.1 — a funcao aceita o Verdict ja calculado (sem reexecutar o pipeline)", () => {
  it("passar o Verdict da o mesmo numero que passar o Spot", () => {
    const v = evaluateSpot(TURN_SPOT);
    for (const k of [0, 0.3, 1, 1.5]) {
      expect(heroEquityAtMultiplier(v, k)).toBeCloseTo(
        heroEquityAtMultiplier(TURN_SPOT, k),
        9,
      );
    }
  });

  it("usa o perCombo recebido, nao um recalculado a partir do bordo", () => {
    // Verdict sintetico: os combos abaixo nao existem em nenhum spot avaliado.
    // Se a funcao reexecutar evaluateSpot, este numero nao fecha.
    const perCombo: ComboResult[] = [
      { combo: [card("Kc"), card("Kd")], weight: 1, outcome: "win", equity: 0.8 },
      { combo: [card("Qc"), card("Qd")], weight: 1, outcome: "lose", equity: 0.2 },
    ];
    const fake = { perCombo } as Verdict;
    // k=1: (1*0.8 + 1*0.2) / (1 + 1) = 0.5
    expect(heroEquityAtMultiplier(fake, 1)).toBeCloseTo(0.5, 12);
    // k=0 zera o vencedor: sobra (1*0.2)/1 = 0.2
    expect(heroEquityAtMultiplier(fake, 0)).toBeCloseTo(0.2, 12);
    // k=3 no vencedor: (3*0.8 + 0.2)/(3 + 1) = 0.65
    expect(heroEquityAtMultiplier(fake, 3)).toBeCloseTo(0.65, 12);
  });

  it("Verdict sem combos devolve 0 sem divisao por zero", () => {
    const fake = { perCombo: [] as ComboResult[] } as Verdict;
    expect(heroEquityAtMultiplier(fake, 1)).toBe(0);
  });
});
