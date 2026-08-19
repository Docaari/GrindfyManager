// Fixtures compartilhadas da sub-frente F3b do Range Lab.
// Spec  : Docs/specs/range-lab/F3b-decisao.md
// Porque: Docs/specs/range-lab/F3-detalhamento.md (achados F-1 a F-5)
// ADR   : Docs/architecture/decisions/249-range-lab-f3b-decisao.md
// Diagramas: Docs/architecture/diagrams/range-lab-f3b/
//
// NAO e arquivo de teste (sem `.test.ts`): o glob do vitest nao o coleta.
//
// NOTA DELIBERADA (mesma da F1 e da F3a): este arquivo importa SO modulos que JA
// EXISTEM (cards, combos, evaluator, engine/run, engine/expand, f1-fixtures).
// Assim ele carrega na red phase e a falha de cada teste aponta para o modulo
// novo que falta (`mdf.ts`, `confront.ts`, `cascade.ts`, `blockers.ts`), e nao
// para a fixture.
//
// ── CONTRATO que os testes da F3b assumem (o implementer cria exatamente isto) ──
//
//   client/src/lib/combo-calc/mdf.ts       — NAO importa ev.ts (D-F3-12/23)
//     export type MdfDegradedReason = "invalid_pot_before_bet";
//     export interface MdfOk {
//       status: "ok"; potBeforeBet: number; bet: number;
//       defenseAlpha: number;  // B / (P + B)
//       mdf: number;           // P / (P + B) = 1 - defenseAlpha
//     }
//     export interface MdfDegraded { status: "degraded"; reason: MdfDegradedReason }
//     export type MdfResult = MdfOk | MdfDegraded;
//     export function computeMdf(potCurrent: number, callAmount: number): MdfResult;
//
//     export type BluffBalanceVerdict = "bluffs_missing" | "balanced" | "bluffs_excess";
//     export type BluffBalanceDegradedReason = "no_value_mass";
//     export interface BluffBalanceOk {
//       status: "ok";
//       valueMass: number; bluffMass: number; chopMass: number; unknownMass: number;
//       bluffsNeeded: number;  // valueMass * B / P
//       bluffGap: number;      // bluffsNeeded - bluffMass; negativo = blefa demais
//       verdict: BluffBalanceVerdict;
//     }
//     export interface BluffBalanceDegraded { status: "degraded"; reason: BluffBalanceDegradedReason }
//     export type BluffBalance = BluffBalanceOk | BluffBalanceDegraded;
//     export function computeBluffBalance(
//       mdf: MdfOk,
//       masses: { value: number; bluff: number; chop: number; unknown: number },
//     ): BluffBalance;
//
//     export interface BluffcatcherRanking {
//       order: string[];                  // comboKeys, do melhor ao pior
//       rankByCombo: Map<string, number>; // 1-based
//       thresholdIndex: number;           // === EngineResultOk.callThresholdIndex
//       total: number;                    // combos COM numero, nao perHeroCombo.length
//     }
//     export function rankBluffcatchers(rows: readonly HeroComboResult[]): BluffcatcherRanking;
//
//   client/src/lib/combo-calc/confront.ts
//     export type ConfrontOutcome = "value" | "bluff" | "chop" | "unknown";
//     export type ConfrontBasis   = "discrete" | "effective";
//     export type ConfrontMethod  = "showdown_now" | "equity_vs_range";
//     export interface ConfrontBucket { combos: number; mass: number }
//     export interface ConfrontationSplit {
//       method: ConfrontMethod; basis: ConfrontBasis;
//       value: ConfrontBucket; bluff: ConfrontBucket;
//       chop: ConfrontBucket;  unknown: ConfrontBucket;
//       totalMass: number;
//     }
//     export function decisionBasis(
//       result: EngineResultOk, board: readonly Card[],
//     ): { basis: ConfrontBasis; heroCombos: number };
//     export function confrontNow(
//       hero: readonly [Card, Card], villain: readonly [Card, Card], board: readonly Card[],
//     ): Exclude<ConfrontOutcome, "unknown">;
//     export interface ConfrontRow { combo: [Card, Card]; weight: number; equity: number | null }
//     export function splitByConfrontation(input: {
//       hero: readonly [Card, Card] | null;
//       rows: readonly ConfrontRow[];
//       board: readonly Card[];
//       basis: ConfrontBasis;
//     }): ConfrontationSplit;
//
//   client/src/lib/combo-calc/cascade.ts
//     export type CascadeStepId =
//       | "nominal" | "declared" | "after_board_removal"
//       | "after_mutual_removal" | "loses_to_hero";
//     export type CascadeStepUnavailable = "no_result" | "engine_degraded";
//     export type CascadeStep =
//       | { id: CascadeStepId; status: "ok"; mass: number; combos: number | null;
//           basis: ConfrontBasis | null }
//       | { id: CascadeStepId; status: "unavailable"; reason: CascadeStepUnavailable };
//     export interface Cascade {
//       steps: CascadeStep[];        // sempre 5, sempre na ordem
//       basis: ConfrontBasis | null;
//       blockedMass: number | null;  // degrau 3 - degrau 4
//     }
//     export function buildCascade(input: {
//       villainRange: readonly RangeEntry[];
//       board: readonly Card[];
//       result: EngineResult | null;
//     }): Cascade;
//
//   client/src/lib/combo-calc/blockers.ts — SINCRONO de ponta a ponta (D-F3-28)
//     export type BlockerUnavailableReason = "no_result" | "engine_degraded" | "hero_is_range";
//     export type BlockerDeltaUnavailableReason =
//       | "monte_carlo_mode" | "not_requested" | "no_blocked_combos";
//     export type BlockerAvailability =
//       | { available: true; hero: [Card, Card] }
//       | { available: false; reason: BlockerUnavailableReason; heroCombos: number };
//     export function blockerAvailability(result: EngineResult | null): BlockerAvailability;
//     export interface BlockedCardReport { card: Card; removed: ConfrontationSplit }
//     export type BlockerDelta =
//       | { status: "ok"; equityReal: number; equityCounterfactual: number;
//           delta: number; runoutsEnumerated: number }
//       | { status: "unavailable"; reason: BlockerDeltaUnavailableReason };
//     export interface BlockerReport {
//       hero: [Card, Card];
//       perCard: [BlockedCardReport, BlockedCardReport];  // ETIQUETA, podem se sobrepor
//       blockedCombos: number;  // UNIAO
//       blockedMass: number;    // UNIAO
//       delta: BlockerDelta;
//     }
//     export function analyzeBlockers(input: {
//       result: EngineResultOk; board: readonly Card[]; computeDelta: boolean;
//     }): BlockerReport | { status: "unavailable"; reason: BlockerUnavailableReason };
import { cardKey, comboKey, fullDeck } from "@/lib/combo-calc/cards";
import { compareHands, evaluateHand } from "@/lib/combo-calc/evaluator";
import { runEngineToCompletion } from "@/lib/combo-calc/engine/run";
import { DEFAULT_SEED } from "@/lib/combo-calc/engine/random";
import type { EngineRequest, EngineResult } from "@/lib/combo-calc/engine/types";
import type { Card, RangeEntry } from "@/lib/combo-calc/types";
import {
  cards,
  card,
  rangeEntry,
  rangeFromTokens,
  singleHandRange,
  specificEntry,
  type SpotV2Like,
} from "./f1-fixtures";

