// Range Lab / F3a — agregacao por categoria e o filtro que pinta a matriz.
//
// Spec  : Docs/specs/range-lab/F3a-leitura-categorias.md (RF-03.1, RF-03.7)
// Porque: Docs/specs/range-lab/F3-detalhamento.md (secoes 4.2 e 5)
// ADR   : Docs/architecture/decisions/248-range-lab-f3a-leitura-categorias.md (D-F3-4)
//
// Modulo PURO, como o `classify.ts`: recebe combos ja expandidos e devolve numero.
//
// As duas listas tem CARDINALIDADE DIFERENTE de proposito (D-F3-4). `made`
// particiona (soma = massa total, exato ate 1e-9); `draws` etiqueta (a soma nao
// tem relacao com o total e pode passar dele, porque um combo com flush draw e
// gutshot conta nas duas linhas). O numero bem definido do bloco de draws e
// outro: combos com >= 1 draw, que e o que vai no rodape.
import { comboKey, rankChar } from "./cards";
import { classifyCombo } from "./classify";
import type { DrawTag, HandRead, MadeCategory } from "./classify";
import type { Card } from "./types";

export interface ReadCombo {
  combo: [Card, Card];
  weight: number;
  /** `null` quando nao ha numero — nunca 0 inventado. */
  equity: number | null;
}

export interface CategoryRow<Id extends string> {
  id: Id;
  combos: number;
  mass: number;
  /** Media ponderada pela massa; `null` quando nenhum combo da linha tem numero. */
  equity: number | null;
}

export interface RangeRead {
  made: CategoryRow<MadeCategory>[];
  draws: CategoryRow<DrawTag>[];
  totalCombos: number;
  totalMass: number;
  /** Combos com >= 1 draw: o unico numero somavel do bloco de draws. */
  drawCombos: number;
  drawMass: number;
  /** Leitura por combo, chave = `comboKey` — a tabela do RF-03.8 le daqui. */
  reads: Map<string, HandRead>;
}

export interface ReadFilter {
  made: Set<MadeCategory>;
  draws: Set<DrawTag>;
}

export interface HighlightResult {
  /** Notacoes de classe acesas ("A7s", "TT"). */
  cells: Set<string>;
  perCell: Map<string, { passing: number; total: number }>;
  passingCombos: number;
  totalCombos: number;
}

/** Ordem de exibicao: da mao mais forte para a mais fraca. */
const MADE_ORDER: MadeCategory[] = [
  "straight_flush",
  "quads",
  "full_house",
  "flush",
  "straight",
  "set",
  "trips",
  "two_pair",
  "overpair",
  "top_pair",
  "second_pair",
  "third_pair",
  "weak_pair",
  "underpair",
  "ace_high",
  "no_pair",
];

/** Ordem de exibicao: do desenho mais adiantado para o mais remoto. */
const DRAW_ORDER: DrawTag[] = [
  "fd_nut",
  "fd",
  "bdfd",
  "oesd",
  "gutshot",
  "bdsd",
  "overcards2",
  "overcard1",
];

interface Bucket {
  combos: number;
  mass: number;
  /** Numerador e denominador da media PONDERADA, so com quem tem numero. */
  equityNum: number;
  equityDen: number;
}

function emptyBucket(): Bucket {
  return { combos: 0, mass: 0, equityNum: 0, equityDen: 0 };
}

function addToBucket(bucket: Bucket, entry: ReadCombo): void {
  bucket.combos += 1;
  bucket.mass += entry.weight;
  // Combo sem equity continua CONTADO na linha, mas fora da media: tratar `null`
  // como 0 puxaria a media para baixo e inventaria um numero.
  if (entry.equity !== null) {
    bucket.equityNum += entry.weight * entry.equity;
    bucket.equityDen += entry.weight;
  }
}

function toRows<Id extends string>(
  buckets: Map<Id, Bucket>,
  order: readonly Id[],
): CategoryRow<Id>[] {
  const rows: CategoryRow<Id>[] = [];
  for (const id of order) {
    const bucket = buckets.get(id);
    // Linha vazia nao vai para a tela.
    if (!bucket || bucket.combos === 0) continue;
    rows.push({
      id,
      combos: bucket.combos,
      mass: bucket.mass,
      equity: bucket.equityDen > 0 ? bucket.equityNum / bucket.equityDen : null,
    });
  }
  return rows;
}

