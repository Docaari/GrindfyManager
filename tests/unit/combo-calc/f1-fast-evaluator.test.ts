// F1 / RF-01.1 — avaliador bitmask sem alocacao por chamada.
// Spec: Docs/specs/range-lab/F1-motor.md (RF-01.1)
// ADR : Docs/architecture/decisions/246-range-lab-f1-motor.md (D-F1-1, D-F1-2)
//
// O avaliador antigo (`evaluator.ts`) NAO e deletado: e o oraculo (decisao D4 do
// indice). Este arquivo cobre as tres obrigacoes de teste que nascem do ADR:
//   1. `STRAIGHT_TOP` correta em TODAS as 8192 mascaras;
//   2. `evaluate7(b0..b4,h0,h1) === loadBoard(b0..b4) + evalWithBoard(h0,h1)`;
//   3. paridade de ORDEM (nao de valor) contra `compareHands(evaluateHand(...))`.
//
// Empacotamento do score (D-F1-1), que os testes de desempate leem:
//   score = (categoria << 20) | (r1 << 16) | (r2 << 12) | (r3 << 8) | (r4 << 4) | r5
// com `r` em indice 0..12 (0 = 2, 12 = A) e desempate ausente em 0.
import { describe, it, expect } from "vitest";
import {
  encodeCard,
  decodeCard,
  evaluate7,
  loadBoard,
  evalWithBoard,
  handCategory,
  CATEGORY_MAX,
  STRAIGHT_TOP,
} from "@/lib/combo-calc/fastEvaluator";
import { mulberry32, DEFAULT_SEED } from "@/lib/combo-calc/engine/random";
import {
  CATEGORY,
  compareHands,
  evaluateHand,
} from "@/lib/combo-calc/evaluator";
import { RANKS, SUITS, cardKey, fullDeck, parseCard } from "@/lib/combo-calc/cards";
import type { Card } from "@/lib/combo-calc/types";
import { cards as parseCards, describeCards } from "./f1-fixtures";

// ── helpers locais ───────────────────────────────────────────

function codes(spec: string): number[] {
  return parseCards(spec).map(encodeCard);
}

/** Avalia 7 cartas escritas como texto ("Ah Kh Qh Jh Th 2c 3d"). */
function scoreOf(spec: string): number {
  const c = codes(spec);
  return evaluate7(c[0], c[1], c[2], c[3], c[4], c[5], c[6]);
}

const rankIdxOf = (score: number, slot: 1 | 2 | 3 | 4 | 5): number =>
  (score >>> (20 - slot * 4)) & 0xf;

const RANK_LETTERS = "23456789TJQKA";
const CATEGORY_NAME: Record<number, string> = {
  0: "HIGH_CARD",
  1: "PAIR",
  2: "TWO_PAIR",
  3: "TRIPS",
  4: "STRAIGHT",
  5: "FLUSH",
  6: "FULL_HOUSE",
  7: "QUADS",
  8: "STRAIGHT_FLUSH",
};

// ── encodeCard / decodeCard ──────────────────────────────────

describe("F1 RF-01.1 — codificacao de carta em inteiro", () => {
  it("encodeCard segue (rank - 2) * 4 + indice do naipe em SUITS", () => {
    for (const rank of RANKS) {
      for (const suit of SUITS) {
        const expected = (rank - 2) * 4 + SUITS.indexOf(suit);
        expect(
          encodeCard({ rank, suit }),
          `encodeCard(${RANK_LETTERS[rank - 2]}${suit})`,
        ).toBe(expected);
      }
    }
  });

  it("as 52 cartas produzem 52 codigos distintos dentro de 0..51", () => {
    const seen = new Map<number, string>();
    for (const c of fullDeck()) {
      const code = encodeCard(c);
      expect(code, `codigo de ${cardKey(c)}`).toBeGreaterThanOrEqual(0);
      expect(code, `codigo de ${cardKey(c)}`).toBeLessThanOrEqual(51);
      const previous = seen.get(code);
      expect(
        previous,
        `codigo ${code} colide entre ${previous} e ${cardKey(c)}`,
      ).toBeUndefined();
      seen.set(code, cardKey(c));
    }
    expect(seen.size).toBe(52);
  });

  it("decodeCard devolve a carta original nas 52 (ida e volta)", () => {
    for (const c of fullDeck()) {
      const back = decodeCard(encodeCard(c));
      expect(cardKey(back), `ida e volta de ${cardKey(c)}`).toBe(cardKey(c));
    }
  });
});

