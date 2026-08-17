// Estimativa de custo e escolha de modo (ADR-246 D-F1-3 e D-F1-5).
//
// ATENCAO AO VOCABULARIO: aqui "showdown" e UMA COMPARACAO de dois inteiros ja
// calculados, nao duas avaliacoes de mao como em `evaluator.ts:showdown`. O
// `EXACT_LIMIT` conta showdowns nesse sentido novo. Quem estimar com a semantica
// antiga erra por ordens de grandeza no caso range vs range — no laco por runout,
// as avaliacoes crescem com `H + V` e as comparacoes com `H * V`.
import type { EngineRequest } from "./types";
import { boardDeadSet, collides, expandRangeV2 } from "./expand";

/**
 * Teto do modo exato, em showdowns. Numero MEDIDO em uso real (emenda A2); a
 * proposta anterior de 5M era chute.
 */
export const EXACT_LIMIT = 4_000_000;

/**
 * Piso de amostras do Monte Carlo. Abaixo disso o intervalo de 95% fica largo
 * demais para significar alguma coisa, entao o orcamento nunca desce daqui.
 */
export const MC_MIN_SAMPLES = 1000;

/**
 * Runouts validos para UM par (combo do heroi, combo do vilao). E constante por
 * street: o par sempre tira as MESMAS 4 cartas do baralho, entao o denominador
 * nao depende de quem sao. E isso que permite acumular soma crua e dividir uma
 * unica vez no fim.
 *
 *   river: 1 (nao ha runout)
 *   turn : 52 - 4 do bordo - 2 do heroi - 2 do vilao = 44
 *   flop : C(45, 2) = 990
 */
export function runoutsPerPair(boardLength: number): number {
  if (boardLength >= 5) return 1;
  if (boardLength === 4) return 44;
  const remaining = 52 - 3 - 2 - 2; // 45
  return (remaining * (remaining - 1)) / 2;
}

export interface EngineCostEstimate {
  /** Pares (heroi, vilao) que NAO dividem carta. */
  validPairs: number;
  runoutsPerPair: number;
  /** `validPairs * runoutsPerPair` — o trabalho real do modo exato. */
  showdowns: number;
  heroCombos: number;
  villainCombos: number;
}

export function estimateCost(request: EngineRequest): EngineCostEstimate {
  const { spot } = request;
  const dead = boardDeadSet(spot.board);
  const hero = expandRangeV2(spot.heroRange, dead);
  const villain = expandRangeV2(spot.villainRange, dead);

  let validPairs = 0;
  for (const h of hero.combos) {
    for (const v of villain.combos) {
      if (!collides(h.lo, h.hi, v.lo, v.hi)) validPairs++;
    }
  }

  const perPair = runoutsPerPair(spot.board.length);
  return {
    validPairs,
    runoutsPerPair: perPair,
    showdowns: validPairs * perPair,
    heroCombos: hero.combos.length,
    villainCombos: villain.combos.length,
  };
}

/**
 * O modo que a ferramenta SUGERE. Ela nunca troca sozinha — quem pede exato tem
 * direito de esperar (RF-01.4). Exatamente no limite ainda cabe exato.
 */
export function suggestMode(showdowns: number): EngineRequest["mode"] {
  return showdowns <= EXACT_LIMIT ? "exact" : "monte_carlo";
}

/**
 * Amostras que cabem no orcamento. Cada amostra avalia TODOS os combos do heroi
 * (o heroi permanece exaustivo — D-F1-5), entao o custo por amostra cresce com
 * `heroCombos`.
 */
export function monteCarloSamples(showdownBudget: number, heroCombos: number): number {
  const perSample = Math.max(1, heroCombos);
  const affordable = Math.floor(Math.max(0, showdownBudget) / perSample);
  return Math.max(MC_MIN_SAMPLES, affordable);
}