export { cards, card, rangeEntry, rangeFromTokens, singleHandRange, specificEntry };
export type { SpotV2Like };

/** Mesmo epsilon do motor para separar "vivo" de "bloqueado". */
export const EPS = 1e-9;

export type EngineOk = Extract<EngineResult, { status: "ok" }>;

export function hole(a: string, b: string): [Card, Card] {
  return [card(a), card(b)];
}

/** Rotulo legivel para mensagem de falha ("As Kd"). */
export function label(list: readonly Card[]): string {
  return list.map((c) => `${"23456789TJQKA"[c.rank - 2]}${c.suit}`).join(" ");
}

export function exactRequest(spot: SpotV2Like): EngineRequest {
  return { spot: spot as EngineRequest["spot"], mode: "exact" };
}

export function mcRequest(spot: SpotV2Like, samples = 20_000): EngineRequest {
  return {
    spot: spot as EngineRequest["spot"],
    mode: "monte_carlo",
    seed: DEFAULT_SEED,
    samples,
  };
}

export function okResult(result: EngineResult, tag: string): EngineOk {
  if (result.status !== "ok") {
    throw new Error(`${tag}: esperava ok, veio degraded (${result.reason})`);
  }
  return result;
}

export function runExact(spot: SpotV2Like, tag = "spot"): EngineOk {
  return okResult(runEngineToCompletion(exactRequest(spot)), tag);
}