// ── STRAIGHT_TOP ─────────────────────────────────────────────

/**
 * Referencia ingenua da tabela: devolve o INDICE do rank alto do straight, 0 se
 * nao houver. A roda (A5432) tem topo no 5 = indice 3, que e o menor topo
 * possivel — por isso 0 e sentinela segura.
 */
function naiveStraightTop(mask: number): number {
  const has = (idx: number) => (mask & (1 << idx)) !== 0;
  for (let top = 12; top >= 4; top--) {
    if (has(top) && has(top - 1) && has(top - 2) && has(top - 3) && has(top - 4)) {
      return top;
    }
  }
  // Roda: A (12) + 5 4 3 2 (3,2,1,0) -> topo 5 = indice 3.
  if (has(12) && has(3) && has(2) && has(1) && has(0)) return 3;
  return 0;
}

describe("F1 RF-01.1 — tabela STRAIGHT_TOP", () => {
  it("tem 8192 posicoes (uma por mascara de 13 ranks)", () => {
    expect(STRAIGHT_TOP.length).toBe(8192);
  });

  it("a roda A5432 (mask 4111) devolve 3 — topo no 5", () => {
    expect(STRAIGHT_TOP[4111]).toBe(3);
  });

  it("broadway devolve 12 — topo no A", () => {
    expect(STRAIGHT_TOP[0b1111100000000]).toBe(12);
  });

  it("straight de 6 alto devolve 4", () => {
    // 6 5 4 3 2 = indices 4,3,2,1,0.
    expect(STRAIGHT_TOP[0b0000000011111]).toBe(4);
  });

  it("mascara sem straight devolve 0", () => {
    // A K Q J 9 — falta o T, nao ha straight.
    const mask = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 7);
    expect(STRAIGHT_TOP[mask]).toBe(0);
    expect(STRAIGHT_TOP[0]).toBe(0);
  });

  it("bate com a referencia ingenua nas 8192 mascaras", () => {
    const divergentes: string[] = [];
    for (let mask = 0; mask < 8192; mask++) {
      const expected = naiveStraightTop(mask);
      if (STRAIGHT_TOP[mask] !== expected) {
        const ranks = [];
        for (let i = 12; i >= 0; i--) if (mask & (1 << i)) ranks.push(RANK_LETTERS[i]);
        divergentes.push(
          `mask ${mask} (${ranks.join("")}): tabela=${STRAIGHT_TOP[mask]} esperado=${expected}`,
        );
        if (divergentes.length >= 5) break;
      }
    }
    expect(divergentes.join(" | ")).toBe("");
  });
});

// ── ordem das categorias ─────────────────────────────────────

