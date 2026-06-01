import type { Card } from "./types";

// Categorias (maior = melhor).
export const CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
} as const;

export interface HandRank {
  category: number;
  /** Desempates em ordem de importancia (rank desc). */
  tiebreakers: number[];
}

/**
 * Melhor straight a partir de um conjunto de ranks. Trata a roda A-2-3-4-5
 * (A baixo). Retorna o rank ALTO do straight (5 na roda) ou 0 se nao houver.
 */
function bestStraightHigh(rankSet: Set<number>): number {
  for (let high = 14; high >= 5; high--) {
    if (
      rankSet.has(high) &&
      rankSet.has(high - 1) &&
      rankSet.has(high - 2) &&
      rankSet.has(high - 3) &&
      rankSet.has(high - 4)
    ) {
      return high;
    }
  }
  // Roda: A,2,3,4,5 -> straight alto 5.
  if (
    rankSet.has(14) &&
    rankSet.has(2) &&
    rankSet.has(3) &&
    rankSet.has(4) &&
    rankSet.has(5)
  ) {
    return 5;
  }
  return 0;
}

/** Avalia a melhor mao de 5 cartas entre 5..7 cartas. */
export function evaluateHand(cards: Card[]): HandRank {
  const rankCount = new Map<number, number>();
  const suitCards = new Map<string, number[]>(); // suit -> ranks
  for (const c of cards) {
    rankCount.set(c.rank, (rankCount.get(c.rank) ?? 0) + 1);
    const arr = suitCards.get(c.suit);
    if (arr) arr.push(c.rank);
    else suitCards.set(c.suit, [c.rank]);
  }

  // Flush?
  let flushRanks: number[] | null = null;
  for (const ranks of suitCards.values()) {
    if (ranks.length >= 5) {
      flushRanks = [...ranks].sort((a, b) => b - a);
      break;
    }
  }

  // Straight flush (entre as cartas do naipe de flush).
  if (flushRanks) {
    const sfHigh = bestStraightHigh(new Set(flushRanks));
    if (sfHigh > 0) {
      return { category: CATEGORY.STRAIGHT_FLUSH, tiebreakers: [sfHigh] };
    }
  }

  // Agrupa ranks por contagem.
  const byCount: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const [rank, count] of rankCount) byCount[count].push(rank);
  for (const k of [1, 2, 3, 4]) byCount[k].sort((a, b) => b - a);

  const quads = byCount[4];
  const trips = byCount[3];
  const pairs = byCount[2];

  // Quadra.
  if (quads.length > 0) {
    const quad = quads[0];
    const kicker = highestExcluding(rankCount, new Set([quad]), 1)[0] ?? 0;
    return { category: CATEGORY.QUADS, tiebreakers: [quad, kicker] };
  }

  // Full house: trinca + (par OU outra trinca).
  if (trips.length >= 1) {
    const topTrip = trips[0];
    // Candidato a par: segunda trinca (usada como par) ou maior par.
    const pairCandidates = [...trips.slice(1), ...pairs].sort((a, b) => b - a);
    if (pairCandidates.length > 0) {
      return {
        category: CATEGORY.FULL_HOUSE,
        tiebreakers: [topTrip, pairCandidates[0]],
      };
    }
  }

  // Flush.
  if (flushRanks) {
    return {
      category: CATEGORY.FLUSH,
      tiebreakers: flushRanks.slice(0, 5),
    };
  }

  // Straight.
  const allRanks = new Set<number>(rankCount.keys());
  const straightHigh = bestStraightHigh(allRanks);
  if (straightHigh > 0) {
    return { category: CATEGORY.STRAIGHT, tiebreakers: [straightHigh] };
  }

  // Trinca.
  if (trips.length >= 1) {
    const trip = trips[0];
    const kickers = highestExcluding(rankCount, new Set([trip]), 2);
    return { category: CATEGORY.TRIPS, tiebreakers: [trip, ...kickers] };
  }

  // Dois pares.
  if (pairs.length >= 2) {
    const [hi, lo] = pairs;
    const kicker =
      highestExcluding(rankCount, new Set([hi, lo]), 1)[0] ?? 0;
    return { category: CATEGORY.TWO_PAIR, tiebreakers: [hi, lo, kicker] };
  }

  // Um par.
  if (pairs.length === 1) {
    const pair = pairs[0];
    const kickers = highestExcluding(rankCount, new Set([pair]), 3);
    return { category: CATEGORY.PAIR, tiebreakers: [pair, ...kickers] };
  }

  // Carta alta.
  const highs = [...rankCount.keys()].sort((a, b) => b - a).slice(0, 5);
  return { category: CATEGORY.HIGH_CARD, tiebreakers: highs };
}

/** N ranks mais altos presentes, excluindo os ranks em `exclude`. */
function highestExcluding(
  rankCount: Map<number, number>,
  exclude: Set<number>,
  n: number,
): number[] {
  return [...rankCount.keys()]
    .filter((r) => !exclude.has(r))
    .sort((a, b) => b - a)
    .slice(0, n);
}

/** -1 se a<b, 0 empate, +1 se a>b. */
export function compareHands(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) return a.category > b.category ? 1 : -1;
  const len = Math.max(a.tiebreakers.length, b.tiebreakers.length);
  for (let i = 0; i < len; i++) {
    const x = a.tiebreakers[i] ?? 0;
    const y = b.tiebreakers[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/** Compara 7 cartas do heroi vs vilao. 1 = heroi ganha, 0 = perde, 0.5 = chop. */
export function showdown(heroSeven: Card[], villainSeven: Card[]): 0 | 0.5 | 1 {
  const cmp = compareHands(evaluateHand(heroSeven), evaluateHand(villainSeven));
  return cmp > 0 ? 1 : cmp < 0 ? 0 : 0.5;
}
