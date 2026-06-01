import { describe, it, expect } from "vitest";
import { parseNotation, enumerateCombos } from "@/lib/combo-calc/combos";
import { parseCard, cardKey } from "@/lib/combo-calc/cards";
import type { Card } from "@/lib/combo-calc/types";

function dead(cards: string[]): Set<string> {
  const s = new Set<string>();
  for (const c of cards) {
    const card = parseCard(c)!;
    s.add(cardKey(card));
  }
  return s;
}

describe("parseNotation", () => {
  it("pair", () => {
    expect(parseNotation("55")).toMatchObject({ kind: "pair", ranks: [5, 5] });
    expect(parseNotation("AA")).toMatchObject({ kind: "pair", ranks: [14, 14] });
  });
  it("suited / offsuit", () => {
    expect(parseNotation("A7s")).toMatchObject({ kind: "suited", ranks: [14, 7] });
    expect(parseNotation("76o")).toMatchObject({ kind: "offsuit", ranks: [7, 6] });
  });
  it("anytwo", () => {
    expect(parseNotation("76")).toMatchObject({ kind: "anytwo", ranks: [7, 6] });
  });
  it("specific rank-suit-rank-suit (QhJh)", () => {
    const p = parseNotation("QhJh")!;
    expect(p.kind).toBe("specific");
    expect(p.cards!.map((c) => cardKey(c))).toEqual(["Qh", "Jh"]);
  });
  it("specific rank-rank-suit-suit (K7hh)", () => {
    const p = parseNotation("K7hh")!;
    expect(p.kind).toBe("specific");
    expect(p.cards!.map((c) => cardKey(c))).toEqual(["Kh", "7h"]);
  });
  it("rejects garbage", () => {
    expect(parseNotation("XYZ")).toBeNull();
    expect(parseNotation("")).toBeNull();
    expect(parseNotation("7s")).toBeNull(); // carta solta, nao classe
  });
});

// Teste 1 — Card removal puro. Bordo Ad 8h 4h 6c 5d, heroi As 6s.
describe("Teste 1 — card removal (golden)", () => {
  const d = dead(["Ad", "8h", "4h", "6c", "5d", "As", "6s"]);
  const cases: [string, number][] = [
    ["85s", 2],
    ["65s", 1],
    ["54s", 2],
    ["65o", 5],
    ["54o", 7],
    ["A7s", 2],
    ["A7o", 6],
    ["A5s", 2],
    ["A5o", 4],
    ["A4s", 1],
    ["A4o", 5],
    ["77", 6],
    ["55", 3],
    ["76s", 2],
    ["76o", 6],
    ["QhJh", 1],
  ];
  for (const [notation, expected] of cases) {
    it(`${notation} -> ${expected} combos`, () => {
      const parsed = parseNotation(notation)!;
      expect(enumerateCombos(parsed, d).length).toBe(expected);
    });
  }

  it("nominal counts sem cartas mortas", () => {
    const empty = new Set<string>();
    expect(enumerateCombos(parseNotation("77")!, empty).length).toBe(6);
    expect(enumerateCombos(parseNotation("A7s")!, empty).length).toBe(4);
    expect(enumerateCombos(parseNotation("A7o")!, empty).length).toBe(12);
    expect(enumerateCombos(parseNotation("76")!, empty).length).toBe(16);
  });

  it("combos retornados nao usam cartas mortas", () => {
    const parsed = parseNotation("A4s")!;
    const combos = enumerateCombos(parsed, d);
    for (const [a, b] of combos) {
      expect(d.has(cardKey(a as Card))).toBe(false);
      expect(d.has(cardKey(b as Card))).toBe(false);
    }
  });
});