describe("F1 RF-01.1 — ordem das 9 categorias por score", () => {
  // Da melhor para a pior. Ordem identica a de `evaluator.ts` (D-F1-1).
  const LADDER: Array<{ label: string; hand: string; category: number }> = [
    { label: "royal flush", hand: "Ah Kh Qh Jh Th 2c 3d", category: CATEGORY.STRAIGHT_FLUSH },
    { label: "roda de naipe", hand: "Ah 2h 3h 4h 5h Kc Qd", category: CATEGORY.STRAIGHT_FLUSH },
    { label: "quadra", hand: "7c 7d 7h 7s Ad 2c 3d", category: CATEGORY.QUADS },
    { label: "full house", hand: "Kc Kd Kh 2c 2d 5s 9h", category: CATEGORY.FULL_HOUSE },
    { label: "flush", hand: "Ah Kh 9h 4h 2h 3c 5d", category: CATEGORY.FLUSH },
    { label: "straight", hand: "4c 5d 6h 7s 8c 2d Ah", category: CATEGORY.STRAIGHT },
    { label: "trinca", hand: "8c 8d 8h Ac Kd 2s 3h", category: CATEGORY.TRIPS },
    { label: "dois pares", hand: "Ac Ad 6c 6d 8h 3s 2c", category: CATEGORY.TWO_PAIR },
    { label: "par", hand: "Ac Ad Kc 9d 5h 3s 2c", category: CATEGORY.PAIR },
    { label: "carta alta", hand: "Ac Kd 9h 7s 5c 3d 2h", category: CATEGORY.HIGH_CARD },
  ];

  it("cada degrau bate mais que o degrau de baixo", () => {
    for (let i = 0; i < LADDER.length - 1; i++) {
      const a = LADDER[i];
      const b = LADDER[i + 1];
      const sa = scoreOf(a.hand);
      const sb = scoreOf(b.hand);
      expect(
        sa > sb,
        `${a.label} (${a.hand}) = ${sa} deveria bater ${b.label} (${b.hand}) = ${sb}`,
      ).toBe(true);
    }
  });

  it("handCategory devolve a mesma categoria que o avaliador antigo", () => {
    for (const { label, hand, category } of LADDER) {
      const got = handCategory(scoreOf(hand));
      expect(
        got,
        `${label} (${hand}): categoria ${CATEGORY_NAME[got] ?? got}, esperado ${CATEGORY_NAME[category]}`,
      ).toBe(category);
      expect(got, `${label}: categoria do oraculo`).toBe(
        evaluateHand(parseCards(hand)).category,
      );
    }
  });

  it("handCategory e score >>> 20 e nunca passa de CATEGORY_MAX", () => {
    expect(CATEGORY_MAX).toBe(8);
    for (const { hand } of LADDER) {
      const s = scoreOf(hand);
      expect(handCategory(s)).toBe(s >>> 20);
      expect(handCategory(s)).toBeLessThanOrEqual(CATEGORY_MAX);
      expect(handCategory(s)).toBeGreaterThanOrEqual(0);
    }
  });

  it("royal flush bate a roda de naipe (mesma categoria, desempate pelo topo)", () => {
    const royal = scoreOf("Ah Kh Qh Jh Th 2c 3d");
    const wheel = scoreOf("Ah 2h 3h 4h 5h Kc Qd");
    expect(handCategory(royal)).toBe(handCategory(wheel));
    expect(rankIdxOf(royal, 1)).toBe(12); // A
    expect(rankIdxOf(wheel, 1)).toBe(3); // 5
    expect(royal).toBeGreaterThan(wheel);
  });
});

// ── o bug medido no prototipo ────────────────────────────────

