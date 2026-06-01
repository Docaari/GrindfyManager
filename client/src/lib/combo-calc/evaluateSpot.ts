import type { Card, ComboResult, Spot, Verdict } from "./types";
import { cardKey, comboKey } from "./cards";
import {
  clampFreq,
  comboFrequency,
  enumerateCombos,
  parseNotation,
} from "./combos";
import { comboEquityCached, streetFromBoard } from "./equity";
import { computeEv } from "./ev";

export class DuplicateCardError extends Error {
  constructor(public card: string) {
    super(`Carta duplicada: ${card} aparece mais de uma vez no bordo/heroi.`);
    this.name = "DuplicateCardError";
  }
}

/** Conjunto de cartas mortas (bordo ∪ heroi). Lanca se houver duplicata. */
export function deadCards(board: Card[], hero: [Card, Card]): Set<string> {
  const dead = new Set<string>();
  for (const c of [...board, ...hero]) {
    const k = cardKey(c);
    if (dead.has(k)) throw new DuplicateCardError(k);
    dead.add(k);
  }
  return dead;
}

/** Conta combos disponiveis de uma notacao (card removal aplicado). */
export function countCombos(notation: string, dead: Set<string>): number {
  const parsed = parseNotation(notation);
  if (!parsed) return 0;
  return enumerateCombos(parsed, dead).length;
}

export interface WeightedCombo {
  combo: [Card, Card];
  weight: number;
  entryNotation: string;
}

/** Expande o range em combos concretos ponderados; registra classes que zeraram. */
export function expandRange(
  spot: Spot,
  dead: Set<string>,
): { combos: WeightedCombo[]; emptyEntries: string[] } {
  const combos: WeightedCombo[] = [];
  const emptyEntries: string[] = [];

  for (const entry of spot.villainRange) {
    const parsed = parseNotation(entry.notation);
    if (!parsed) {
      emptyEntries.push(entry.notation);
      continue;
    }
    let concrete = enumerateCombos(parsed, dead);
    // Filtro de naipe: restringe aos combos escolhidos (interseccao com disponiveis).
    if (entry.suits && entry.suits.length > 0) {
      const allowed = new Set(entry.suits);
      concrete = concrete.filter((c) => allowed.has(comboKey(c[0], c[1])));
    }
    if (concrete.length === 0) {
      emptyEntries.push(entry.notation);
      continue;
    }
    for (const combo of concrete) {
      const w = comboFrequency(entry, combo);
      if (w <= 0) continue; // frequencia 0 -> ignora
      combos.push({ combo, weight: w, entryNotation: entry.notation });
    }
  }

  return { combos, emptyEntries };
}

/** Pipeline completo: range -> equity por combo -> W/L/C -> veredito. */
export function evaluateSpot(spot: Spot): Verdict {
  const dead = deadCards(spot.board, spot.hero);
  const street = streetFromBoard(spot.board.length);
  const { combos, emptyEntries } = expandRange(spot, dead);

  // Buckets discretos (para exibicao): no river sao exatos (eq ∈ {0,0.5,1}).
  let W = 0;
  let L = 0;
  let C = 0;
  // Massas efetivas (para EV em qualquer street): chops contam meia vitoria.
  let wEff = 0;
  let lEff = 0;
  const perCombo: ComboResult[] = [];

  for (const { combo, weight } of combos) {
    const eq = comboEquityCached(spot.hero, combo, spot.board);
    wEff += weight * eq;
    lEff += weight * (1 - eq);
    let outcome: ComboResult["outcome"];
    if (eq > 0.5) outcome = "win";
    else if (eq < 0.5) outcome = "lose";
    else outcome = "chop";
    if (outcome === "win") W += weight;
    else if (outcome === "lose") L += weight;
    else C += weight;
    perCombo.push({ combo, weight, outcome, equity: eq });
  }

  // River: usa buckets discretos (formula C-aware exata da spec).
  // Turn/flop: usa massas efetivas (wEff/lEff, C dobrado dentro).
  const ev = computeEv(
    street === "river"
      ? { W, L, C, potCurrent: spot.potCurrent, callAmount: spot.callAmount }
      : { W: wEff, L: lEff, C: 0, potCurrent: spot.potCurrent, callAmount: spot.callAmount },
  );

  return {
    heroEquity: ev.heroEquity,
    requiredEquity: ev.requiredEquity,
    evCall: ev.evCall,
    decision: ev.decision,
    W,
    L,
    C,
    totalCombos: W + L + C,
    equityGap: ev.equityGap,
    evDeficit: ev.evDeficit,
    winningCombosNeeded: ev.winningCombosNeeded,
    breakevenFrequency: ev.breakevenFrequency,
    perCombo,
    emptyEntries,
    street,
  };
}

/**
 * Sensibilidade: recalcula a equity do heroi aplicando um multiplicador global
 * `k` (0..~) sobre a frequencia dos combos que casam com `subset`. Usado pelo
 * slider pedagogico (A9). Por padrao escala os combos que o heroi GANHA
 * (blefes/maos piores do vilao).
 */
export function heroEquityAtMultiplier(
  spot: Spot,
  k: number,
  subset: (r: ComboResult) => boolean = (r) => r.outcome === "win",
): number {
  const verdict = evaluateSpot(spot);
  let W = 0;
  let L = 0;
  let C = 0;
  for (const r of verdict.perCombo) {
    const scale = subset(r) ? Math.max(0, k) : 1;
    const w = r.weight * scale;
    if (r.outcome === "win") W += w * r.equity;
    else if (r.outcome === "lose") L += w * (1 - r.equity);
    else C += w;
  }
  const total = W + L + C;
  return total > 0 ? (W + 0.5 * C) / total : 0;
}
