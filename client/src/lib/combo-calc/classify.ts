// Range Lab / F3a — leitura por categoria de um combo concreto.
//
// Spec  : Docs/specs/range-lab/F3a-leitura-categorias.md
// Porque: Docs/specs/range-lab/F3-detalhamento.md
// ADR   : Docs/architecture/decisions/248-range-lab-f3a-leitura-categorias.md
// Arvore: Docs/architecture/diagrams/range-lab-f3a/classify-arvore-de-decisao.mermaid
//
// Modulo PURO (D-F3-1): sem React, sem worker, sem motor. Nao entra em `run.ts`.
// A classificacao nao depende do tamanho da aposta — `AJ` em `A-K-Q` e top par com
// kicker nut tanto contra 10 quanto contra 100 —, entao ela nao pode viajar junto
// da corrida, que redispara a cada tecla no pote (debounce de 400 ms).
//
// A regra central e de TIPO, nao de disciplina (D-F3-4): `made` e UM valor
// (particao, soma = massa total) e `draws` e um CONJUNTO (etiqueta, pode passar do
// total). Nao existe lista unica onde os dois convivam, entao nao existe o `sum()`
// que produziria 137%.
import { cardKey } from "./cards";
import { CATEGORY, evaluateHand } from "./evaluator";
import { STRAIGHT_TOP } from "./fastEvaluator";
import type { Card, Rank, Suit } from "./types";

export type MadeCategory =
  | "straight_flush"
  | "quads"
  | "full_house"
  | "flush"
  | "straight"
  | "set"
  | "trips"
  | "two_pair"
  | "overpair"
  | "top_pair"
  | "second_pair"
  | "third_pair"
  | "weak_pair"
  | "underpair"
  | "ace_high"
  | "no_pair";

export type FlushQualifier = "nut" | "strong" | "weak";
export type TwoPairQualifier = "top_two" | "top_bottom" | "bottom_two" | "with_board_pair";
export type KickerBand = "k_top" | "k_good" | "k_weak";
export type Qualifier = FlushQualifier | TwoPairQualifier | KickerBand;

export type DrawTag =
  | "fd_nut"
  | "fd"
  | "bdfd"
  | "oesd"
  | "gutshot"
  | "bdsd"
  | "overcards2"
  | "overcard1";

export interface HandRead {
  /** Exatamente UM, sempre. E a particao (D-F3-4). */
  made: MadeCategory;
  madeQualifier: Qualifier | null;
  /**
   * A CATEGORIA NOMEADA foi formada com ao menos uma carta do heroi (D-F3-20).
   *
   * NAO e "a melhor mao de 5 cartas usa carta minha" — sao duas perguntas, e uma
   * flag so nao responde as duas. `AK` em `Q-7-7` sai `ace_high` com a flag
   * `true` (o as nomeia a categoria e e dele), enquanto `23` em `5-6-7-8-9` sai
   * `straight` com `false` (a mesa joga sozinha). A leitura R3 do ADR-248, que
   * pedia o contrario, foi superada pela D-F3-20.
   */
  usesHoleCards: boolean;
  fromPocketPair: boolean;
  nutKicker: boolean;
  /** 0..n. Etiqueta, nao particao: um combo com flush draw e gutshot conta nas duas. */
  draws: DrawTag[];
}

export interface BoardTexture {
  /** Maior contagem de um mesmo naipe no bordo (1..5). */
  suitedMax: number;
  suit: "rainbow" | "2flush" | "monotone" | "four_flush" | "five_flush";
  pairing: "unpaired" | "paired" | "trips" | "quads";
}

// ── utilitarios de mascara e contagem ────────────────────────

/** Mascara de 13 bits por RANK (bit 0 = 2, bit 12 = A) — a mesma da STRAIGHT_TOP. */
function maskOf(cards: Card[]): number {
  let mask = 0;
  for (const c of cards) mask |= 1 << (c.rank - 2);
  return mask;
}

/**
 * Quantos ranks AUSENTES da mascara, ligados um a um, produzem sequencia.
 *
 * Reusa a `STRAIGHT_TOP` que a F1 ja construiu: nao ha avaliador novo nesta
 * frente (D-F3-6).
 */
export function straightOuts(rankMask: number): number {
  let outs = 0;
  for (let bit = 0; bit < 13; bit++) {
    const b = 1 << bit;
    if (rankMask & b) continue;
    if (STRAIGHT_TOP[rankMask | b] !== 0) outs++;
  }
  return outs;
}

