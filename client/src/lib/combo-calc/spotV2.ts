// Ponte entre o modelo v1 (heroi = uma mao) e o v2 (heroi = range).
// ADR-246 D-F1-9.
//
// Mao unica e o caso de UMA entry `specific` com frequencia 1 — sem caminho de
// codigo separado. Um ramo dedicado a mao unica seria o ramo que 90% do uso
// exercita e por onde 100% dos bugs de range escapariam.
import type { Card, RangeEntry, Spot } from "./types";
import { comboKey } from "./cards";
import { parseNotation } from "./combos";
import type { SpotV2 } from "./engine/types";

/** A mao do heroi como range: uma entry `specific`, frequencia 1. */
export function heroRangeFromHand(hero: [Card, Card]): RangeEntry[] {
  // `comboKey` ja canoniza a ordem (rank desc, depois naipe), entao trocar as
  // cartas de lugar na entrada nao muda a notacao gerada.
  return [{ notation: comboKey(hero[0], hero[1]), kind: "specific", frequency: 1 }];
}

/**
 * Desfaz `heroRangeFromHand` quando o range e mesmo uma mao so. Devolve `null`
 * em qualquer outro caso — inclusive frequencia diferente de 1, que ja e um
 * range de uma mao com peso, nao "a minha mao".
 */
export function singleHeroHand(heroRange: RangeEntry[]): [Card, Card] | null {
  if (heroRange.length !== 1) return null;
  const entry = heroRange[0];
  if (entry.frequency !== 1) return null;
  const parsed = parseNotation(entry.notation);
  if (!parsed || parsed.kind !== "specific" || !parsed.cards) return null;
  return [parsed.cards[0], parsed.cards[1]];
}

/**
 * Converte um `Spot` v1 no modelo v2 sem mutar a origem. O campo `hero` deixa de
 * existir de proposito: enquanto ele estiver la, alguem vai ler dele em vez do
 * `heroRange` e os dois vao divergir.
 */
export function spotV2FromLegacy(spot: Spot): SpotV2 {
  return {
    board: [...spot.board],
    heroRange: heroRangeFromHand(spot.hero),
    villainRange: spot.villainRange.map((e) => ({ ...e })),
    potCurrent: spot.potCurrent,
    callAmount: spot.callAmount,
  };
}
