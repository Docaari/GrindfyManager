// Fixtures compartilhadas da frente F1 do Range Lab (Docs/specs/range-lab/F1-motor.md).
// NAO e um arquivo de teste (sem `.test.ts`) — o glob do vitest nao o coleta.
//
// ADR: Docs/architecture/decisions/246-range-lab-f1-motor.md
//
// Contratos que estas fixtures assumem (o implementer cria exatamente isto):
//
//   EngineRequest {
//     spot: SpotV2;
//     mode: EngineMode;          // 'exact' | 'monte_carlo'
//     seed?: number;             // default DEFAULT_SEED; ignorado no exato
//     samples?: number;          // orcamento de amostras do Monte Carlo
//   }
//
//   SpotV2 {
//     board: Card[];             // 3..5
//     heroRange: RangeEntry[];   // mao unica = UMA entry `specific` freq 1 (D-F1-9)
//     villainRange: RangeEntry[];
//     potCurrent: number;
//     callAmount: number;
//   }
//
// NOTA DELIBERADA: este arquivo importa SO modulos que ja existem (cards, combos,
// types, f0-fixtures). Assim ele carrega na red phase e a falha de cada teste
// aponta para o modulo novo que falta, nao para a fixture.
import { parseCard, comboKey } from "@/lib/combo-calc/cards";
import { expandRangeToken, parseNotation } from "@/lib/combo-calc/combos";
import type { Card, RangeEntry, Spot } from "@/lib/combo-calc/types";
import { FLOP_SPOT, TURN_SPOT, RIVER_SPOT } from "./f0-fixtures";

// ── helpers ──────────────────────────────────────────────────

export function cards(s: string): Card[] {
  return s.split(/\s+/).map((raw) => {
    const c = parseCard(raw);
    if (!c) throw new Error(`Carta invalida na fixture da F1: "${raw}"`);
    return c;
  });
}

export function card(s: string): Card {
  const c = parseCard(s);
  if (!c) throw new Error(`Carta invalida na fixture da F1: "${s}"`);
  return c;
}

/**
 * Entry de range com `kind` DERIVADO da notacao (nao chutado). Lanca em notacao
 * invalida — fixture torta some em silencio e vira teste que passa por engano.
 */
export function rangeEntry(notation: string, frequency = 1): RangeEntry {
  const parsed = parseNotation(notation);
  if (!parsed) throw new Error(`Notacao invalida na fixture da F1: "${notation}"`);
  return { notation, kind: parsed.kind, frequency };
}

/** Notacao canonica de um combo concreto ("As" + "6s" -> "As6s"). */
export function comboNotation(a: string, b: string): string {
  return comboKey(card(a), card(b));
}

/** Combo concreto como entry `specific` (o formato de "minha mao" na v2). */
export function specificEntry(a: string, b: string, frequency = 1): RangeEntry {
  return rangeEntry(comboNotation(a, b), frequency);
}

/** Range do heroi para uma mao unica — UMA entry `specific` com frequencia 1. */
export function singleHandRange(a: string, b: string): RangeEntry[] {
  return [specificEntry(a, b, 1)];
}

/** Expande tokens de solver ("22+", "A2s+") em entries de frequencia 1, sem duplicata. */
export function rangeFromTokens(tokens: string[], frequency = 1): RangeEntry[] {
  const seen = new Set<string>();
  const out: RangeEntry[] = [];
  for (const token of tokens) {
    for (const notation of expandRangeToken(token)) {
      if (seen.has(notation)) continue;
      seen.add(notation);
      out.push(rangeEntry(notation, frequency));
    }
  }
  if (out.length === 0) throw new Error(`Tokens nao expandiram nada: ${tokens.join(", ")}`);
  return out;
}

// ── modelo v2 (estrutural — evita importar o modulo que ainda nao existe) ──

export interface SpotV2Like {
  board: Card[];
  heroRange: RangeEntry[];
  villainRange: RangeEntry[];
  potCurrent: number;
  callAmount: number;
}

/** Spots v1 do baseline da F0 — o oraculo de regressao do criterio de aceite 3. */
export const LEGACY_FLOP: Spot = FLOP_SPOT;
export const LEGACY_TURN: Spot = TURN_SPOT;
export const LEGACY_RIVER: Spot = RIVER_SPOT;

/**
 * Traducao manual do spot legado para v2. Deliberadamente NAO usa
 * `spotV2FromLegacy` — o teste que valida aquela funcao nao pode depender dela.
 */
function v2FromLegacyByHand(spot: Spot): SpotV2Like {
  return {
    board: spot.board,
    heroRange: [
      rangeEntry(comboKey(spot.hero[0], spot.hero[1]), 1),
    ],
    villainRange: spot.villainRange.map((e) => rangeEntry(e.notation, e.frequency)),
    potCurrent: spot.potCurrent,
    callAmount: spot.callAmount,
  };
}

/**
 * Cenario medido do ADR: flop `Ad 8h 4h`, heroi `As 6s`, range `A7s, 76s, KK`
 * (11 combos do vilao). Equity do motor atual = 72,584940312% — verificada
 * contra `evaluateSpot` em 2026-08-16, antes de escrever este arquivo.
 */
export const V2_FLOP: SpotV2Like = v2FromLegacyByHand(LEGACY_FLOP);
export const V2_TURN: SpotV2Like = v2FromLegacyByHand(LEGACY_TURN);
export const V2_RIVER: SpotV2Like = v2FromLegacyByHand(LEGACY_RIVER);