/**
 * Sonda de DUAS cartas: existe par de ranks ausentes que, juntos, formam
 * sequencia?
 *
 * O `straightOuts` liga UM rank por vez e por definicao nao enxerga backdoor —
 * `KQ` sobre `9-8` so completa com J **e** T. Sao no maximo C(13,2) = 78
 * consultas de tabela, e so no flop (D-F3-6, nota de implementacao do ADR).
 */
function hasTwoCardStraight(rankMask: number): boolean {
  for (let i = 0; i < 13; i++) {
    const bi = 1 << i;
    if (rankMask & bi) continue;
    for (let j = i + 1; j < 13; j++) {
      const bj = 1 << j;
      if (rankMask & bj) continue;
      if (STRAIGHT_TOP[rankMask | bi | bj] !== 0) return true;
    }
  }
  return false;
}

function countByRank(cards: Card[]): Map<Rank, number> {
  const out = new Map<Rank, number>();
  for (const c of cards) out.set(c.rank, (out.get(c.rank) ?? 0) + 1);
  return out;
}

function countBySuit(cards: Card[]): Map<Suit, number> {
  const out = new Map<Suit, number>();
  for (const c of cards) out.set(c.suit, (out.get(c.suit) ?? 0) + 1);
  return out;
}

/** Ranks distintos do bordo, do maior para o menor: b0, b1, b2... */
function boardRanksDesc(board: Card[]): Rank[] {
  return [...new Set(board.map((c) => c.rank))].sort((a, b) => b - a);
}

/**
 * Ranks VIVOS de um naipe = os que nao estao no bordo, do maior para o menor.
 *
 * "Vivas" significa "ausentes do bordo" (D-F3-10): a segunda carta do proprio
 * combo e o range do oponente NAO entram na conta. Simplificacao declarada — e
 * por isso que o `K` de copas **e** nut quando o `A` de copas esta na mesa.
 */
function liveRanksOfSuit(board: Card[], suit: Suit): Rank[] {
  const onBoard = new Set(board.filter((c) => c.suit === suit).map((c) => c.rank));
  const out: Rank[] = [];
  for (let r = 14; r >= 2; r--) {
    const rank = r as Rank;
    if (!onBoard.has(rank)) out.push(rank);
  }
  return out;
}

// ── textura do bordo (emenda A15) ────────────────────────────

const SUIT_LABEL: BoardTexture["suit"][] = [
  "rainbow", // 0 nunca acontece; indice 1 e o primeiro real
  "rainbow",
  "2flush",
  "monotone",
  "four_flush",
  "five_flush",
];

const PAIRING_LABEL: BoardTexture["pairing"][] = [
  "unpaired",
  "unpaired",
  "paired",
  "trips",
  "quads",
];

/**
 * Duas dimensoes INDEPENDENTES: naipe e pareamento. Bordo monotone pareado tem as
 * duas marcas, e uma nao contamina a outra.
 *
 * Bordo duplamente pareado continua `paired`: a dimensao tem quatro valores, e o
 * que ela mede e a maior repeticao de um rank, nao quantos pares existem.
 */
export function boardTexture(board: Card[]): BoardTexture {
  let suitedMax = 0;
  for (const n of countBySuit(board).values()) suitedMax = Math.max(suitedMax, n);
  let rankMax = 0;
  for (const n of countByRank(board).values()) rankMax = Math.max(rankMax, n);
  return {
    suitedMax,
    suit: SUIT_LABEL[Math.min(suitedMax, 5)],
    pairing: PAIRING_LABEL[Math.min(rankMax, 4)],
  };
}

// ── kicker: banda ABSOLUTA + marca de nut ────────────────────

/**
 * Banda fixa (D-F3-9): A/K = topo, Q/J/T = bom, 9 ou menor = fraco.
 *
 * Absoluta de proposito. A banda relativa ao bordo e mais justa na media e nao e
 * explicavel numa linha; ela erra de um jeito INVISIVEL, e a absoluta erra de um
 * jeito que o proprio jogador corrige olhando. Por isso a tela declara a banda
 * como banda fixa, nunca disfarcada de avaliacao GTO.
 */
function kickerBand(rank: Rank): KickerBand {
  if (rank >= 13) return "k_top";
  if (rank >= 10) return "k_good";
  return "k_weak";
}

