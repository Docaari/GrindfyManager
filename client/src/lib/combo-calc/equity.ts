import type { Card } from "./types";
import { cardKey, fullDeck } from "./cards";
import { showdown } from "./evaluator";

/**
 * Equity do heroi vs UM combo do vilao.
 *  - river (board.length === 5): deterministico -> 1 / 0 / 0.5.
 *  - turn  (board.length === 4): media sobre os 44 rivers possiveis.
 *  - flop  (board.length === 3): media sobre C(restantes,2) runouts.
 * Pressupoe que combo NAO compartilha cartas com board/hero (combos ja filtram dead).
 */
export function comboEquity(
  hero: [Card, Card],
  villain: [Card, Card],
  board: Card[],
): number {
  if (board.length === 5) {
    return showdown([...hero, ...board], [...villain, ...board]);
  }

  // Cartas vivas para o runout.
  const used = new Set<string>();
  for (const c of [...hero, ...villain, ...board]) used.add(cardKey(c));
  const remaining = fullDeck().filter((c) => !used.has(cardKey(c)));

  let sum = 0;
  let n = 0;

  if (board.length === 4) {
    for (const river of remaining) {
      sum += showdown(
        [...hero, ...board, river],
        [...villain, ...board, river],
      );
      n++;
    }
  } else if (board.length === 3) {
    for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        const b = [...board, remaining[i], remaining[j]];
        sum += showdown([...hero, ...b], [...villain, ...b]);
        n++;
      }
    }
  } else {
    return 0; // bordo invalido para esta ferramenta
  }

  return n > 0 ? sum / n : 0;
}

export function streetFromBoard(boardLen: number): "river" | "turn" | "flop" {
  if (boardLen >= 5) return "river";
  if (boardLen === 4) return "turn";
  return "flop";
}

// ── Cache de equity ──────────────────────────────────────────
// A equity de um combo independe da frequencia. Em drags de slider (freq muda,
// board/hero/combo iguais) recalcular enumeracao de turn/flop e caro. Memoizamos
// por (board|hero|combo). Cap simples para nao crescer sem limite.
const _equityCache = new Map<string, number>();
const _CACHE_CAP = 50_000;

function ctxKey(hero: [Card, Card], villain: [Card, Card], board: Card[]): string {
  const h = [cardKey(hero[0]), cardKey(hero[1])].sort().join("");
  const v = [cardKey(villain[0]), cardKey(villain[1])].sort().join("");
  const b = board.map(cardKey).sort().join(""); // ordena -> melhor hit-rate
  return `${b}|${h}|${v}`;
}

/** Versao memoizada de comboEquity (mesma semantica). */
export function comboEquityCached(
  hero: [Card, Card],
  villain: [Card, Card],
  board: Card[],
): number {
  const key = ctxKey(hero, villain, board);
  const hit = _equityCache.get(key);
  if (hit !== undefined) return hit;
  const val = comboEquity(hero, villain, board);
  if (_equityCache.size >= _CACHE_CAP) _equityCache.clear();
  _equityCache.set(key, val);
  return val;
}

export function clearEquityCache(): void {
  _equityCache.clear();
}