/** Equity medida do V2_FLOP / LEGACY_FLOP (fracao 0..1). Fonte: evaluateSpot. */
export const FLOP_HERO_EQUITY = 0.725849403122;

/** Mesmo flop com pote/call que viram a decisao para `fold` (alpha 0,909). */
export const LEGACY_FLOP_FOLD: Spot = {
  ...LEGACY_FLOP,
  potCurrent: 10,
  callAmount: 100,
};
export const V2_FLOP_FOLD: SpotV2Like = v2FromLegacyByHand(LEGACY_FLOP_FOLD);

// ── caso de aceite de performance (criterio 2) ───────────────

/**
 * Range do vilao do caso medido: 236 combos VALIDOS contra o heroi `As 6s` no
 * flop `Ad 8h 4h`. Contagem conferida com `expandRange` (codigo da F0) antes de
 * escrever o teste — 236 pares validos x 990 runouts = 233.640 showdowns.
 */
export const PERF_VILLAIN_TOKENS = [
  "22+", "A2s+", "K9s+", "QTs+", "JTs", "T9s", "98s", "87s", "76s",
  "AKo", "AQo", "AJo", "ATo", "A9o",
  "KQo", "KJo", "KTo", "QJo", "QTo", "JTo",
  "65s", "32s",
];

export const V2_PERF_FLOP: SpotV2Like = {
  board: cards("Ad 8h 4h"),
  heroRange: singleHandRange("As", "6s"),
  villainRange: rangeFromTokens(PERF_VILLAIN_TOKENS),
  potCurrent: 36.1,
  callAmount: 13.8,
};

export const PERF_VALID_PAIRS = 236;
export const PERF_RUNOUTS_PER_PAIR = 990;
export const PERF_TOTAL_SHOWDOWNS = PERF_VALID_PAIRS * PERF_RUNOUTS_PER_PAIR; // 233.640

/**
 * Spot deliberadamente ACIMA do orcamento exato (4M showdowns): range vs range no
 * flop. Serve ao teste "o motor nunca troca de modo sozinho".
 *
 * Medido com o codigo da F0 antes de escrever o teste: 69 combos do heroi, 83 do
 * vilao, 5.276 pares validos x 990 runouts = 5.223.240 showdowns (30% acima do
 * `EXACT_LIMIT`). O trabalho real e barato — 990 x 152 avaliacoes mais 5,2 M
 * comparacoes de inteiro (D-F1-3).
 */
export const V2_ABOVE_BUDGET_FLOP: SpotV2Like = {
  board: cards("Ad 8h 4h"),
  heroRange: rangeFromTokens(["22+"]),
  villainRange: rangeFromTokens([
    "A2s+", "K9s+", "QTs+", "JTs", "T9s", "98s", "87s", "76s", "65s", "54s",
  ]),
  potCurrent: 36.1,
  callAmount: 13.8,
};

/** Medido: showdowns do `V2_ABOVE_BUDGET_FLOP` no modo exato. */
export const ABOVE_BUDGET_SHOWDOWNS = 5_276 * 990; // 5.223.240

// ── card removal mutuo (D-F1-4) ──────────────────────────────

/**
 * Heroi com dois combos de mesma frequencia e massas de par MUITO diferentes:
 * `KsQs` bloqueia Ks (3 dos 6 combos de KK sobram); `2c2d` nao bloqueia nada
 * (6 sobram). E o par que denuncia produto simples de pesos.
 */
export const V2_BLOCKER_ASYMMETRY: SpotV2Like = {
  board: cards("Ad 8h 4h"),
  heroRange: [specificEntry("Ks", "Qs", 1), specificEntry("2c", "2d", 1)],
  villainRange: [rangeEntry("KK", 1)],
  potCurrent: 36.1,
  callAmount: 13.8,
};

/** Heroi cujo primeiro combo bloqueia o range INTEIRO do vilao (pairMass 0). */
export const V2_HERO_COMBO_WITHOUT_OPPONENT: SpotV2Like = {
  board: cards("Ad 8h 4h"),
  heroRange: [specificEntry("Ks", "Qs", 1), specificEntry("2c", "2d", 1)],
  villainRange: [specificEntry("Ks", "Kh", 1)],
  potCurrent: 36.1,
  callAmount: 13.8,
};

/** Heroi vazio (nenhuma entry). */
export const V2_EMPTY_HERO: SpotV2Like = {
  ...V2_FLOP,
  heroRange: [],
};

/** Vilao vazio (nenhuma entry). */
export const V2_EMPTY_VILLAIN: SpotV2Like = {
  ...V2_FLOP,
  villainRange: [],
};

/** Dois ranges nao-vazios, zero pares validos — o unico combo de cada colide. */
export const V2_NO_VALID_PAIRS: SpotV2Like = {
  board: cards("Ad 8h 4h"),
  heroRange: [specificEntry("Ks", "Kh", 1)],
  villainRange: [specificEntry("Ks", "Kh", 1)],
  potCurrent: 36.1,
  callAmount: 13.8,
};

// ── util de mensagem de falha ────────────────────────────────

export function describeCards(list: Card[]): string {
  return list.map((c) => `${"23456789TJQKA"[c.rank - 2]}${c.suit}`).join(" ");
}