/**
 * O kicker e o maior rank AUSENTE do bordo (D-F3-15).
 *
 * E o caso em que as duas bandas erram e a marca acerta: em `A-K-Q`, `AJ` tem o
 * melhor kicker possivel — `K` ou `Q` nao dariam um top par melhor, dariam DOIS
 * PARES. A marca resolve sem trocar a banda.
 */
function isNutKicker(kicker: Rank, board: Card[]): boolean {
  const onBoard = new Set(board.map((c) => c.rank));
  for (let r = 14; r >= 2; r--) {
    if (onBoard.has(r as Rank)) continue;
    return kicker === r;
  }
  return false;
}

// ── mao feita ────────────────────────────────────────────────

const FORCE_CATEGORY: Record<number, MadeCategory> = {
  [CATEGORY.STRAIGHT]: "straight",
  [CATEGORY.FLUSH]: "flush",
  [CATEGORY.FULL_HOUSE]: "full_house",
  [CATEGORY.QUADS]: "quads",
  [CATEGORY.STRAIGHT_FLUSH]: "straight_flush",
};

const PAIR_STEP_BY_HIGHER: MadeCategory[] = [
  "top_pair",
  "second_pair",
  "third_pair",
  "weak_pair",
];

/**
 * A familia de forca foi formada so pela mesa?
 *
 * Fora do river a resposta e sempre "nao": bordo de 3 ou 4 cartas nao forma cinco
 * cartas sozinho. No river, compara a mao de 5 do bordo com a familia nomeada —
 * se coincidem em categoria e desempate, quem jogou foi a mesa.
 */
function forceComesFromBoardAlone(board: Card[], family: number): boolean {
  if (board.length < 5) return false;
  const alone = evaluateHand(board);
  if (alone.category !== family) return false;
  const best = evaluateHand(board);
  return best.category === family;
}

interface PairStepInput {
  hole: [Card, Card];
  board: Card[];
  boardRanks: Rank[];
}

interface MadeResult {
  made: MadeCategory;
  madeQualifier: Qualifier | null;
  usesHoleCards: boolean;
  fromPocketPair: boolean;
  nutKicker: boolean;
}

/**
 * O passo de par: familia 1, ou familia 2/3 SEM participacao do heroi.
 *
 * E aqui que mora a assimetria da D-F3-3. Familia de forca fica com o nome mesmo
 * quando a mesa joga (sequencia na mesa **e** a sua sequencia — voce chega ao
 * showdown com ela). Familia de par exige participacao (par na mesa **nao** e o
 * seu segundo par — ele nao separa voce de ninguem). `AK` em `Q-7-7` e as alto,
 * nunca "2o par".
 */
function classifyPairStep({ hole, board, boardRanks }: PairStepInput): MadeResult {
  const [a, b] = hole;
  const pocketPair = a.rank === b.rank;

  if (pocketPair) {
    const higher = boardRanks.filter((r) => r > a.rank).length;
    let made: MadeCategory;
    if (higher === 0) made = "overpair";
    else if (higher === boardRanks.length) made = "underpair";
    else made = PAIR_STEP_BY_HIGHER[Math.min(higher, 3)];
    // As duas cartas SAO o par: nao ha kicker. `k_weak` aqui seria rotulo
    // inventado, e `fromPocketPair` e o que deixa a tela escrever
    // "88 de bolso = 3o par" em vez de o jogador adivinhar por que falta kicker.
    return {
      made,
      madeQualifier: null,
      usesHoleCards: true,
      fromPocketPair: true,
      nutKicker: false,
    };
  }

  const boardRankSet = new Set(boardRanks);
  const paired = [a, b].filter((c) => boardRankSet.has(c.rank));

  if (paired.length >= 1) {
    // Pareia so um rank do bordo (dois ranks distintos ja teriam saido como dois
    // pares na familia 2). O kicker e a outra carta.
    const pairedCard = paired[0];
    const kicker = pairedCard === a ? b : a;
    const higher = boardRanks.filter((r) => r > pairedCard.rank).length;
    return {
      made: PAIR_STEP_BY_HIGHER[Math.min(higher, 3)],
      madeQualifier: kickerBand(kicker.rank),
      usesHoleCards: true,
      fromPocketPair: false,
      nutKicker: isNutKicker(kicker.rank, board),
    };
  }

  const hasAce = a.rank === 14 || b.rank === 14;
  return {
    made: hasAce ? "ace_high" : "no_pair",
    madeQualifier: null,
    // `ace_high` e nomeado pelo as do heroi -> a categoria usa carta dele.
    // `no_pair` nao e formado por nada: nenhuma carta do heroi a nomeia (D-F3-20).
    usesHoleCards: hasAce,
    fromPocketPair: false,
    nutKicker: false,
  };
}

