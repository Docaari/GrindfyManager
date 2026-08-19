// Avaliador de mao de 7 cartas sem alocacao por chamada (F1 / RF-01.1, ADR-246
// D-F1-1 e D-F1-2). Devolve UM inteiro comparavel por mao; comparar maos vira
// comparar inteiro.
//
// Este arquivo NAO substitui `evaluator.ts`. Aquele continua sendo o oraculo de
// teste (decisao D4 do Range Lab) e o motor do popup. Os dois tem que produzir a
// mesma ORDEM — ha teste de paridade com semente fixa cobrando isso.
//
// CONTRATO DE REENTRANCIA (ADR-249 D-F3-28) — leia antes de chamar daqui de fora.
//
// `loadBoard` guarda o bordo em ESTADO DE MODULO. Quem chama `evalWithBoard` tem
// de chamar `loadBoard` no MESMO bloco sincrono: sem `await`, sem `setTimeout` e
// sem ceder a thread no meio. Cedendo, outro cliente carrega o bordo dele e o seu
// lote passa a medir maos contra um bordo que nao e o seu — e o sintoma e um
// numero errado, nao um erro.
//
// Sao dois clientes hoje: `engine/run.ts` (que ja obedecia, e por isso o contrato
// nao existia escrito) e `blockers.ts` (F3b). Codigo novo que precise ceder a
// thread vai para o worker, e ai e mudanca de protocolo, nao de detalhe.
//
// Empacotamento do score:
//   score = (categoria << 20) | (r1 << 16) | (r2 << 12) | (r3 << 8) | (r4 << 4) | r5
// com `r` em INDICE de rank (0 = 2, 12 = A) e desempate ausente valendo 0. As 9
// categorias tem a mesma ordem de `CATEGORY` em `evaluator.ts`.
import type { Card, Rank, Suit } from "./types";
import { SUITS } from "./cards";

/** Maior categoria possivel (straight flush). Vale como teto do `handCategory`. */
export const CATEGORY_MAX = 8;

/** code = (rank - 2) * 4 + indice do naipe em SUITS. Faixa 0..51. */
export function encodeCard(c: Card): number {
  return (c.rank - 2) * 4 + SUITS.indexOf(c.suit);
}

export function decodeCard(code: number): Card {
  return { rank: ((code >> 2) + 2) as Rank, suit: SUITS[code & 3] as Suit };
}

/** Categoria de um score (0 = carta alta .. 8 = straight flush). */
export function handCategory(score: number): number {
  return score >>> 20;
}

/**
 * Indice do rank alto do straight presente numa bitmask de 13 ranks, ou 0 se nao
 * houver. 8192 posicoes = todas as mascaras possiveis (emenda A1).
 *
 * A roda (A5432) entra como mask 4111 e devolve 3 — o topo e o 5, nao o A. Como
 * 3 e o menor topo possivel de um straight, 0 sobra como sentinela de "nao ha".
 */
export const STRAIGHT_TOP: Uint8Array = buildStraightTop();

function buildStraightTop(): Uint8Array {
  const table = new Uint8Array(8192);
  const WHEEL = 4111; // bits 12,3,2,1,0 = A,5,4,3,2
  for (let mask = 0; mask < 8192; mask++) {
    let top = 0;
    for (let t = 12; t >= 4; t--) {
      const need = 0b11111 << (t - 4);
      if ((mask & need) === need) {
        top = t;
        break;
      }
    }
    if (top === 0 && (mask & WHEEL) === WHEEL) top = 3;
    table[mask] = top;
  }
  return table;
}

/** Indice do bit mais alto setado. `Math.clz32` e instrucao de CPU, nao laco. */
function highestBit(x: number): number {
  return 31 - Math.clz32(x);
}

// ── contexto de bordo (D-F1-2: board hoisting) ───────────────
// O bordo e o mesmo para milhares de maos seguidas dentro de um runout. Manter a
// contagem por rank e por naipe do bordo pre-computada no modulo evita refazer
// 5/7 do trabalho por avaliacao. Estado de modulo e deliberado: e o que elimina a
// alocacao por chamada, e o motor e single-threaded (main thread ou worker).
let boardM1 = 0; // ranks vistos >= 1 vez
let boardM2 = 0; // >= 2
let boardM3 = 0; // >= 3
let boardM4 = 0; // 4
let boardS0 = 0;
let boardS1 = 0;
let boardS2 = 0;
let boardS3 = 0;
let boardN0 = 0;
let boardN1 = 0;
let boardN2 = 0;
let boardN3 = 0;

/** Carrega as 5 cartas do bordo no contexto do modulo. */
export function loadBoard(a: number, b: number, c: number, d: number, e: number): void {
  boardM1 = boardM2 = boardM3 = boardM4 = 0;
  boardS0 = boardS1 = boardS2 = boardS3 = 0;
  boardN0 = boardN1 = boardN2 = boardN3 = 0;
  for (let i = 0; i < 5; i++) {
    const code = i === 0 ? a : i === 1 ? b : i === 2 ? c : i === 3 ? d : e;
    const rank = code >> 2;
    const suit = code & 3;
    const bit = 1 << rank;
    if (boardM3 & bit) boardM4 |= bit;
    else if (boardM2 & bit) boardM3 |= bit;
    else if (boardM1 & bit) boardM2 |= bit;
    else boardM1 |= bit;
    if (suit === 0) {
      boardS0 |= bit;
      boardN0++;
    } else if (suit === 1) {
      boardS1 |= bit;
      boardN1++;
    } else if (suit === 2) {
      boardS2 |= bit;
      boardN2++;
    } else {
      boardS3 |= bit;
      boardN3++;
    }
  }
}

