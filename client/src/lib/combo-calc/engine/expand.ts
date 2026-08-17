// Expansao de range em combos concretos com mascara de 52 bits (ADR-246 D-F1-4).
//
// Um combo ocupa 2 das 52 cartas. Guardar isso como dois inteiros de 32 bits faz
// o teste de "estes dois combos dividem carta?" virar duas operacoes de bit, e e
// esse teste que roda milhoes de vezes.
//
// Serve `cost.ts` e `run.ts` — os dois PRECISAM contar a mesma coisa, senao a
// barra de progresso mede um trabalho e o motor faz outro.
import type { Card, RangeEntry } from "../types";
import { cardKey } from "../cards";
import { clampFreq, comboFrequency, enumerateCombos, parseNotation } from "../combos";
import { comboKey } from "../cards";
import { encodeCard } from "../fastEvaluator";

export interface EngineCombo {
  combo: [Card, Card];
  codeA: number;
  codeB: number;
  /** Mascara das 2 cartas: bits 0..31 em `lo`, 32..51 em `hi`. */
  lo: number;
  hi: number;
  weight: number;
  entryNotation: string;
}

export interface ExpandedRange {
  combos: EngineCombo[];
  /** Classes que nao produziram nenhum combo com peso (aviso da UI). */
  emptyEntries: string[];
  /** Soma dos pesos. Zero significa range sem massa — nao "range com equity 0". */
  totalWeight: number;
}

/** Mascara de uma carta ja codificada, no par (lo, hi). */
export function cardMask(code: number): { lo: number; hi: number } {
  return code < 32 ? { lo: 1 << code, hi: 0 } : { lo: 0, hi: 1 << (code - 32) };
}

/** true quando os dois conjuntos de cartas compartilham ao menos uma carta. */
export function collides(
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
): boolean {
  return ((aLo & bLo) | (aHi & bHi)) !== 0;
}

/**
 * Expande um range em combos concretos, ja sem as cartas do bordo. O card removal
 * MUTUO (heroi contra vilao) NAO acontece aqui — ele e por par, e depende de qual
 * combo do heroi esta em jogo.
 */
export function expandRangeV2(
  entries: RangeEntry[],
  deadFromBoard: Set<string>,
): ExpandedRange {
  const combos: EngineCombo[] = [];
  const emptyEntries: string[] = [];
  const seen = new Set<string>();
  let totalWeight = 0;

  for (const entry of entries) {
    const parsed = parseNotation(entry.notation);
    if (!parsed) {
      emptyEntries.push(entry.notation);
      continue;
    }
    let concrete = enumerateCombos(parsed, deadFromBoard);
    if (entry.suits && entry.suits.length > 0) {
      const allowed = new Set(entry.suits);
      concrete = concrete.filter((c) => allowed.has(comboKey(c[0], c[1])));
    }
    if (concrete.length === 0) {
      emptyEntries.push(entry.notation);
      continue;
    }

    let added = 0;
    for (const combo of concrete) {
      const weight = clampFreq(comboFrequency(entry, combo));
      if (weight <= 0) continue;
      const key = comboKey(combo[0], combo[1]);
      // Duas classes podem enumerar o mesmo combo concreto (ex.: "AKs" e "AsKs").
      // Contar duas vezes inflaria a massa em silencio.
      if (seen.has(key)) continue;
      seen.add(key);

      const codeA = encodeCard(combo[0]);
      const codeB = encodeCard(combo[1]);
      const mA = cardMask(codeA);
      const mB = cardMask(codeB);
      combos.push({
        combo,
        codeA,
        codeB,
        lo: mA.lo | mB.lo,
        hi: mA.hi | mB.hi,
        weight,
        entryNotation: entry.notation,
      });
      totalWeight += weight;
      added++;
    }
    // Classe cujos combos existem mas todos com peso 0 tambem "zerou" para a tela.
    if (added === 0) emptyEntries.push(entry.notation);
  }

  return { combos, emptyEntries, totalWeight };
}

/** Cartas do bordo como chaves, para o `enumerateCombos` da v1. */
export function boardDeadSet(board: Card[]): Set<string> {
  const dead = new Set<string>();
  for (const c of board) dead.add(cardKey(c));
  return dead;
}