export function runMonteCarlo(spot: SpotV2Like, samples = 20_000, tag = "spot"): EngineOk {
  return okResult(runEngineToCompletion(mcRequest(spot, samples)), tag);
}

/** Combos do vilao que sobreviveram ao card removal mutuo. */
export function aliveVillainRows(result: EngineOk) {
  return result.perVillainCombo.filter((row) => row.pairMass > EPS);
}

/**
 * Combos do vilao que as cartas do heroi mataram. Eles APARECEM em
 * `perVillainCombo` com `pairMass: 0` e peso declarado intacto — e a Refutacao 1
 * do ADR, e o motivo de `blockers.ts` nao reenumerar nada.
 */
export function blockedVillainRows(result: EngineOk) {
  return result.perVillainCombo.filter((row) => row.pairMass <= EPS);
}

export function findVillainRow(result: EngineOk, combo: readonly [Card, Card]) {
  const wanted = comboKey(combo[0], combo[1]);
  const row = result.perVillainCombo.find((r) => comboKey(r.combo[0], r.combo[1]) === wanted);
  if (!row) throw new Error(`combo do vilao ${wanted} nao esta em perVillainCombo`);
  return row;
}

/** Massa total do heroi — o denominador do degrau 4 (Refutacao 2). */
export function heroTotalWeight(result: EngineOk): number {
  return result.perHeroCombo.reduce((acc, row) => acc + row.weight, 0);
}

// ── oraculo do showdown ficticio ─────────────────────────────

export interface FictitiousEquity {
  /** Equity do HEROI contra aquele combo, com chop valendo 0,5. */
  equity: number;
  /** Runouts validos DAQUELE par — o denominador proprio do combo. */
  runouts: number;
}

/**
 * Oraculo independente do contrafactual: enumera na unha os runouts validos do
 * par (baralho menos bordo menos as cartas do heroi menos as cartas do vilao que
 * nao sao compartilhadas) e mede a equity do heroi com `evaluateHand`.
 *
 * Escrito com o avaliador LENTO de proposito: o teste nao pode comparar a
 * implementacao consigo mesma. O par pode ser IMPOSSIVEL (heroi e vilao dividindo
 * carta) — cada mao de 5..7 continua legal em si, e comparar dois inteiros e
 * aritmetica bem definida (D-F3-27).
 */
export function heroEquityAgainstCombo(
  hero: readonly [Card, Card],
  villain: readonly [Card, Card],
  board: readonly Card[],
): FictitiousEquity {
  const dead = new Set<string>();
  for (const c of board) dead.add(cardKey(c));
  for (const c of hero) dead.add(cardKey(c));
  for (const c of villain) dead.add(cardKey(c));

  const missing = 5 - board.length;
  if (missing === 0) {
    const h = evaluateHand([...hero, ...board]);
    const v = evaluateHand([...villain, ...board]);
    const cmp = compareHands(h, v);
    return { equity: cmp > 0 ? 1 : cmp === 0 ? 0.5 : 0, runouts: 1 };
  }

  const deck = fullDeck().filter((c) => !dead.has(cardKey(c)));
  let num = 0;
  let runouts = 0;

  if (missing === 1) {
    for (const extra of deck) {
      const full = [...board, extra];
      const cmp = compareHands(evaluateHand([...hero, ...full]), evaluateHand([...villain, ...full]));
      num += cmp > 0 ? 1 : cmp === 0 ? 0.5 : 0;
      runouts++;
    }
    return { equity: num / runouts, runouts };
  }

  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const full = [...board, deck[i], deck[j]];
      const cmp = compareHands(evaluateHand([...hero, ...full]), evaluateHand([...villain, ...full]));
      num += cmp > 0 ? 1 : cmp === 0 ? 0.5 : 0;
      runouts++;
    }
  }
  return { equity: num / runouts, runouts };
}

