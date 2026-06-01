import { describe, it, expect } from "vitest";
import {
  evaluateHand,
  compareHands,
  showdown,
  CATEGORY,
} from "@/lib/combo-calc/evaluator";
import { parseCard } from "@/lib/combo-calc/cards";
import type { Card } from "@/lib/combo-calc/types";

function hand(s: string): Card[] {
  return s.split(/\s+/).map((c) => parseCard(c)!);
}

describe("evaluateHand — categorias", () => {
  it("straight flush", () => {
    const h = evaluateHand(hand("9h 8h 7h 6h 5h 2c Ad"));
    expect(h.category).toBe(CATEGORY.STRAIGHT_FLUSH);
    expect(h.tiebreakers[0]).toBe(9);
  });
  it("roda de straight flush (A-2-3-4-5)", () => {
    const h = evaluateHand(hand("Ah 2h 3h 4h 5h Kc Qd"));
    expect(h.category).toBe(CATEGORY.STRAIGHT_FLUSH);
    expect(h.tiebreakers[0]).toBe(5);
  });
  it("quadra com kicker", () => {
    const h = evaluateHand(hand("7c 7d 7h 7s Ad 2c 3d"));
    expect(h.category).toBe(CATEGORY.QUADS);
    expect(h.tiebreakers).toEqual([7, 14]);
  });
  it("full house", () => {
    const h = evaluateHand(hand("Kc Kd Kh 2c 2d 5s 9h"));
    expect(h.category).toBe(CATEGORY.FULL_HOUSE);
    expect(h.tiebreakers).toEqual([13, 2]);
  });
  it("full house com duas trincas usa a maior como trinca", () => {
    const h = evaluateHand(hand("Kc Kd Kh 9c 9d 9s 2h"));
    expect(h.category).toBe(CATEGORY.FULL_HOUSE);
    expect(h.tiebreakers).toEqual([13, 9]);
  });
  it("flush com kicker", () => {
    const h = evaluateHand(hand("Ah Kh 9h 4h 2h 3c 5d"));
    expect(h.category).toBe(CATEGORY.FLUSH);
    expect(h.tiebreakers).toEqual([14, 13, 9, 4, 2]);
  });
  it("straight (roda A baixo)", () => {
    const h = evaluateHand(hand("Ac 2d 3h 4s 5c Kd Qh"));
    expect(h.category).toBe(CATEGORY.STRAIGHT);
    expect(h.tiebreakers[0]).toBe(5);
  });
  it("trinca", () => {
    const h = evaluateHand(hand("8c 8d 8h Ac Kd 2s 3h"));
    expect(h.category).toBe(CATEGORY.TRIPS);
    expect(h.tiebreakers).toEqual([8, 14, 13]);
  });
  it("dois pares com kicker", () => {
    const h = evaluateHand(hand("Ac Ad 6c 6d 8h 3s 2c"));
    expect(h.category).toBe(CATEGORY.TWO_PAIR);
    expect(h.tiebreakers).toEqual([14, 6, 8]);
  });
  it("tres pares usa os dois maiores", () => {
    const h = evaluateHand(hand("Ac Ad Kc Kd 5h 5s 2c"));
    expect(h.category).toBe(CATEGORY.TWO_PAIR);
    expect(h.tiebreakers).toEqual([14, 13, 5]);
  });
  it("um par", () => {
    const h = evaluateHand(hand("Ac Ad Kc 9d 5h 3s 2c"));
    expect(h.category).toBe(CATEGORY.PAIR);
    expect(h.tiebreakers).toEqual([14, 13, 9, 5]);
  });
  it("carta alta", () => {
    const h = evaluateHand(hand("Ac Kd 9h 7s 5c 3d 2h"));
    expect(h.category).toBe(CATEGORY.HIGH_CARD);
    expect(h.tiebreakers).toEqual([14, 13, 9, 7, 5]);
  });
});

describe("compareHands / showdown", () => {
  it("trinca bate dois pares", () => {
    const trips = evaluateHand(hand("8c 8d 8h Ac Kd 2s 3h"));
    const twoPair = evaluateHand(hand("Ac Ad 6c 6d 8s 3c 2d"));
    expect(compareHands(trips, twoPair)).toBe(1);
  });
  it("straight bate trinca", () => {
    const straight = evaluateHand(hand("4c 5d 6h 7s 8c 2d 3h"));
    const trips = evaluateHand(hand("8c 8d 8h Ac Kd 2s 9h"));
    expect(compareHands(straight, trips)).toBe(1);
  });
  it("chop: mesma melhor mao de 5 (straight no bordo)", () => {
    // Bordo 5-6-7-8-9: ambos jogam o straight do bordo.
    const board = "5c 6d 7h 8s 9c";
    const heroSeven = hand(`2d 2h ${board}`);
    const villSeven = hand(`3c 3d ${board}`);
    expect(showdown(heroSeven, villSeven)).toBe(0.5);
  });
  it("kicker decide flush", () => {
    const board = "Ah 9h 4h 2h 7c";
    const hero = hand(`Kh 3c ${board}`); // flush A K 9 4 2
    const vill = hand(`Qh 3d ${board}`); // flush A Q 9 4 2
    expect(showdown(hero, vill)).toBe(1);
  });
});