/** Score das 5 cartas ja carregadas por `loadBoard` mais as 2 da mao. */
export function evalWithBoard(holeA: number, holeB: number): number {
  let m1 = boardM1;
  let m2 = boardM2;
  let m3 = boardM3;
  let m4 = boardM4;
  let s0 = boardS0;
  let s1 = boardS1;
  let s2 = boardS2;
  let s3 = boardS3;
  let n0 = boardN0;
  let n1 = boardN1;
  let n2 = boardN2;
  let n3 = boardN3;

  let rank = holeA >> 2;
  let suit = holeA & 3;
  let bit = 1 << rank;
  if (m3 & bit) m4 |= bit;
  else if (m2 & bit) m3 |= bit;
  else if (m1 & bit) m2 |= bit;
  else m1 |= bit;
  if (suit === 0) {
    s0 |= bit;
    n0++;
  } else if (suit === 1) {
    s1 |= bit;
    n1++;
  } else if (suit === 2) {
    s2 |= bit;
    n2++;
  } else {
    s3 |= bit;
    n3++;
  }

  rank = holeB >> 2;
  suit = holeB & 3;
  bit = 1 << rank;
  if (m3 & bit) m4 |= bit;
  else if (m2 & bit) m3 |= bit;
  else if (m1 & bit) m2 |= bit;
  else m1 |= bit;
  if (suit === 0) {
    s0 |= bit;
    n0++;
  } else if (suit === 1) {
    s1 |= bit;
    n1++;
  } else if (suit === 2) {
    s2 |= bit;
    n2++;
  } else {
    s3 |= bit;
    n3++;
  }

  // Naipe com 5+ cartas: no maximo um existe em 7 cartas.
  let flushMask = 0;
  if (n0 >= 5) flushMask = s0;
  else if (n1 >= 5) flushMask = s1;
  else if (n2 >= 5) flushMask = s2;
  else if (n3 >= 5) flushMask = s3;

  // Straight flush: a MESMA tabela aplicada a mask do naipe.
  if (flushMask !== 0) {
    const sf = STRAIGHT_TOP[flushMask];
    if (sf !== 0) return (8 << 20) | (sf << 16);
  }

  if (m4 !== 0) {
    const quad = highestBit(m4);
    const kicker = highestBit(m1 & ~(1 << quad));
    return (7 << 20) | (quad << 16) | (kicker << 12);
  }

  if (m3 !== 0) {
    const trip = highestBit(m3);
    // ARMADILHA MEDIDA: `m2` contem o proprio rank da trinca (3 cartas setam m1,
    // m2 E m3). A forma ingenua `(m3 & ~bit) | m2` faz TODA trinca pura virar
    // full house com par igual ao rank da trinca. Tirar o bit dos dois e o
    // conserto; ha teste fixando isso.
    const rest = (m3 | m2) & ~(1 << trip);
    if (rest !== 0) return (6 << 20) | (trip << 16) | (highestBit(rest) << 12);
  }

  if (flushMask !== 0) {
    let x = flushMask;
    let score = 5 << 20;
    let shift = 16;
    for (let i = 0; i < 5; i++) {
      const b = highestBit(x);
      score |= b << shift;
      x &= ~(1 << b);
      shift -= 4;
    }
    return score;
  }

  const straight = STRAIGHT_TOP[m1];
  if (straight !== 0) return (4 << 20) | (straight << 16);

  if (m3 !== 0) {
    const trip = highestBit(m3);
    let x = m1 & ~(1 << trip);
    const k1 = highestBit(x);
    x &= ~(1 << k1);
    const k2 = highestBit(x);
    return (3 << 20) | (trip << 16) | (k1 << 12) | (k2 << 8);
  }

  if (m2 !== 0) {
    const pair1 = highestBit(m2);
    const others = m2 & ~(1 << pair1);
    if (others !== 0) {
      const pair2 = highestBit(others);
      const kicker = highestBit(m1 & ~(1 << pair1) & ~(1 << pair2));
      return (2 << 20) | (pair1 << 16) | (pair2 << 12) | (kicker << 8);
    }
    let x = m1 & ~(1 << pair1);
    const k1 = highestBit(x);
    x &= ~(1 << k1);
    const k2 = highestBit(x);
    x &= ~(1 << k2);
    const k3 = highestBit(x);
    return (1 << 20) | (pair1 << 16) | (k1 << 12) | (k2 << 8) | (k3 << 4);
  }

  let x = m1;
  let score = 0;
  let shift = 16;
  for (let i = 0; i < 5; i++) {
    const b = highestBit(x);
    score |= b << shift;
    x &= ~(1 << b);
    shift -= 4;
  }
  return score;
}

/**
 * Avalia 7 cartas de uma vez. Equivale a `loadBoard(...)` seguido de
 * `evalWithBoard(...)` — e o teste cobra a equivalencia, porque o motor usa a
 * forma iceada e o resto do codigo usa esta.
 */
export function evaluate7(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
): number {
  loadBoard(a, b, c, d, e);
  return evalWithBoard(f, g);
}
