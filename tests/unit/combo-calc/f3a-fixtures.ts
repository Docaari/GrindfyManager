// Fixtures compartilhadas da sub-frente F3a do Range Lab.
// Spec: Docs/specs/range-lab/F3a-leitura-categorias.md
// Porque: Docs/specs/range-lab/F3-detalhamento.md
// ADR  : Docs/architecture/decisions/248-range-lab-f3a-leitura-categorias.md
// Arvore: Docs/architecture/diagrams/range-lab-f3a/classify-arvore-de-decisao.mermaid
//
// NAO e arquivo de teste (sem `.test.ts`): o glob do vitest nao o coleta.
//
// NOTA DELIBERADA (mesma da F1): este arquivo importa SO modulos que JA EXISTEM
// (cards, combos, fastEvaluator, f1-fixtures). Assim ele carrega na red phase e a
// falha de cada teste aponta para o modulo novo que falta (`classify.ts`,
// `read.ts`), e nao para a fixture.
//
// ── CONTRATO que os testes da F3a assumem (o implementer cria exatamente isto) ──
//
//   client/src/lib/combo-calc/classify.ts
//     export type MadeCategory =
//       | "straight_flush" | "quads" | "full_house" | "flush" | "straight"
//       | "set" | "trips" | "two_pair" | "overpair" | "top_pair"
//       | "second_pair" | "third_pair" | "weak_pair" | "underpair"
//       | "ace_high" | "no_pair";
//     export type FlushQualifier   = "nut" | "strong" | "weak";
//     export type TwoPairQualifier = "top_two" | "top_bottom" | "bottom_two" | "with_board_pair";
//     export type KickerBand       = "k_top" | "k_good" | "k_weak";
//     export type Qualifier        = FlushQualifier | TwoPairQualifier | KickerBand;
//     export type DrawTag =
//       | "fd_nut" | "fd" | "bdfd" | "oesd" | "gutshot" | "bdsd"
//       | "overcards2" | "overcard1";
//     export interface HandRead {
//       made: MadeCategory;             // exatamente UM, sempre (particao)
//       madeQualifier: Qualifier | null;
//       usesHoleCards: boolean;
//       fromPocketPair: boolean;
//       nutKicker: boolean;
//       draws: DrawTag[];               // 0..n (etiqueta, nao particao)
//     }
//     export interface BoardTexture {
//       suitedMax: number;              // 1..5 — maior contagem de um mesmo naipe
//       suit: "rainbow" | "2flush" | "monotone" | "four_flush" | "five_flush";
//       pairing: "unpaired" | "paired" | "trips" | "quads";
//     }
//     export function classifyCombo(hole: [Card, Card], board: Card[]): HandRead;
//     export function boardTexture(board: Card[]): BoardTexture;
//     export function straightOuts(rankMask: number): number;
//
//   client/src/lib/combo-calc/read.ts
//     export interface ReadCombo { combo: [Card, Card]; weight: number; equity: number | null }
//     export interface CategoryRow<Id extends string> {
//       id: Id; combos: number; mass: number; equity: number | null;
//     }
//     export interface RangeRead {
//       made: CategoryRow<MadeCategory>[];
//       draws: CategoryRow<DrawTag>[];
//       totalCombos: number; totalMass: number;
//       drawCombos: number;  drawMass: number;
//       reads: Map<string, HandRead>;   // chave = comboKey
//     }
//     export interface ReadFilter { made: Set<MadeCategory>; draws: Set<DrawTag> }
//     export interface HighlightResult {
//       cells: Set<string>;                                    // notacoes de classe acesas
//       perCell: Map<string, { passing: number; total: number }>;
//       passingCombos: number; totalCombos: number;
//     }
//     export function buildRangeRead(combos: ReadCombo[], board: Card[]): RangeRead;
//     export function comboPassesFilter(read: HandRead, filter: ReadFilter): boolean;
//     export function buildHighlight(combos: ReadCombo[], board: Card[], filter: ReadFilter): HighlightResult;
//     export function comboClass(combo: [Card, Card]): string;  // "A7s" | "A7o" | "TT"
//
//   client/src/lib/combo-calc/engine/types.ts  (ADITIVO — D-F3-11)
//     export interface VillainComboResult {
//       combo: [Card, Card]; weight: number; pairMass: number;
//       equity: number | null;
//       confidenceHalfWidth: number | null; sampleCount: number | null;
//       degradedReason: HeroComboDegradedReason | null;   // nomes ESPELHADOS
//     }
//     EngineResultOk ganha: `perVillainCombo: VillainComboResult[]`
//                           `villainRangeEquity: number`
//     EngineResultDegraded NAO ganha nenhum dos dois.
import { parseCard } from "@/lib/combo-calc/cards";
import { STRAIGHT_TOP } from "@/lib/combo-calc/fastEvaluator";
import type { Card, RangeEntry } from "@/lib/combo-calc/types";
import { rangeEntry, rangeFromTokens, specificEntry, type SpotV2Like } from "./f1-fixtures";

