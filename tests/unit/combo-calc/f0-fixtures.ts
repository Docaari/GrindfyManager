// Fixtures compartilhadas da frente F0 do Range Lab (Docs/specs/range-lab/F0-verdade.md).
// NAO e um arquivo de teste (sem `.test.ts`) — o glob do vitest nao o coleta.
import { parseCard } from "@/lib/combo-calc/cards";
import type { Card, RangeEntry, Spot } from "@/lib/combo-calc/types";

export function cards(s: string): Card[] {
  return s.split(/\s+/).map((c) => parseCard(c)!);
}

export function card(s: string): Card {
  return parseCard(s)!;
}

/** `kind` e ignorado por evaluateSpot (a notacao e re-parseada internamente). */
export function entry(notation: string, frequency: number): RangeEntry {
  return { notation, kind: "anytwo", frequency };
}

/**
 * Spot medido na spec da F0 (RF-00.1). Bordo de 4 cartas (turn), heroi As 6s,
 * range A7s + 76s + KK, pote 36.1 / call 13.8.
 *
 * Numeros medidos com o codigo de 2026-08-04:
 *   evaluateSpot(spot).heroEquity       = 77,3760%   (correto)
 *   heroEquityAtMultiplier(spot, k = 1) = 82,4462%   (errado — bug do RF-00.1)
 *   W = 9 (bucket discreto)   wNeeded = 0,951 (massa efetiva)  -> RF-00.5
 */
export const TURN_SPOT: Spot = {
  board: cards("Ad 8h 4h 2c"),
  hero: [card("As"), card("6s")],
  villainRange: [entry("A7s", 1), entry("76s", 1), entry("KK", 1)],
  potCurrent: 36.1,
  callAmount: 13.8,
};

/** Mesmo spot no flop (3 cartas). Medido: heroEquity 72,5849% vs k=1 83,4170%. */
export const FLOP_SPOT: Spot = { ...TURN_SPOT, board: cards("Ad 8h 4h") };

/** Mesmo spot no river (5 cartas). Medido: heroEquity == k=1 == 54,5455% (ja correto). */
export const RIVER_SPOT: Spot = { ...TURN_SPOT, board: cards("Ad 8h 4h 2c 5d") };

/** Range com uma unica classe em frequencia 0 — massa ponderada total zero. */
export const WEIGHTLESS_SPOT: Spot = {
  ...TURN_SPOT,
  villainRange: [entry("KK", 0)],
};

/** Range cujas classes somem inteiras por card removal (Ad no bordo, As no heroi). */
export const BLOCKED_SPOT: Spot = {
  ...TURN_SPOT,
  villainRange: [entry("AdAs", 1)],
};