// ── RIVER: o spot de referencia do bloqueador ────────────────
//
// Bordo `Ah 7d 2c Ks 9h`, heroi `As Kd` (dois pares, ases e reis).
//
// Range do vilao montado a mao para que TODOS os numeros sejam conferiveis sem
// rodar nada — cada combo existe por um motivo:
//   QhQd  vivo, perde para os dois pares          -> equity do vilao 0   (bluff)
//   7h7s  vivo, trinca de setes, ganha            -> equity do vilao 1   (value)
//   AdKh  vivo, os MESMOS dois pares              -> equity do vilao 0,5 (chop)
//   AsQs  BLOQUEADO pelo As do heroi              -> par de ases, perde
//   KdQd  BLOQUEADO pelo Kd do heroi              -> par de reis, perde
//   AsKd  BLOQUEADO pelas DUAS cartas             -> os mesmos dois pares, chop
//
// Conferido contra o motor real antes de escrever os testes (2026-08-18):
// heroRangeEquity = 0,5 exato; os tres bloqueados saem com `pairMass: 0`,
// `equity: null` e razao `no_valid_villain_combo`.
export const V3B_RIVER: SpotV2Like = {
  board: cards("Ah 7d 2c Ks 9h"),
  heroRange: singleHandRange("As", "Kd"),
  villainRange: [
    specificEntry("Qh", "Qd", 1),
    specificEntry("7h", "7s", 1),
    specificEntry("Ad", "Kh", 1),
    specificEntry("As", "Qs", 1),
    specificEntry("Kd", "Qd", 1),
    specificEntry("As", "Kd", 1),
  ],
  potCurrent: 30, // P = 20, B = 10 -> defenseAlpha 1/3, MDF 2/3 (o exemplo da spec)
  callAmount: 10,
};

export const RIVER_HERO: [Card, Card] = hole("As", "Kd");
export const RIVER_ALIVE_MASS = 3; // QhQd + 7h7s + AdKh, peso 1 cada
export const RIVER_BLOCKED_MASS = 3; // AsQs + KdQd + AsKd — a UNIAO
export const RIVER_BLOCKED_COMBOS = 3;
/** Cada carta do heroi mata 2 combos; a soma das colunas (4) passa da uniao (3). */
export const RIVER_PER_CARD_COMBOS = 2;
/** Equity real medida pelo motor: (1 + 0 + 0,5) / 3. */
export const RIVER_HERO_EQUITY = 0.5;

/** O mesmo spot com o heroi como RANGE — o caso da F-5 e da segunda condicao da D-F3-25. */
export const V3B_RIVER_HERO_RANGE: SpotV2Like = {
  ...V3B_RIVER,
  heroRange: [specificEntry("As", "Kd", 1), specificEntry("Qc", "Jc", 1)],
};

// ── FLOP: um vivo, um bloqueado — o denominador do par ficticio ──
//
// Bordo `Ah 7d 2c`, heroi `As Kd`, vilao `QhQd` (vivo) e `AsQs` (bloqueado pelo As).
//
// Com um combo vivo de peso 1 e um bloqueado de peso 1, o contrafactual e uma
// media de dois termos e a equity ficticia sai por algebra do proprio relatorio:
//   eqBloqueado = 2 * equityCounterfactual - equityReal
//
// Medido no motor real: equityReal = 0,9121212121212121 (990 runouts por par).
// O par FICTICIO tira 6 cartas do baralho (bordo 3 + heroi 2 + o Qs do vilao),
// nao 7 — logo tem C(46,2) = 1035 runouts, e a equity ficticia do heroi e
// 0,8724637681159421. Dividir por 990 daria 0,9121212121212121: um vies de 4,5
// pontos, silencioso e sistematico.
export const V3B_FLOP_ONE_BLOCKED: SpotV2Like = {
  board: cards("Ah 7d 2c"),
  heroRange: singleHandRange("As", "Kd"),
  villainRange: [specificEntry("Qh", "Qd", 1), specificEntry("As", "Qs", 1)],
  potCurrent: 30,
  callAmount: 10,
};