export { rangeEntry, rangeFromTokens, specificEntry };
export type { SpotV2Like };

// ── helpers de carta ─────────────────────────────────────────

export function cards(s: string): Card[] {
  return s.split(/\s+/).map((raw) => {
    const c = parseCard(raw);
    if (!c) throw new Error(`Carta invalida na fixture da F3a: "${raw}"`);
    return c;
  });
}

export function card(s: string): Card {
  const c = parseCard(s);
  if (!c) throw new Error(`Carta invalida na fixture da F3a: "${s}"`);
  return c;
}

/** Mao de dois combos concretos, ja no formato que `classifyCombo` recebe. */
export function hole(a: string, b: string): [Card, Card] {
  return [card(a), card(b)];
}

/** Rotulo legivel para mensagem de falha ("As Kd"). */
export function label(list: Card[]): string {
  return list.map((c) => `${"23456789TJQKA"[c.rank - 2]}${c.suit}`).join(" ");
}

/** Mascara de 13 bits por RANK (bit 0 = 2, bit 12 = A) — a mesma da STRAIGHT_TOP. */
export function rankMask(list: Card[]): number {
  let mask = 0;
  for (const c of list) mask |= 1 << (c.rank - 2);
  return mask;
}

/**
 * Oraculo independente de `straightOuts`: quantos ranks AUSENTES da mascara,
 * ligados um a um, produzem sequencia. Escrito aqui de proposito para que o teste
 * nao compare a implementacao consigo mesma.
 */
export function straightOutsOracle(mask: number): number {
  let outs = 0;
  for (let bit = 0; bit < 13; bit++) {
    const b = 1 << bit;
    if (mask & b) continue;
    if (STRAIGHT_TOP[mask | b] !== 0) outs++;
  }
  return outs;
}

// ── bordos canonicos ─────────────────────────────────────────
// Cada um existe por causa de UM caso da spec. Bordo sem caso nomeado nao entra.

/** R1 / criterio 2: `AK` vira ace_high aqui; `88` vira two_pair/with_board_pair. */
export const BOARD_Q77 = cards("Qh 7s 7d");

/** R2: trinca inteira da mesa — `AK` NAO e trips. */
export const BOARD_777 = cards("7h 7s 7d");

/** Criterio 5: `AJ` = top_pair, banda k_good, nutKicker true (D-F3-15). */
export const BOARD_AKQ = cards("Ad Kc Qh");

/** Criterio 4 (D-F3-6): a mesa ja da open-ended; combo que nao acrescenta nao ganha oesd. */
export const BOARD_9876 = cards("9c 8d 7h 6s");

/** R3: sequencia formada SO pela mesa (river). Sem flush: so dois paus. */
export const BOARD_STRAIGHT_RIVER = cards("5c 6d 7h 8s 9c");

/** Tres ranks distintos, rainbow: base dos qualificadores de dois pares. */
export const BOARD_K94 = cards("Kh 9c 4d");

/** Top par com kicker variavel (bandas D-F3-9). */
export const BOARD_952 = cards("9c 5d 2h");

/** Draws de sequencia: a mesa sozinha nao da nada (0 outs). */
export const BOARD_982 = cards("9c 8d 2h");

/** Mesmo bordo com dois paus: acrescenta backdoor de flush ao de sequencia. */
export const BOARD_982_CLUBS = cards("9c 8c 2h");

/** Flush feito no turn: 3 copas na mesa + 2 na mao (D-F3-10). */
export const BOARD_FLUSH_TURN = cards("Kh 9h 2h 5c");

/** Idem, com o As de copas NA MESA: o Kh passa a ser nut (D-F3-10). */
export const BOARD_FLUSH_TURN_ACE = cards("Ah 9h 2h 5c");

/** Set com flush draw no turn: 8 na mesa + 3 copas (D-F3-4 item 4). */
export const BOARD_SET_FD_TURN = cards("8d Kh 5h 2h");

/** Overpair com duas cartas acima de b0 — o caso que D-F3-8 proibe etiquetar. */
export const BOARD_762 = cards("7c 6d 2h");

/** Bordo pareado: trinca com kicker acima de b0 (segundo caso da D-F3-8). */
export const BOARD_772 = cards("7h 7d 2c");

/** River com 5 ranks distintos: onde `weak_pair` de bolso existe sem virar underpair. */
export const BOARD_RIVER_5RANKS = cards("Kh Qc 9d 7s 3c");

/** River em que a mesa sozinha ja e a melhor mao de 5 cartas (carta alta). */
export const BOARD_RIVER_BROADWAY = cards("Ah Kc Qd Js 9h");

/** Quadra inteira da mesa (river) — familia de forca mantem o nome (D-F3-3). */
export const BOARD_QUADS_RIVER = cards("7h 7d 7c 7s Ad");

/** Straight flush inteiro da mesa (river). */
export const BOARD_SF_RIVER = cards("9h 8h 7h 6h 5h");

/** Tres ranks altos: underpair de bolso. */
export const BOARD_KQ9 = cards("Kh Qc 9d");