describe("F1 RF-01.1 — trinca pura nao pode virar full house", () => {
  // O prototipo pegou isto: se o full house calcular `rest = (m3 & ~bit) | m2`,
  // TODA trinca pura vira full house, porque `m2` (ranks vistos ao menos duas
  // vezes) contem o proprio rank da trinca. A forma certa e
  // `rest = (m3 | m2) & ~(1 << t)`.
  const TRIPS_ONLY = [
    "8c 8d 8h Ac Kd 2s 3h",
    "2c 2d 2h Ac Kd 9s 7h",
    "Ac Ad Ah Kc Qd 9s 7h",
    "Tc Td Th 9c 8d 6s 4h",
  ];

  it("7 cartas com uma trinca e nenhum par sao TRINCA, nunca FULL HOUSE", () => {
    for (const hand of TRIPS_ONLY) {
      const got = handCategory(scoreOf(hand));
      expect(
        got,
        `${hand}: saiu ${CATEGORY_NAME[got] ?? got}, esperado TRIPS`,
      ).toBe(CATEGORY.TRIPS);
    }
  });

  it("trinca pura mantem os DOIS kickers no desempate", () => {
    // 888 + A K 3 2 -> trinca 8 (idx 6), kickers A (12) e K (11).
    const s = scoreOf("8c 8d 8h Ac Kd 2s 3h");
    expect(rankIdxOf(s, 1)).toBe(6);
    expect(rankIdxOf(s, 2)).toBe(12);
    expect(rankIdxOf(s, 3)).toBe(11);
  });

  it("full house AAA + KK tem par = K, nao A", () => {
    const s = scoreOf("Ac Ad Ah Kc Kd 2s 3h");
    expect(handCategory(s), "AAA+KK deveria ser FULL_HOUSE").toBe(
      CATEGORY.FULL_HOUSE,
    );
    expect(rankIdxOf(s, 1), "trinca do full house = A (indice 12)").toBe(12);
    expect(
      rankIdxOf(s, 2),
      "par do full house = K (indice 11); 12 significa que o rank da trinca vazou para o par",
    ).toBe(11);
  });

  it("full house com duas trincas usa a maior como trinca (KKK + 999)", () => {
    const s = scoreOf("Kc Kd Kh 9c 9d 9s 2h");
    expect(handCategory(s)).toBe(CATEGORY.FULL_HOUSE);
    expect(rankIdxOf(s, 1)).toBe(11); // K
    expect(rankIdxOf(s, 2)).toBe(7); // 9
  });

  it("AAA + KK bate AAA + QQ (o par decide)", () => {
    expect(scoreOf("Ac Ad Ah Kc Kd 2s 3h")).toBeGreaterThan(
      scoreOf("Ac Ad Ah Qc Qd 2s 3h"),
    );
  });
});

// ── bordo iceado (D-F1-2) ────────────────────────────────────

describe("F1 RF-01.1 — evaluate7 e evalWithBoard concordam sempre", () => {
  const BOARDS = ["Ad 8h 4h 2c 5d", "Ah Kh Qh Jh Th", "7c 7d 7h 2s 3d", "9h 8h 7h 6c 2d"];
  const HOLES = ["As 6s", "Ac Kc", "2h 2d", "6h 5h", "Kd Qd"];

  it("mesmo inteiro para todo par (bordo, mao) amostrado", () => {
    for (const boardSpec of BOARDS) {
      const b = codes(boardSpec);
      for (const holeSpec of HOLES) {
        const h = codes(holeSpec);
        // Pula quando a mao repete carta do bordo (mao impossivel).
        if (h.some((x) => b.includes(x))) continue;
        const direct = evaluate7(b[0], b[1], b[2], b[3], b[4], h[0], h[1]);
        loadBoard(b[0], b[1], b[2], b[3], b[4]);
        const hoisted = evalWithBoard(h[0], h[1]);
        expect(
          hoisted,
          `bordo ${boardSpec} + mao ${holeSpec}: evaluate7=${direct} evalWithBoard=${hoisted}`,
        ).toBe(direct);
      }
    }
  });

  it("loadBoard uma vez serve varias maos seguidas (contexto nao se corrompe)", () => {
    const b = codes("Ad 8h 4h 2c 5d");
    loadBoard(b[0], b[1], b[2], b[3], b[4]);
    const first = evalWithBoard(...(codes("As 6s") as [number, number]));
    evalWithBoard(...(codes("Kc Qc") as [number, number]));
    evalWithBoard(...(codes("7h 7s") as [number, number]));
    const again = evalWithBoard(...(codes("As 6s") as [number, number]));
    expect(again, "a mesma mao no mesmo bordo mudou de score entre chamadas").toBe(
      first,
    );
  });

  it("o score depende do CONJUNTO de 7 cartas, nao da ordem dos argumentos", () => {
    const base = codes("Ad 8h 4h 2c 5d As 6s");
    const expected = evaluate7(base[0], base[1], base[2], base[3], base[4], base[5], base[6]);
    const rng = mulberry32(7);
    for (let attempt = 0; attempt < 20; attempt++) {
      const shuffled = [...base];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const got = evaluate7(
        shuffled[0], shuffled[1], shuffled[2], shuffled[3],
        shuffled[4], shuffled[5], shuffled[6],
      );
      expect(
        got,
        `permutacao ${shuffled.join(",")} mudou o score (${got} != ${expected})`,
      ).toBe(expected);
    }
  });
});