export const FLOP_HERO: [Card, Card] = hole("As", "Kd");
export const FLOP_ALIVE_COMBO: [Card, Card] = hole("Qh", "Qd");
export const FLOP_BLOCKED_COMBO: [Card, Card] = hole("As", "Qs");
/** Runouts do laco EXTERNO no flop: baralho menos bordo menos as 2 do heroi. */
export const FLOP_RUNOUTS_ENUMERATED = 1081; // C(47,2)
/** Runouts validos do par ficticio — o denominador POR COMBO. */
export const FICTITIOUS_PAIR_RUNOUTS = 1035; // C(46,2)
/** O denominador ERRADO: `runoutsPerPair` do motor no flop. */
export const ENGINE_RUNOUTS_PER_PAIR_FLOP = 990; // C(45,2)

/** Turn do mesmo spot: o laco externo cai para 46 runouts. */
export const V3B_TURN_ONE_BLOCKED: SpotV2Like = {
  ...V3B_FLOP_ONE_BLOCKED,
  board: cards("Ah 7d 2c 9h"),
};
export const TURN_RUNOUTS_ENUMERATED = 46;

// ── heroi que nao bloqueia NADA do range do vilao ────────────

/** `2c 2d` nao aparece em nenhum combo de `KK`: zero bloqueados, delta sem sentido. */
export const V3B_NO_BLOCKERS: SpotV2Like = {
  board: cards("Ah 7d 9s Ks 4c"),
  heroRange: singleHandRange("2c", "2d"),
  villainRange: [rangeEntry("KK", 1)],
  potCurrent: 30,
  callAmount: 10,
};

// ── cascata: o bordo comendo combo do range declarado ────────

/**
 * `AKs` tem 4 combos declarados; com o `As` no bordo sobram 3. E o degrau 2 > 3
 * que prova que os dois degraus nao sao a mesma conta.
 */
export const BOARD_EATS_COMBO_BOARD = cards("As 7d 2c");
export const BOARD_EATS_COMBO_RANGE: RangeEntry[] = [rangeEntry("AKs", 1)];
export const BOARD_EATS_DECLARED = 4;
export const BOARD_EATS_AFTER_BOARD = 3;

/**
 * Duas classes que enumeram o MESMO combo concreto. `expandRangeV2` deduplica por
 * `comboKey`; chamar `enumerateCombos` por fora reimplementaria o dedupe e
 * contaria 5 onde ha 4 (D-F3-26).
 */
export const OVERLAPPING_RANGE: RangeEntry[] = [rangeEntry("AKs", 1), rangeEntry("AsKs", 1)];
export const OVERLAPPING_DECLARED = 4;

// ── range LARGO de proposito, para o teto de tempo ───────────
//
// A confianca do ADR no custo do contrafactual e BAIXA, e a estimativa de "~30
// combos bloqueados" veio de um range de 15% feito a mao. Este range e
// deliberadamente desconfortavel: 97 classes, 565 combos, e o heroi `As 6s`
// mata 64 deles no flop `Ad 8h 4h` (contado no motor real em 2026-08-18).
export const WIDE_BLOCKER_TOKENS = [
  "22+",
  "A2s+",
  "K2s+",
  "Q2s+",
  "J2s+",
  "T6s+",
  "96s+",
  "86s+",
  "76s",
  "65s",
  "54s",
  "A2o+",
  "K5o+",
  "Q8o+",
  "J8o+",
  "T8o+",
  "98o",
];

export const V3B_WIDE_FLOP: SpotV2Like = {
  board: cards("Ad 8h 4h"),
  heroRange: singleHandRange("As", "6s"),
  villainRange: rangeFromTokens(WIDE_BLOCKER_TOKENS),
  potCurrent: 36.1,
  callAmount: 13.8,
};

/** Contado no motor real antes de escrever o teto de tempo. */
export const WIDE_BLOCKED_COMBOS = 64;
export const WIDE_TOTAL_VILLAIN_COMBOS = 565;