/** Bordo duplamente pareado: familia 2 SEM participacao do heroi. */
export const BOARD_7744 = cards("7h 7d 4c 4s");

// ── ranges de amostragem (semente fixa) ──────────────────────

/**
 * Range largo usado nas propriedades (criterio 1 e criterio 7). Tokens escolhidos
 * para cobrir par de bolso, suited conector, offsuit alto e roda — nao "um range
 * bonito", e sim um que passe por todos os ramos da arvore de decisao.
 */
export const WIDE_TOKENS = [
  "22+",
  "A2s+",
  "K9s+",
  "QTs+",
  "JTs",
  "T9s",
  "98s",
  "87s",
  "76s",
  "65s",
  "54s",
  "AKo",
  "AQo",
  "KQo",
  "QJo",
  "JTo",
  "T9o",
];

export function wideRange(frequency = 1): RangeEntry[] {
  return rangeFromTokens(WIDE_TOKENS, frequency);
}

/**
 * Range com pesos DESIGUAIS por classe. Serve ao criterio 1 (a soma das massas
 * tem que bater com a massa total ponderada, nao com a contagem) e ao teste de
 * peso do Monte Carlo.
 */
export function unevenRange(): RangeEntry[] {
  return [
    rangeEntry("AA", 1),
    rangeEntry("KK", 0.75),
    rangeEntry("A7s", 0.4),
    rangeEntry("76s", 0.25),
    rangeEntry("QJo", 0.1),
  ];
}

// ── spots do motor (D-F3-11) ─────────────────────────────────

const POT = 36.1;
const CALL = 13.8;

/** Heroi com pesos desiguais — a trava do criterio 2c (identidade heroi+vilao=1). */
export const V2_UNEVEN_HERO: SpotV2Like = {
  board: cards("Ad 8h 4h"),
  heroRange: unevenRange(),
  villainRange: rangeFromTokens(["QQ", "JJ", "T9s", "55"]),
  potCurrent: POT,
  callAmount: CALL,
};

/** Mesmo spot no turn — a identidade tem que valer em mais de um bordo. */
export const V2_UNEVEN_HERO_TURN: SpotV2Like = {
  ...V2_UNEVEN_HERO,
  board: cards("Ad 8h 4h Ks"),
};

/** Mesmo spot no river. */
export const V2_UNEVEN_HERO_RIVER: SpotV2Like = {
  ...V2_UNEVEN_HERO,
  board: cards("Ad 8h 4h Ks 2c"),
};

/**
 * Combo do VILAO sem nenhum combo do heroi para enfrentar: `Ks Qs` divide o `Ks`
 * com a unica mao do heroi. `pairMass` zero do lado de la -> `equity: null` com
 * razao nomeada, NUNCA 0 (espelho de `V2_HERO_COMBO_WITHOUT_OPPONENT` da F1).
 */
export const V2_VILLAIN_COMBO_WITHOUT_OPPONENT: SpotV2Like = {
  board: cards("Ad 8h 4h"),
  heroRange: [specificEntry("Ks", "Kh", 1)],
  villainRange: [specificEntry("Ks", "Qs", 1), specificEntry("2c", "2d", 1)],
  potCurrent: POT,
  callAmount: CALL,
};

/**
 * Par de spots que so difere no PESO das classes do heroi. Serve a armadilha
 * D-F3-18: o acumulador do vilao no Monte Carlo tem que carregar `hero.weight[h]`
 * explicitamente.
 *
 * Por que este par denuncia o acumulador ingenuo: os combos do heroi sao
 * percorridos EXAUSTIVAMENTE e o peso deles nunca entra na amostragem
 * (`pickVillain` usa so o peso do vilao; a rejeicao usa so colisao de carta).
 * Com a mesma semente, as amostras aceitas sao IDENTICAS nos dois spots — entao
 * qualquer diferenca no numero do vilao so pode vir da ponderacao. Um acumulador
 * por contagem simples produz o MESMO numero nos dois, e e exatamente isso que o
 * teste reprova.
 *
 * As duas classes do heroi tem equity oposta contra KK no flop `Ad 8h 4h`:
 * `As Ks` e top par com kicker de rei; `7c 2d` nao tem nada.
 */
export const V2_MC_HERO_EQUAL: SpotV2Like = {
  board: cards("Ad 8h 4h"),
  heroRange: [specificEntry("As", "Ks", 1), specificEntry("7c", "2d", 1)],
  villainRange: rangeFromTokens(["KK"]),
  potCurrent: POT,
  callAmount: CALL,
};

export const V2_MC_HERO_UNEVEN: SpotV2Like = {
  ...V2_MC_HERO_EQUAL,
  heroRange: [specificEntry("As", "Ks", 1), specificEntry("7c", "2d", 0.1)],
};

/** Combo do vilao que NAO colide com nenhum combo do heroi nos dois spots acima. */
export const MC_WATCHED_VILLAIN_COMBO = hole("Kc", "Kd");
