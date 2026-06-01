import { describe, it, expect } from "vitest";
import {
  evaluateSpot,
  deadCards,
  DuplicateCardError,
  heroEquityAtMultiplier,
} from "@/lib/combo-calc/evaluateSpot";
import { parseCard } from "@/lib/combo-calc/cards";
import type { Card, RangeEntry, Spot } from "@/lib/combo-calc/types";

function cards(s: string): Card[] {
  return s.split(/\s+/).map((c) => parseCard(c)!);
}

function entry(notation: string, frequency: number): RangeEntry {
  // kind nao e usado por evaluateSpot (re-parseado internamente).
  return { notation, kind: "anytwo", frequency };
}

// Teste 2 — Bordo Ad 8h 4h 6c 5d, heroi As 6s (dois pares Ases e seis).
const TEST2_SPOT: Spot = {
  board: cards("Ad 8h 4h 6c 5d"),
  hero: [parseCard("As")!, parseCard("6s")!],
  villainRange: [
    // Bate o heroi (straights + sets)
    entry("A7s", 1.0), entry("A7o", 1.0), entry("87s", 1.0), entry("87o", 1.0),
    entry("76s", 1.0), entry("76o", 1.0), entry("75s", 1.0), entry("75o", 1.0),
    entry("74s", 1.0),
    entry("K7hh", 0.33), entry("97hh", 0.33), entry("Q7hh", 0.33),
    entry("J7hh", 0.33), entry("T7hh", 0.33),
    entry("77", 0.5), entry("55", 0.5),
    // Heroi ganha (dois pares menores + blefes)
    entry("85s", 1.0), entry("65s", 1.0), entry("54s", 1.0),
    entry("65o", 1.0), entry("54o", 1.0), entry("A5s", 1.0), entry("A5o", 1.0),
    entry("A4s", 0.5), entry("A4o", 0.5),
    entry("K6hh", 1.0), entry("Q6hh", 1.0), entry("J6hh", 1.0),
    entry("T6hh", 1.0), entry("96hh", 1.0), entry("K5hh", 1.0),
    entry("T8s", 1.0), entry("T4s", 1.0), entry("T9hh", 1.0),
    entry("QhJh", 0.5), entry("QhTh", 0.5),
  ],
  potCurrent: 36.1,
  callAmount: 13.8,
};

describe("Teste 2 — Verdict completo (golden)", () => {
  const v = evaluateSpot(TEST2_SPOT);

  it("L (heroi perde) ~ 49.15 combos", () => {
    expect(v.L).toBeCloseTo(49.15, 1);
  });
  it("W (heroi ganha) ~ 40.0 combos", () => {
    expect(v.W).toBeCloseTo(40.0, 1);
  });
  it("C (chops) = 0", () => {
    expect(v.C).toBe(0);
  });
  it("E ~ 44.9%", () => {
    expect(v.heroEquity).toBeCloseTo(0.449, 2);
  });
  it("alpha ~ 27.66%", () => {
    expect(v.requiredEquity).toBeCloseTo(0.2766, 3);
  });
  it("decisao = CALL", () => {
    expect(v.decision).toBe("call");
  });
  it("EV_call ~ +8.6 fichas", () => {
    expect(v.evCall).toBeCloseTo(8.6, 0);
  });
  it("winningCombosNeeded ~ 18.8", () => {
    expect(v.winningCombosNeeded).toBeCloseTo(18.8, 0);
  });
  it("breakevenFrequency ~ 0.47", () => {
    expect(v.breakevenFrequency!).toBeCloseTo(0.47, 1);
  });
  it("street = river", () => {
    expect(v.street).toBe("river");
  });

  it("slider: equity cai abaixo de alpha quando k < ~0.47", () => {
    const eAt047 = heroEquityAtMultiplier(TEST2_SPOT, 0.47);
    expect(eAt047).toBeCloseTo(v.requiredEquity, 2);
    expect(heroEquityAtMultiplier(TEST2_SPOT, 0.3)).toBeLessThan(v.requiredEquity);
    expect(heroEquityAtMultiplier(TEST2_SPOT, 1.0)).toBeGreaterThan(v.requiredEquity);
  });
});

describe("validacoes e estados extremos", () => {
  it("carta duplicada bordo/heroi -> DuplicateCardError", () => {
    expect(() =>
      deadCards(cards("Ad 8h 4h 6c 5d"), [parseCard("Ad")!, parseCard("6s")!]),
    ).toThrow(DuplicateCardError);
  });

  it("range vazio -> estado neutro sem divisao por zero", () => {
    const v = evaluateSpot({ ...TEST2_SPOT, villainRange: [] });
    expect(v.totalCombos).toBe(0);
    expect(v.heroEquity).toBe(0);
    expect(Number.isFinite(v.evCall)).toBe(true);
  });

  it("classe inteira zerada por bloqueadores entra em emptyEntries", () => {
    const v = evaluateSpot({
      ...TEST2_SPOT,
      villainRange: [entry("AA", 1.0)], // Ad+As mortos -> sobra AcAh = 1 combo
    });
    expect(v.totalCombos).toBeGreaterThan(0);
    const v2 = evaluateSpot({
      ...TEST2_SPOT,
      villainRange: [entry("66", 1.0)], // 6c+6s mortos -> 6d6h = 1 combo
    });
    expect(v2.totalCombos).toBe(1);
    const v3 = evaluateSpot({
      ...TEST2_SPOT,
      villainRange: [entry("AdAh", 1.0)], // specific com Ad morto -> 0
    });
    expect(v3.emptyEntries).toContain("AdAh");
  });

  it("filtro de naipe (suits) restringe combos da classe", () => {
    const empty = new Set<string>();
    // sem cartas mortas: Q3s tem 4 combos suited
    const base = evaluateSpot({
      ...TEST2_SPOT,
      board: cards("2c 7d 9s"), // flop neutro, sem Q/3
      villainRange: [entry("Q3s", 1)],
    });
    // restringe a Qh3h + Qs3s (2 combos)
    const filtered = evaluateSpot({
      ...TEST2_SPOT,
      board: cards("2c 7d 9s"),
      villainRange: [{ notation: "Q3s", kind: "suited", frequency: 1, suits: ["Qh3h", "Qs3s"] }],
    });
    expect(base.totalCombos).toBe(4);
    expect(filtered.totalCombos).toBe(2);
    void empty;
  });

  it("filtro de naipe interage com card removal (interseccao)", () => {
    // bordo tem 7d -> 7 disponivel em c,h,s. 8 disponivel em c,d,s (8h dead).
    // 87s suits restrito a 8c7c + 8d7d: 8d7d valido, 7c valido -> ambos vivos
    const v = evaluateSpot({
      ...TEST2_SPOT,
      villainRange: [{ notation: "87s", kind: "suited", frequency: 1, suits: ["8c7c", "8h7h"] }],
    });
    // 8h7h: 8h morto (bordo) -> some. sobra 8c7c. total 1.
    expect(v.totalCombos).toBe(1);
  });

  it("frequencia > 1 e clampada; frequencia 0 ignora combo", () => {
    const over = evaluateSpot({ ...TEST2_SPOT, villainRange: [entry("77", 5)] });
    const norm = evaluateSpot({ ...TEST2_SPOT, villainRange: [entry("77", 1)] });
    expect(over.totalCombos).toBe(norm.totalCombos);
    const zero = evaluateSpot({ ...TEST2_SPOT, villainRange: [entry("77", 0)] });
    expect(zero.totalCombos).toBe(0);
  });
});
