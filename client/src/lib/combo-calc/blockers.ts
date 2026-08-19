// Range Lab / F3b — o contrafactual do bloqueador, SEM segunda corrida do motor.
//
// Spec  : Docs/specs/range-lab/F3b-decisao.md (criterios 4 REESCRITO e 5)
// ADR   : Docs/architecture/decisions/249-range-lab-f3b-decisao.md
//         (Refutacao 1, D-F3-27, D-F3-28, D-F3-29, D-F3-30, D-F3-38)
//
// TRES COISAS QUE PARECEM ESTRANHAS E SAO DE PROPOSITO
//
// 1. Os combos bloqueados NAO sao reenumerados. `collides()` governa o laco de
//    pares do motor, nao a lista de saida: o combo sem par valido chega em
//    `perVillainCombo` com `pairMass: 0`, `equity: null` e o peso declarado
//    intacto. O conjunto bloqueado sai de graca de um filtro (Refutacao 1).
// 2. O par avaliado e um estado IMPOSSIVEL do baralho (heroi e vilao dividindo
//    carta). Nao ha avaliacao de 9 cartas em lugar nenhum: `evalWithBoard` avalia
//    os 7 do heroi e os 7 do vilao em chamadas separadas, cada mao legal em si, e
//    comparar dois inteiros e aritmetica bem definida. E o que "meu as bloqueia 3
//    combos de nut flush" ja significa na boca do jogador (D-F3-27).
// 3. O denominador e POR COMBO. O par ficticio remove TRES cartas distintas (as
//    duas do heroi mais a carta livre do vilao), nao quatro: C(46,2) = 1035
//    runouts validos no flop, e nao os 990 de `cost.ts`. Usar a constante do motor
//    daria um vies de 4,5%, silencioso e sistematico.
//
// SINCRONO DE PONTA A PONTA (D-F3-28). `loadBoard` e estado de MODULO do
// `fastEvaluator`, e agora ele tem dois clientes. Quem chama `evalWithBoard` chama
// `loadBoard` no mesmo bloco sincrono; ceder a thread no meio faria o segundo
// cliente ler um bordo que nao e o dele. Se um dia isto precisar ceder, vai para o
// worker — e ai e mudanca de protocolo, nao de detalhe. Ha teste estrutural
// cobrando a ausencia de assincronia neste arquivo.
import {
  decisionBasis,
  partitionVillainRows,
  splitByConfrontation,
  villainRowsOf,
} from "./confront";
import type { ConfrontationSplit } from "./confront";
import { encodeCard, evalWithBoard, loadBoard } from "./fastEvaluator";
import type { EngineResult, EngineResultOk, VillainComboResult } from "./engine/types";
import type { Card } from "./types";

const DECK_SIZE = 52;

export type BlockerUnavailableReason = "no_result" | "engine_degraded" | "hero_is_range";

export type BlockerDeltaUnavailableReason =
  | "monte_carlo_mode"
  | "not_requested"
  | "no_blocked_combos";

export type BlockerAvailability =
  | { available: true; hero: [Card, Card] }
  | { available: false; reason: BlockerUnavailableReason; heroCombos: number };

/**
 * Quem decide se o painel existe e uma funcao pura, e nao um `if` no JSX: a
 * decisao fica testavel sem RTL e a UI so renderiza o que a funcao devolveu.
 *
 * `hero_is_range` e o achado F-5. O predicado le `perHeroCombo.length`, e nao o
 * toggle da tela, pelo mesmo motivo da D-F3-25. A razao carrega `heroCombos` para
 * a frase poder ser especifica em vez do generico "indisponivel", que faz o
 * jogador achar que quebrou.
 *
 * Sem resultado, `heroCombos` e 0 e nao um numero herdado do estado anterior da
 * UI — numero velho com cara de atual (D-F3-38).
 */
export function blockerAvailability(result: EngineResult | null): BlockerAvailability {
  if (result === null) return { available: false, reason: "no_result", heroCombos: 0 };
  if (result.status !== "ok") {
    return { available: false, reason: "engine_degraded", heroCombos: 0 };
  }
  const heroCombos = result.perHeroCombo.length;
  if (heroCombos !== 1) {
    return { available: false, reason: "hero_is_range", heroCombos };
  }
  // Resultado sem `perVillainCombo` (worker de bundle antigo) nao tem de onde
  // tirar os bloqueados: o painel diz que a corrida nao serve, em vez de mostrar
  // "zero combos bloqueados", que seria outra afirmacao.
  if (villainRowsOf(result) === null) {
    return { available: false, reason: "engine_degraded", heroCombos: 0 };
  }
  return { available: true, hero: result.perHeroCombo[0].combo };
}