/** Qualificador de dois pares pela posicao dos ranks pareados no bordo. */
function twoPairQualifier(hole: [Card, Card], boardRanks: Rank[]): TwoPairQualifier {
  const boardRankSet = new Set(boardRanks);
  const heroPaired = [...new Set(hole.filter((c) => boardRankSet.has(c.rank)).map((c) => c.rank))];

  // O heroi nao pareia dois ranks distintos: um dos pares veio do bordo.
  if (heroPaired.length < 2) return "with_board_pair";

  const b0 = boardRanks[0];
  const b1 = boardRanks[1];
  if (heroPaired.includes(b0) && heroPaired.includes(b1)) return "top_two";
  if (heroPaired.includes(b0)) return "top_bottom";
  return "bottom_two";
}

function classifyMade(hole: [Card, Card], board: Card[], family: number): MadeResult {
  const boardRanks = boardRanksDesc(board);
  const [a, b] = hole;
  const pocketPair = a.rank === b.rank;
  const boardRankCount = countByRank(board);

  // Familia de FORCA: fica com o nome mesmo quando a mesa joga (D-F3-3).
  const force = FORCE_CATEGORY[family];
  if (force) {
    const fromBoard = forceComesFromBoardAlone(board, family);
    let qualifier: Qualifier | null = null;
    if (force === "flush") {
      const suitCount = countBySuit([...board, ...hole]);
      let flushSuit: Suit | null = null;
      for (const [suit, n] of suitCount) if (n >= 5) flushSuit = suit;
      if (flushSuit) {
        const heroOfSuit = hole
          .filter((c) => c.suit === flushSuit)
          .map((c) => c.rank)
          .sort((x, y) => y - x);
        if (heroOfSuit.length > 0) {
          const live = liveRanksOfSuit(board, flushSuit);
          const position = live.indexOf(heroOfSuit[0]) + 1;
          qualifier = position === 1 ? "nut" : position <= 3 ? "strong" : "weak";
        }
      }
    }
    return {
      made: force,
      madeQualifier: qualifier,
      usesHoleCards: !fromBoard,
      fromPocketPair: pocketPair,
      nutKicker: false,
    };
  }

  // Familia 3: set exige par de bolso do rank presente no bordo; trips exige
  // UMA carta do heroi no rank. Trinca inteira da mesa cai no passo de par (R2).
  if (family === CATEGORY.TRIPS) {
    if (pocketPair && boardRankCount.has(a.rank)) {
      return {
        made: "set",
        madeQualifier: null,
        usesHoleCards: true,
        fromPocketPair: true,
        nutKicker: false,
      };
    }
    const inTrips = hole.filter((c) => (boardRankCount.get(c.rank) ?? 0) >= 2);
    if (inTrips.length >= 1) {
      const kicker = inTrips[0] === a ? b : a;
      return {
        made: "trips",
        madeQualifier: kickerBand(kicker.rank),
        usesHoleCards: true,
        fromPocketPair: false,
        nutKicker: isNutKicker(kicker.rank, board),
      };
    }
    return classifyPairStep({ hole, board, boardRanks });
  }

  // Familia 2: participacao em ao menos UM dos dois pares ja e dois pares (R1).
  // Exigir participacao nos DOIS mandaria `88` em `Q-7-7` para o passo de par,
  // saindo `second_pair` — o oposto do criterio de aceite 2.
  if (family === CATEGORY.TWO_PAIR) {
    // Participacao se mede contra os DOIS pares que o avaliador nomeou, nao
    // contra "existe algum par meu". `22` num bordo `7-7-4-4` tem par, mas os
    // pares nomeados sao 7 e 4: o dois nao entra em nenhum dos dois e a mao cai
    // no passo de par (underpair).
    const namedPairs = [...countByRank([...board, ...hole]).entries()]
      .filter(([, n]) => n >= 2)
      .map(([rank]) => rank)
      .sort((x, y) => y - x)
      .slice(0, 2);
    const participa = namedPairs.some(
      (rank) => (boardRankCount.get(rank) ?? 0) < 2 && hole.some((c) => c.rank === rank),
    );
    if (participa) {
      return {
        made: "two_pair",
        madeQualifier: twoPairQualifier(hole, boardRanks),
        usesHoleCards: true,
        fromPocketPair: pocketPair,
        nutKicker: false,
      };
    }
    return classifyPairStep({ hole, board, boardRanks });
  }

  return classifyPairStep({ hole, board, boardRanks });
}