// ── paridade contra o oraculo (criterio de aceite 1) ─────────

describe("F1 RF-01.1 — paridade de ORDEM contra o avaliador antigo", () => {
  it("50.000 maos de 9 cartas com semente fixa, zero divergencia", () => {
    expect(DEFAULT_SEED).toBe(20240815);
    const rng = mulberry32(DEFAULT_SEED);
    const deck: number[] = [];
    for (let i = 0; i < 52; i++) deck.push(i);

    const SAMPLES = 50_000;
    let divergences = 0;
    let firstDivergence = "";

    for (let s = 0; s < SAMPLES; s++) {
      // Fisher-Yates parcial: 9 cartas distintas do baralho de 52.
      for (let i = 0; i < 9; i++) {
        const j = i + Math.floor(rng() * (52 - i));
        const tmp = deck[i];
        deck[i] = deck[j];
        deck[j] = tmp;
      }
      const b0 = deck[0], b1 = deck[1], b2 = deck[2], b3 = deck[3], b4 = deck[4];
      const h0 = deck[5], h1 = deck[6];
      const v0 = deck[7], v1 = deck[8];

      const heroFast = evaluate7(b0, b1, b2, b3, b4, h0, h1);
      const villFast = evaluate7(b0, b1, b2, b3, b4, v0, v1);
      const fastSign = Math.sign(heroFast - villFast);

      const boardCards: Card[] = [b0, b1, b2, b3, b4].map(decodeCard);
      const heroSeven = [...boardCards, decodeCard(h0), decodeCard(h1)];
      const villSeven = [...boardCards, decodeCard(v0), decodeCard(v1)];
      const oracleSign = Math.sign(
        compareHands(evaluateHand(heroSeven), evaluateHand(villSeven)),
      );

      if (fastSign !== oracleSign) {
        divergences++;
        if (!firstDivergence) {
          const hOracle = evaluateHand(heroSeven);
          const vOracle = evaluateHand(villSeven);
          firstDivergence =
            `amostra #${s} | bordo ${describeCards(boardCards)}` +
            ` | heroi ${describeCards([decodeCard(h0), decodeCard(h1)])}` +
            ` | vilao ${describeCards([decodeCard(v0), decodeCard(v1)])}` +
            ` | rapido: ${heroFast} vs ${villFast} (sinal ${fastSign})` +
            ` | oraculo: ${CATEGORY_NAME[hOracle.category]}[${hOracle.tiebreakers.join(",")}]` +
            ` vs ${CATEGORY_NAME[vOracle.category]}[${vOracle.tiebreakers.join(",")}]` +
            ` (sinal ${oracleSign})`;
        }
      }
    }

    expect(
      firstDivergence,
      `${divergences} divergencia(s) em ${SAMPLES} amostras`,
    ).toBe("");
    expect(divergences).toBe(0);
  }, 180_000);

  it("chop do oraculo tambem e chop no avaliador rapido", () => {
    // Bordo 5-6-7-8-9: os dois jogam o straight do bordo.
    const board = "5c 6d 7h 8s 9c";
    const heroSeven = parseCards(`2d 2h ${board}`);
    const villSeven = parseCards(`3c 3d ${board}`);
    expect(compareHands(evaluateHand(heroSeven), evaluateHand(villSeven))).toBe(0);
    expect(scoreOf(`2d 2h ${board}`)).toBe(scoreOf(`3c 3d ${board}`));
  });

  it("parseCard das cartas do oraculo continua sendo a mesma fonte", () => {
    // Guarda barata: se `parseCard` mudar de contrato, o resto deste arquivo mente.
    expect(parseCard("Ah")).toEqual({ rank: 14, suit: "h" });
  });
});