export interface BlockedCardReport {
  card: Card;
  removed: ConfrontationSplit;
}

export type BlockerDelta =
  | {
      status: "ok";
      /** Literalmente `result.heroRangeEquity` — reuso, nao segunda conta. */
      equityReal: number;
      equityCounterfactual: number;
      /** Fracao; a tela converte para pontos percentuais. */
      delta: number;
      runoutsEnumerated: number;
    }
  | { status: "unavailable"; reason: BlockerDeltaUnavailableReason };

export interface BlockerReport {
  hero: [Card, Card];
  /** ETIQUETA, nao particao: o combo igual a sua mao entra nas DUAS colunas. */
  perCard: [BlockedCardReport, BlockedCardReport];
  /** UNIAO — conta uma vez o combo bloqueado pelas duas cartas. */
  blockedCombos: number;
  blockedMass: number;
  delta: BlockerDelta;
}

// ── enumeracao do showdown ficticio ──────────────────────────

interface FictitiousEquities {
  /** Equity do heroi contra cada combo bloqueado, na ordem recebida. */
  equities: Array<number | null>;
  /** Runouts do laco EXTERNO: baralho menos bordo menos as duas do heroi. */
  runoutsEnumerated: number;
}

/**
 * Enumera os runouts uma vez, avalia o heroi uma vez por runout e, para cada
 * combo bloqueado, rejeita o runout que comer a carta NAO compartilhada dele.
 *
 * O denominador de cada combo e o proprio `den[k]` acumulado aqui, nunca o
 * `runoutsPerPair` do motor.
 */
function enumerateFictitiousEquities(
  hero: readonly [Card, Card],
  blocked: readonly VillainComboResult[],
  board: readonly Card[],
): FictitiousEquities {
  const boardCodes = board.map(encodeCard);
  const heroA = encodeCard(hero[0]);
  const heroB = encodeCard(hero[1]);

  const usedByBoard = new Set<number>(boardCodes);
  usedByBoard.add(heroA);
  usedByBoard.add(heroB);

  const deck: number[] = [];
  for (let code = 0; code < DECK_SIZE; code++) {
    if (!usedByBoard.has(code)) deck.push(code);
  }

  const K = blocked.length;
  const codeA = new Int32Array(K);
  const codeB = new Int32Array(K);
  // Mascara das cartas do combo que NAO sao do heroi: sao elas que o runout nao
  // pode comer. As do heroi ja estao fora do baralho.
  const freeLo = new Int32Array(K);
  const freeHi = new Int32Array(K);
  const num = new Float64Array(K);
  const den = new Float64Array(K);

  for (let k = 0; k < K; k++) {
    const a = encodeCard(blocked[k].combo[0]);
    const b = encodeCard(blocked[k].combo[1]);
    codeA[k] = a;
    codeB[k] = b;
    let lo = 0;
    let hi = 0;
    for (const code of [a, b]) {
      if (code === heroA || code === heroB) continue;
      if (code < 32) lo |= 1 << code;
      else hi |= 1 << (code - 32);
    }
    freeLo[k] = lo;
    freeHi[k] = hi;
  }

  const missing = 5 - board.length;
  let runoutsEnumerated = 0;

  function runOneRunout(r1: number, r2: number): void {
    const b3 = board.length >= 4 ? boardCodes[3] : r1;
    const b4 = board.length >= 5 ? boardCodes[4] : board.length === 4 ? r1 : r2;
    loadBoard(boardCodes[0], boardCodes[1], boardCodes[2], b3, b4);

    let rLo = 0;
    let rHi = 0;
    if (r1 >= 0) {
      if (r1 < 32) rLo |= 1 << r1;
      else rHi |= 1 << (r1 - 32);
    }
    if (r2 >= 0) {
      if (r2 < 32) rLo |= 1 << r2;
      else rHi |= 1 << (r2 - 32);
    }

    const heroScore = evalWithBoard(heroA, heroB);
    for (let k = 0; k < K; k++) {
      if (((freeLo[k] & rLo) | (freeHi[k] & rHi)) !== 0) continue;
      const villainScore = evalWithBoard(codeA[k], codeB[k]);
      num[k] += heroScore > villainScore ? 1 : heroScore === villainScore ? 0.5 : 0;
      den[k]++;
    }
    runoutsEnumerated++;
  }

  if (missing === 0) {
    runOneRunout(-1, -1);
  } else if (missing === 1) {
    for (const extra of deck) runOneRunout(extra, -1);
  } else {
    for (let i = 0; i < deck.length; i++) {
      for (let j = i + 1; j < deck.length; j++) runOneRunout(deck[i], deck[j]);
    }
  }

  const equities: Array<number | null> = [];
  for (let k = 0; k < K; k++) {
    equities.push(den[k] > 0 ? num[k] / den[k] : null);
  }
  return { equities, runoutsEnumerated };
}