// ── draws ────────────────────────────────────────────────────

const MADE_WITH_FLUSH: MadeCategory[] = ["flush", "straight_flush"];
const MADE_WITH_STRAIGHT: MadeCategory[] = ["straight", "straight_flush"];

function flushDraw(hole: [Card, Card], board: Card[], made: MadeCategory): DrawTag | null {
  if (MADE_WITH_FLUSH.includes(made)) return null;

  for (const suit of new Set(hole.map((c) => c.suit))) {
    const heroCount = hole.filter((c) => c.suit === suit).length;
    const boardCount = board.filter((c) => c.suit === suit).length;
    const total = heroCount + boardCount;

    // Draw so conta o que a MAO ACRESCENTA (D-F3-6): sem carta do heroi no naipe
    // nao ha o que marcar — a mesa monotone daria backdoor para os 1326 combos.
    if (heroCount === 0) continue;

    if (total === 4) {
      const live = liveRanksOfSuit(board, suit);
      const heroTop = Math.max(...hole.filter((c) => c.suit === suit).map((c) => c.rank));
      return live[0] === heroTop ? "fd_nut" : "fd";
    }
    // Backdoor de flush precisa de DUAS cartas por vir: so existe no flop.
    if (total === 3 && board.length === 3) return "bdfd";
  }
  return null;
}

function straightDraw(hole: [Card, Card], board: Card[], made: MadeCategory): DrawTag | null {
  if (MADE_WITH_STRAIGHT.includes(made)) return null;

  const boardMask = maskOf(board);
  const handMask = maskOf([...board, ...hole]);
  const added = straightOuts(handMask) - straightOuts(boardMask);
  if (added >= 2) return "oesd";
  if (added === 1) return "gutshot";

  // A sonda de uma carta nao enxerga backdoor; e outra funcao, e so no flop.
  if (board.length === 3 && hasTwoCardStraight(handMask) && !hasTwoCardStraight(boardMask)) {
    return "bdsd";
  }
  return null;
}

/**
 * Overcards so descrevem quem SO tem potencial (D-F3-8).
 *
 * "2 overcards" com um set na mao e ruido: a mao ja tem valor feito e as cartas
 * altas nao mudam nada da decisao.
 */
function overcardDraw(hole: [Card, Card], board: Card[], made: MadeCategory): DrawTag | null {
  if (made !== "no_pair" && made !== "ace_high") return null;
  const b0 = Math.max(...board.map((c) => c.rank));
  const above = hole.filter((c) => c.rank > b0).length;
  if (above >= 2) return "overcards2";
  if (above === 1) return "overcard1";
  return null;
}

// ── entrada publica ──────────────────────────────────────────

/**
 * Leitura completa de um combo concreto contra um bordo de 3 a 5 cartas.
 *
 * A familia vem de `evaluateHand` (D-F3-17), que aceita 5 a 7 cartas — o
 * `evaluate7` do avaliador rapido exige exatamente 7 e nao serve no flop nem no
 * turn. Como a D-F3-1 tirou a classificacao do caminho quente, a alocacao por
 * chamada deixa de importar, e o criterio de aceite 7 ja amarra `classify` a esse
 * mesmo avaliador como oraculo.
 */
export function classifyCombo(hole: [Card, Card], board: Card[]): HandRead {
  const family = evaluateHand([...board, ...hole]).category;
  const made = classifyMade(hole, board, family);

  // Bordo de 5 cartas nao tem carta por vir: tag de draw no river e ruido que
  // infla o painel e some com a linha que importa (D-F3-5).
  const draws: DrawTag[] = [];
  if (board.length < 5) {
    const flush = flushDraw(hole, board, made.made);
    if (flush) draws.push(flush);
    const straight = straightDraw(hole, board, made.made);
    if (straight) draws.push(straight);
    const overcard = overcardDraw(hole, board, made.made);
    if (overcard) draws.push(overcard);
  }

  return { ...made, draws };
}