/**
 * Agrega um range ja expandido em duas listas independentes.
 *
 * A soma que produziria 137% nao e "proibida por convencao": ela e impossivel de
 * escrever, porque nao existe lista unica onde `made` e `draws` convivam.
 */
export function buildRangeRead(combos: ReadCombo[], board: Card[]): RangeRead {
  const madeBuckets = new Map<MadeCategory, Bucket>();
  const drawBuckets = new Map<DrawTag, Bucket>();
  const reads = new Map<string, HandRead>();

  let totalMass = 0;
  let drawCombos = 0;
  let drawMass = 0;

  for (const entry of combos) {
    const read = classifyCombo(entry.combo, board);
    reads.set(comboKey(entry.combo[0], entry.combo[1]), read);
    totalMass += entry.weight;

    let madeBucket = madeBuckets.get(read.made);
    if (!madeBucket) {
      madeBucket = emptyBucket();
      madeBuckets.set(read.made, madeBucket);
    }
    addToBucket(madeBucket, entry);

    for (const tag of read.draws) {
      let drawBucket = drawBuckets.get(tag);
      if (!drawBucket) {
        drawBucket = emptyBucket();
        drawBuckets.set(tag, drawBucket);
      }
      addToBucket(drawBucket, entry);
    }

    if (read.draws.length > 0) {
      drawCombos += 1;
      drawMass += entry.weight;
    }
  }

  return {
    made: toRows(madeBuckets, MADE_ORDER),
    draws: toRows(drawBuckets, DRAW_ORDER),
    totalCombos: combos.length,
    totalMass,
    drawCombos,
    drawMass,
    reads,
  };
}

/**
 * OU dentro do grupo, E entre grupos — a "leitura util" da spec.
 *
 * `top par` + `flush draw` acende so quem e top par E tem flush draw, que e a
 * pergunta "qual parte do meu top par tem backup". OU entre grupos acenderia
 * todo top par e todo flush draw, e a pergunta deixaria de ser respondida.
 *
 * Grupo vazio significa "sem restricao", nao "nada selecionado".
 */
export function comboPassesFilter(read: HandRead, filter: ReadFilter): boolean {
  if (filter.made.size > 0 && !filter.made.has(read.made)) return false;
  if (filter.draws.size > 0 && !read.draws.some((tag) => filter.draws.has(tag))) return false;
  return true;
}

/**
 * Notacao da celula da matriz 13x13: "TT", "A7s", "A7o".
 *
 * A celula e a CLASSE, nao o combo: os quatro combos de `A7s` caem na mesma.
 */
export function comboClass(combo: [Card, Card]): string {
  const [hi, lo] = combo[0].rank >= combo[1].rank ? combo : [combo[1], combo[0]];
  const hiChar = rankChar(hi.rank);
  const loChar = rankChar(lo.rank);
  if (hi.rank === lo.rank) return `${hiChar}${loChar}`;
  return `${hiChar}${loChar}${hi.suit === lo.suit ? "s" : "o"}`;
}

/**
 * Quais celulas da matriz o filtro acende, com a contagem por celula.
 *
 * A celula acende com UM combo que passe; o tooltip diz "X de Y" porque uma
 * classe tem ate 4 combos e o card removal pode ter comido alguns. O rodape
 * global conta COMBOS, nao classes.
 */
export function buildHighlight(
  combos: ReadCombo[],
  board: Card[],
  filter: ReadFilter,
): HighlightResult {
  const perCell = new Map<string, { passing: number; total: number }>();
  const cells = new Set<string>();
  let passingCombos = 0;

  for (const entry of combos) {
    const cell = comboClass(entry.combo);
    let counts = perCell.get(cell);
    if (!counts) {
      counts = { passing: 0, total: 0 };
      perCell.set(cell, counts);
    }
    counts.total += 1;

    if (comboPassesFilter(classifyCombo(entry.combo, board), filter)) {
      counts.passing += 1;
      passingCombos += 1;
      cells.add(cell);
    }
  }

  return { cells, perCell, passingCombos, totalCombos: combos.length };
}