// ── o relatorio ──────────────────────────────────────────────

function containsCard(combo: readonly [Card, Card], card: Card): boolean {
  return (
    (combo[0].rank === card.rank && combo[0].suit === card.suit) ||
    (combo[1].rank === card.rank && combo[1].suit === card.suit)
  );
}

/**
 * `computeDelta` e a D-F3-13: no river a conta e analitica e sai sozinha; fora
 * dele e trabalho sincrono na thread principal a cada tecla, e so sai sob o botao.
 *
 * No Monte Carlo o delta e SUPRIMIDO com razao (D-F3-29): `equityReal` carrega
 * meia-largura de intervalo e o contrafactual sairia analitico, entao um delta
 * tipico de 1 a 3 pontos ficaria menor que o proprio erro e ainda assim apareceria
 * com uma casa decimal. A CONTAGEM continua, porque ela nao depende da corrida.
 */
export function analyzeBlockers(input: {
  result: EngineResultOk;
  board: readonly Card[];
  computeDelta: boolean;
}): BlockerReport | { status: "unavailable"; reason: BlockerUnavailableReason } {
  const { result, board, computeDelta } = input;

  const availability = blockerAvailability(result);
  if (!availability.available) {
    return { status: "unavailable", reason: availability.reason };
  }
  const hero = availability.hero;

  // `blockerAvailability` ja recusou o resultado sem `perVillainCombo`; o `?? []`
  // existe so para o compilador, e nunca e o caminho tomado.
  const villainRows = villainRowsOf(result) ?? [];
  const { alive, blocked } = partitionVillainRows(villainRows);

  let blockedMass = 0;
  for (const row of blocked) blockedMass += row.weight;

  const { basis } = decisionBasis(result, board);
  const perCard = [hero[0], hero[1]].map((card) => ({
    card,
    removed: splitByConfrontation({
      hero,
      rows: blocked
        .filter((row) => containsCard(row.combo, card))
        .map((row) => ({ combo: row.combo, weight: row.weight, equity: row.equity })),
      board,
      basis,
    }),
  })) as [BlockedCardReport, BlockedCardReport];

  const report: BlockerReport = {
    hero,
    perCard,
    blockedCombos: blocked.length,
    blockedMass,
    delta: { status: "unavailable", reason: "not_requested" },
  };

  if (!computeDelta) return report;
  if (result.mode === "monte_carlo") {
    return { ...report, delta: { status: "unavailable", reason: "monte_carlo_mode" } };
  }
  if (blocked.length === 0) {
    return { ...report, delta: { status: "unavailable", reason: "no_blocked_combos" } };
  }

  const { equities, runoutsEnumerated } = enumerateFictitiousEquities(hero, blocked, board);

  // A linha de base e o range COM os bloqueados vivos: remover na unha os combos
  // que dividem carta com o heroi daria delta zero, porque o motor JA os removeu
  // (criterio 4 REESCRITO).
  let numerator = 0;
  let denominator = 0;
  for (const row of alive) {
    if (row.equity === null) {
      // Combo vivo sem numero no modo exato viola o contrato do motor. O log vem
      // ANTES do fallback e a linha fica de fora da media — somar 0 seria inventar
      // que o heroi perde para ela (licao #9).
      console.warn(
        "[range-lab] combo vivo do vilao sem equity no contrafactual do bloqueador: " +
          "ele fica fora da media ponderada desta corrida.",
      );
      continue;
    }
    numerator += row.weight * (1 - row.equity);
    denominator += row.weight;
  }
  for (let k = 0; k < blocked.length; k++) {
    const equity = equities[k];
    if (equity === null) {
      console.warn(
        "[range-lab] combo bloqueado sem runout valido no contrafactual do bloqueador: " +
          "ele fica fora da media ponderada.",
      );
      continue;
    }
    numerator += blocked[k].weight * equity;
    denominator += blocked[k].weight;
  }

  if (!(denominator > 0)) {
    console.warn(
      "[range-lab] contrafactual do bloqueador sem massa: nenhum combo do vilao entrou na media.",
    );
    return { ...report, delta: { status: "unavailable", reason: "no_blocked_combos" } };
  }

  const equityCounterfactual = numerator / denominator;
  const equityReal = result.heroRangeEquity;

  return {
    ...report,
    delta: {
      status: "ok",
      equityReal,
      equityCounterfactual,
      delta: equityReal - equityCounterfactual,
      runoutsEnumerated,
    },
  };
}
