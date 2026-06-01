import { describe, it, expect } from "vitest";
import { comboEquity, streetFromBoard } from "@/lib/combo-calc/equity";
import { parseCard } from "@/lib/combo-calc/cards";
import type { Card } from "@/lib/combo-calc/types";

const C = (s: string): Card => parseCard(s)!;

describe("comboEquity — river deterministico", () => {
  const board = ["Ad", "8h", "4h", "6c", "5d"].map(C);
  const hero: [Card, Card] = [C("As"), C("6s")]; // dois pares AA66

  it("vilao com straight ganha (eq heroi = 0)", () => {
    expect(comboEquity(hero, [C("7c"), C("7d")], board)).toBe(0); // 77 -> straight 4-8
  });
  it("vilao com dois pares menores perde (eq heroi = 1)", () => {
    expect(comboEquity(hero, [C("8c"), C("5c")], board)).toBe(1); // 85 -> two pair 88 55
  });
});

describe("comboEquity — chop no river", () => {
  it("straight no bordo divide (eq = 0.5)", () => {
    const board = ["5c", "6d", "7h", "8s", "9c"].map(C);
    const hero: [Card, Card] = [C("2d"), C("2h")];
    const vill: [Card, Card] = [C("3c"), C("3d")];
    expect(comboEquity(hero, vill, board)).toBe(0.5);
  });
});

describe("comboEquity — turn/flop por enumeracao", () => {
  it("turn: fracao entre 0 e 1", () => {
    const board = ["Ad", "8h", "4h", "6c"].map(C); // 4 cartas
    const hero: [Card, Card] = [C("As"), C("6s")];
    const eq = comboEquity(hero, [C("Kd"), C("Qd")], board);
    expect(eq).toBeGreaterThan(0);
    expect(eq).toBeLessThanOrEqual(1);
  });
  it("flop: heroi com set domina alto", () => {
    const board = ["Ad", "8h", "4h"].map(C); // 3 cartas
    const hero: [Card, Card] = [C("As"), C("Ac")]; // set de ases
    const eq = comboEquity(hero, [C("Kd"), C("Qd")], board);
    expect(eq).toBeGreaterThan(0.8);
  });
});

describe("streetFromBoard", () => {
  it("mapeia tamanho -> street", () => {
    expect(streetFromBoard(5)).toBe("river");
    expect(streetFromBoard(4)).toBe("turn");
    expect(streetFromBoard(3)).toBe("flop");
  });
});
