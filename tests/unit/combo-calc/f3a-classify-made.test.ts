// F3a / RF-03.1 — a mao feita: as 16 categorias, os qualificadores e as flags.
// Spec  : Docs/specs/range-lab/F3a-leitura-categorias.md (criterios 2, 2b, 5, 7)
// Porque: Docs/specs/range-lab/F3-detalhamento.md (secao 3)
// ADR   : Docs/architecture/decisions/248-...-f3a-leitura-categorias.md
//         (D-F3-2, D-F3-3, D-F3-9, D-F3-10, D-F3-15, D-F3-17 e as leituras R1/R2/R3)
// Arvore: Docs/architecture/diagrams/range-lab-f3a/classify-arvore-de-decisao.mermaid
//
// O QUE ESTE ARQUIVO PROTEGE
//
// O avaliador da a FAMILIA; ele nao da a categoria. A subdivisao de par depende de
// ONDE VEIO O PAR, informacao que o score de 5 cartas descarta de proposito. Todo
// teste aqui existe para impedir o mapeamento ingenuo familia -> categoria, que
// escreve "2o par" para uma mao que e as alto — mentira de leitura, nao erro de
// arredondamento.
//
// As tres leituras que o ADR fixou (R1, R2, R3) sao casos de teste explicitos,
// por ordem do proprio ADR ("o test-writer deve tratar R1, R2 e R3 como casos de
// teste explicitos, nao como detalhe de implementacao").
import { describe, it, expect } from "vitest";
import { boardTexture, classifyCombo } from "@/lib/combo-calc/classify";
import type { MadeCategory } from "@/lib/combo-calc/classify";
import { evaluateHand } from "@/lib/combo-calc/evaluator";
import { enumerateCombos, parseNotation } from "@/lib/combo-calc/combos";
import { cardKey } from "@/lib/combo-calc/cards";
import type { Card } from "@/lib/combo-calc/types";
import {
  BOARD_762,
  BOARD_772,
  BOARD_7744,
  BOARD_952,
  BOARD_982,
  BOARD_982_CLUBS,
  BOARD_9876,
  BOARD_AKQ,
  BOARD_FLUSH_TURN,
  BOARD_FLUSH_TURN_ACE,
  BOARD_K94,
  BOARD_KQ9,
  BOARD_Q77,
  BOARD_QUADS_RIVER,
  BOARD_RIVER_5RANKS,
  BOARD_RIVER_BROADWAY,
  BOARD_SET_FD_TURN,
  BOARD_SF_RIVER,
  BOARD_STRAIGHT_RIVER,
  BOARD_777,
  cards,
  hole,
  label,
  wideRange,
} from "./f3a-fixtures";

/** Todos os combos concretos de um range, ja sem as cartas do bordo. */
function allCombos(entries: { notation: string }[], board: Card[]): [Card, Card][] {
  const dead = new Set(board.map(cardKey));
  const seen = new Set<string>();
  const out: [Card, Card][] = [];
  for (const entry of entries) {
    const parsed = parseNotation(entry.notation);
    if (!parsed) continue;
    for (const combo of enumerateCombos(parsed, dead)) {
      const key = cardKey(combo[0]) + cardKey(combo[1]);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(combo);
    }
  }
  return out;
}

/** Mensagem de falha que diz o spot inteiro — sem isso o erro nao localiza nada. */
function spot(h: [Card, Card], board: Card[]): string {
  return `mao ${label(h)} no bordo ${label(board)}`;
}

// ── os tres casos que quebram a versao ingenua ───────────────

describe("F3a criterio 2 / R1 — o par da MESA nao vira o seu par", () => {
  it("AK em Q-7-7 e as alto, nunca segundo par", () => {
    const h = hole("Ah", "Kc");
    const read = classifyCombo(h, BOARD_Q77);

    expect(
      evaluateHand([...BOARD_Q77, ...h]).category,
      "premissa do caso: o avaliador precisa nomear a familia de PAR (1) aqui",
    ).toBe(1);
    expect(
      read.made,
      `${spot(h, BOARD_Q77)}: o par de setes e da mesa — todo mundo tem, ` +
        "e ninguem paga uma aposta achando que tem par",
    ).toBe("ace_high");
    expect(read.made).not.toBe("second_pair");
    expect(read.madeQualifier).toBeNull();
    expect(read.fromPocketPair).toBe(false);
    expect(read.nutKicker).toBe(false);
  });

  it("AK em Q-7-7 sai com usesHoleCards true: a categoria nomeada e ace_high, e o as e dele (R3)", () => {
    const read = classifyCombo(hole("Ah", "Kc"), BOARD_Q77);
    expect(
      read.usesHoleCards,
      "a flag descreve a CATEGORIA NOMEADA (ace_high), nao a familia que o " +
        "avaliador viu: o as que da o nome a categoria e carta do heroi",
    ).toBe(true);
  });

  it("88 no MESMO bordo e dois pares com qualificador with_board_pair", () => {
    const h = hole("8c", "8h");
    const read = classifyCombo(h, BOARD_Q77);

    expect(
      evaluateHand([...BOARD_Q77, ...h]).category,
      "premissa do caso: o avaliador precisa nomear DOIS PARES (familia 2)",
    ).toBe(2);
    expect(
      read.made,
      `${spot(h, BOARD_Q77)}: exigir participacao nos DOIS pares reprovaria este ` +
        "combo e o mandaria para o passo de par, saindo second_pair — o oposto do criterio 2",
    ).toBe("two_pair");
    expect(read.madeQualifier).toBe("with_board_pair");
    expect(read.usesHoleCards).toBe(true);
    expect(read.fromPocketPair).toBe(true);
  });
});

describe("F3a R2 — a trinca inteira da mesa nao e a sua trinca", () => {
  it("AK em 7-7-7 e as alto, nunca trinca", () => {
    const h = hole("Ah", "Kc");
    const read = classifyCombo(h, BOARD_777);

    expect(
      evaluateHand([...BOARD_777, ...h]).category,
      "premissa do caso: familia 3 (trinca) vinda inteira da mesa",
    ).toBe(3);
    expect(
      read.made,
      `${spot(h, BOARD_777)}: trips exige 1 carta do heroi no rank; aqui nao ha nenhuma`,
    ).toBe("ace_high");
    expect(read.made).not.toBe("trips");
    expect(
      read.usesHoleCards,
      "a categoria nomeada e ace_high e o as e do heroi — a trinca da mesa nao " +
        "entra nessa conta",
    ).toBe(true);
  });

  it("com uma carta do rank na mao, a MESMA familia 3 vira trinca", () => {
    const read = classifyCombo(hole("As", "7c"), BOARD_772);
    expect(read.made).toBe("trips");
    expect(read.usesHoleCards).toBe(true);
    expect(read.fromPocketPair).toBe(false);
  });

  it("familia 2 sem participacao do heroi tambem cai no passo de par", () => {
    const h = hole("2s", "2d");
    const read = classifyCombo(h, BOARD_7744);

    expect(
      evaluateHand([...BOARD_7744, ...h]).category,
      "premissa: bordo duplamente pareado nomeia dois pares que sao da MESA",
    ).toBe(2);
    expect(
      read.made,
      `${spot(h, BOARD_7744)}: os dois pares nomeados sao 7 e 4, nenhum e do heroi`,
    ).toBe("underpair");
    expect(read.fromPocketPair).toBe(true);
  });

  it("no mesmo bordo duplamente pareado, participar de UM par ja e dois pares", () => {
    const read = classifyCombo(hole("9s", "9d"), BOARD_7744);
    expect(read.made).toBe("two_pair");
    expect(read.madeQualifier).toBe("with_board_pair");
  });
});

describe("F3a R3 — usesHoleCards descreve a CATEGORIA NOMEADA", () => {
  it("a mesa jogando sozinha sai false; o as que nomeia a categoria sai true", () => {
    // 1. Familia de FORCA formada so pela mesa: a sequencia e sua, mas nenhuma
    //    carta sua entrou nela.
    const naMesa = classifyCombo(hole("2h", "3d"), BOARD_STRAIGHT_RIVER);
    expect(naMesa.made, "sequencia da mesa mantem o nome (D-F3-3)").toBe("straight");
    expect(
      naMesa.usesHoleCards,
      "23 em 5-6-7-8-9: a mesa joga sozinha, e e este o caso que a flag existe para marcar",
    ).toBe(false);

    // 2. Familia de PAR formada so pela mesa, COM o as na mao: o rotulo vira
    //    ace_high e a flag continua false, porque a familia vista foi o par do bordo.
    const parDaMesa = classifyCombo(hole("Ah", "Kc"), BOARD_Q77);
    expect(parDaMesa.made).toBe("ace_high");
    expect(
      parDaMesa.usesHoleCards,
      "AK em Q-7-7: a categoria nomeada e ace_high e o as e dele. A flag responde " +
        "'a categoria nomeada usa carta minha', e nao 'a melhor mao de 5 cartas usa " +
        "carta minha' — sao duas perguntas, e uma flag so nao responde as duas",
    ).toBe(true);
  });

  it("carta alta formada so pela mesa no river tambem sai false", () => {
    const read = classifyCombo(hole("3c", "2d"), BOARD_RIVER_BROADWAY);
    expect(read.made).toBe("no_pair");
    expect(
      read.usesHoleCards,
      "A-K-Q-J-9 na mesa e a melhor mao de 5 cartas; 32 nao entra nela",
    ).toBe(false);
  });

  it("carta alta que USA o as da mao sai true", () => {
    const read = classifyCombo(hole("As", "7d"), BOARD_K94);
    expect(read.made).toBe("ace_high");
    expect(read.usesHoleCards, "A-K-9-7-4: o as e o sete sao dele").toBe(true);
  });

  it("fora do river, usesHoleCards so pode ser false pelo passo de par", () => {
    // Invariante do ADR: bordo de 3 ou 4 cartas nao forma cinco cartas sozinho,
    // entao a unica rota para `false` e o rotulo cair para ace_high / no_pair.
    for (const board of [BOARD_Q77, BOARD_K94, BOARD_9876, BOARD_7744]) {
      for (const combo of allCombos(wideRange(), board)) {
        const read = classifyCombo(combo, board);
        if (read.usesHoleCards) continue;
        expect(
          ["ace_high", "no_pair"],
          `${spot(combo, board)}: saiu usesHoleCards=false com made="${read.made}", ` +
            "mas fora do river so o passo de par pode produzir false",
        ).toContain(read.made);
      }
    }
  });
});

// ── criterio 2b: as tres ruas ────────────────────────────────

describe("F3a criterio 2b — a classificacao roda em bordo de 3, 4 e 5 cartas (D-F3-17)", () => {
  it("nao lanca em nenhuma das tres ruas", () => {
    const flop = cards("Ad 8h 4h");
    const turn = cards("Ad 8h 4h Ks");
    const river = cards("Ad 8h 4h Ks 2c");
    for (const board of [flop, turn, river]) {
      expect(
        () => classifyCombo(hole("As", "6s"), board),
        `bordo de ${board.length} cartas: evaluate7 exige 7 exatas e NAO roda aqui; ` +
          "a rota fechada e evaluateHand (5..7 cartas)",
      ).not.toThrow();
    }
  });

  it("o mesmo top par e reconhecido no flop, no turn e no river", () => {
    const flop = cards("9c 5d 2h");
    const turn = cards("9c 5d 2h 3s");
    const river = cards("9c 5d 2h 3s Jc");
    const h = hole("As", "9d");

    expect(classifyCombo(h, flop).made).toBe("top_pair");
    expect(classifyCombo(h, turn).made).toBe("top_pair");
    expect(
      classifyCombo(h, river).made,
      "no river o J entra no bordo e passa a ser b0 — o rotulo tem que acompanhar",
    ).toBe("second_pair");
  });
});

// ── familia de forca (D-F3-3) ────────────────────────────────

describe("F3a D-F3-3 — familia de forca fica com o nome mesmo quando a mesa joga", () => {
  it("straight flush inteiro da mesa continua straight flush", () => {
    const read = classifyCombo(hole("2c", "3d"), BOARD_SF_RIVER);
    expect(read.made).toBe("straight_flush");
    expect(read.usesHoleCards).toBe(false);
  });

  it("quadra inteira da mesa continua quadra", () => {
    const read = classifyCombo(hole("Kc", "Qd"), BOARD_QUADS_RIVER);
    expect(read.made).toBe("quads");
    expect(read.usesHoleCards).toBe(false);
  });

  it("straight flush com as duas cartas do heroi", () => {
    const read = classifyCombo(hole("6h", "5h"), cards("9h 8h 7h"));
    expect(read.made).toBe("straight_flush");
    expect(read.usesHoleCards).toBe(true);
  });

  it("quadra com uma carta do heroi", () => {
    const read = classifyCombo(hole("7s", "Ad"), cards("7h 7d 7c 2s"));
    expect(read.made).toBe("quads");
    expect(read.usesHoleCards).toBe(true);
  });

  it("full house com par de bolso sobre bordo pareado", () => {
    const read = classifyCombo(hole("2s", "2d"), BOARD_772);
    expect(read.made).toBe("full_house");
    expect(read.usesHoleCards).toBe(true);
  });

  it("sequencia com as duas cartas do heroi", () => {
    const read = classifyCombo(hole("Jd", "Tc"), cards("9c 8d Qs"));
    expect(read.made).toBe("straight");
    expect(read.usesHoleCards).toBe(true);
  });
});

// ── flush: qualificador pelas cartas VIVAS (D-F3-10) ─────────

describe("F3a D-F3-10 — flush nut / strong / weak pela posicao entre as cartas VIVAS", () => {
  it("a maior carta viva do naipe e nut", () => {
    const read = classifyCombo(hole("Ah", "Qh"), BOARD_FLUSH_TURN);
    expect(read.made).toBe("flush");
    expect(read.madeQualifier).toBe("nut");
  });

  it("o K de copas E nut quando o A de copas esta no bordo", () => {
    const read = classifyCombo(hole("Kh", "Qh"), BOARD_FLUSH_TURN_ACE);
    expect(read.made).toBe("flush");
    expect(
      read.madeQualifier,
      "'vivas' significa 'ausentes do bordo': com o As de copas na mesa, " +
        "nao existe flush melhor que o do Kh",
    ).toBe("nut");
  });

  it("segunda e terceira vivas sao strong", () => {
    expect(classifyCombo(hole("Qh", "Jh"), BOARD_FLUSH_TURN).madeQualifier).toBe("strong");
    expect(classifyCombo(hole("Jh", "Th"), BOARD_FLUSH_TURN).madeQualifier).toBe("strong");
  });

  it("da quarta viva para baixo e weak", () => {
    const read = classifyCombo(hole("8h", "7h"), BOARD_FLUSH_TURN);
    expect(read.made).toBe("flush");
    expect(read.madeQualifier).toBe("weak");
  });
});

// ── dois pares: os quatro qualificadores ─────────────────────

describe("F3a RF-03.1 — qualificador de dois pares pela posicao no bordo", () => {
  it("pareia b0 e b1 -> top_two", () => {
    const read = classifyCombo(hole("Ks", "9d"), BOARD_K94);
    expect(read.made).toBe("two_pair");
    expect(read.madeQualifier).toBe("top_two");
  });

  it("pareia b0 e um rank abaixo de b1 -> top_bottom", () => {
    const read = classifyCombo(hole("Ks", "4h"), BOARD_K94);
    expect(read.made).toBe("two_pair");
    expect(read.madeQualifier).toBe("top_bottom");
  });

  it("pareia dois ranks, nenhum deles b0 -> bottom_two", () => {
    const read = classifyCombo(hole("9s", "4h"), BOARD_K94);
    expect(read.made).toBe("two_pair");
    expect(read.madeQualifier).toBe("bottom_two");
  });
});

// ── passo de par: as seis saidas ─────────────────────────────

describe("F3a RF-03.1 — o passo de par com par de bolso", () => {
  it("acima de todos os ranks do bordo -> overpair", () => {
    const read = classifyCombo(hole("As", "Ad"), BOARD_K94);
    expect(read.made).toBe("overpair");
    expect(read.madeQualifier).toBeNull();
    expect(read.fromPocketPair).toBe(true);
  });

  it("abaixo de TODOS os ranks do bordo -> underpair", () => {
    const read = classifyCombo(hole("2s", "2d"), BOARD_KQ9);
    expect(read.made).toBe("underpair");
    expect(read.fromPocketPair).toBe(true);
  });

  it("no meio -> nth par pelo higherCount, e o kicker sai NULO", () => {
    const segundo = classifyCombo(hole("Ts", "Td"), BOARD_K94);
    expect(segundo.made).toBe("second_pair");
    expect(
      segundo.madeQualifier,
      "as duas cartas SAO o par: nao ha kicker. `k_weak` aqui seria um rotulo inventado",
    ).toBeNull();
    expect(
      segundo.fromPocketPair,
      "e a flag que permite a tela escrever 'TT de bolso = 2o par' " +
        "em vez de deixar o jogador adivinhar por que nao ha kicker",
    ).toBe(true);

    const terceiro = classifyCombo(hole("8s", "8d"), BOARD_K94);
    expect(terceiro.made).toBe("third_pair");
    expect(terceiro.madeQualifier).toBeNull();
    expect(terceiro.fromPocketPair).toBe(true);

    const fraco = classifyCombo(hole("5s", "5d"), BOARD_RIVER_5RANKS);
    expect(fraco.made).toBe("weak_pair");
    expect(fraco.madeQualifier).toBeNull();
    expect(fraco.fromPocketPair).toBe(true);
  });
});

describe("F3a RF-03.1 — o passo de par pareando o bordo", () => {
  it("pareia b0 -> top_pair", () => {
    expect(classifyCombo(hole("As", "9d"), BOARD_952).made).toBe("top_pair");
  });

  it("higherCount 1, 2 e >=3 -> segundo, terceiro e par fraco", () => {
    expect(classifyCombo(hole("9s", "2c"), BOARD_K94).made).toBe("second_pair");
    expect(classifyCombo(hole("4s", "Qd"), BOARD_K94).made).toBe("third_pair");
    expect(classifyCombo(hole("7d", "2s"), BOARD_RIVER_5RANKS).made).toBe("weak_pair");
  });

  it("sem par proprio e sem as -> no_pair; com as -> ace_high", () => {
    expect(classifyCombo(hole("8s", "7d"), BOARD_K94).made).toBe("no_pair");
    expect(classifyCombo(hole("As", "7d"), BOARD_K94).made).toBe("ace_high");
  });
});

// ── kicker: banda absoluta + marca de nut (D-F3-9 + D-F3-15) ─

describe("F3a D-F3-9 — kicker em banda ABSOLUTA, declarada como banda fixa", () => {
  it("A e K sao k_top", () => {
    expect(classifyCombo(hole("As", "9d"), BOARD_952).madeQualifier).toBe("k_top");
    expect(classifyCombo(hole("Ks", "9d"), BOARD_952).madeQualifier).toBe("k_top");
  });

  it("Q, J e T sao k_good", () => {
    for (const k of ["Qs", "Js", "Ts"]) {
      const read = classifyCombo(hole(k, "9d"), BOARD_952);
      expect(read.madeQualifier, `kicker ${k}`).toBe("k_good");
    }
  });

  it("9 ou menor e k_weak", () => {
    expect(classifyCombo(hole("7s", "9d"), BOARD_952).madeQualifier).toBe("k_weak");
    expect(classifyCombo(hole("3s", "9d"), BOARD_952).madeQualifier).toBe("k_weak");
  });

  it("trinca tambem carrega kicker", () => {
    expect(classifyCombo(hole("As", "7c"), BOARD_772).madeQualifier).toBe("k_top");
    expect(classifyCombo(hole("4s", "7c"), BOARD_772).madeQualifier).toBe("k_weak");
  });
});

describe("F3a D-F3-15 / criterio 5 — nutKicker resolve AJ em A-K-Q sem trocar a banda", () => {
  it("AJ em A-K-Q sai top_pair, banda k_good e nutKicker true", () => {
    const h = hole("As", "Jd");
    const read = classifyCombo(h, BOARD_AKQ);

    expect(read.made, spot(h, BOARD_AKQ)).toBe("top_pair");
    expect(
      read.madeQualifier,
      "a banda e ABSOLUTA: o J esta na faixa Q/J/T, entao k_good. " +
        "A marca de nut resolve o caso sem mexer na banda",
    ).toBe("k_good");
    expect(
      read.nutKicker,
      "K ou Q nao dariam um top par melhor, dariam DOIS PARES: " +
        "o J e o melhor kicker possivel neste bordo",
    ).toBe(true);
  });

  it("o kicker so e nut quando e o MAIOR rank ausente do bordo", () => {
    // Bordo 9-5-2: o maior rank ausente e o A.
    expect(classifyCombo(hole("As", "9d"), BOARD_952).nutKicker).toBe(true);
    expect(classifyCombo(hole("Ks", "9d"), BOARD_952).nutKicker).toBe(false);
    expect(classifyCombo(hole("Qs", "9d"), BOARD_952).nutKicker).toBe(false);
  });

  it("categoria sem kicker nunca marca nutKicker", () => {
    for (const read of [
      classifyCombo(hole("As", "Ad"), BOARD_K94), // overpair
      classifyCombo(hole("Ts", "Td"), BOARD_K94), // second_pair de bolso
      classifyCombo(hole("Ah", "Qh"), BOARD_FLUSH_TURN), // flush
    ]) {
      expect(read.nutKicker, `made=${read.made} nao tem kicker para ser nut`).toBe(false);
    }
  });
});

// ── invariantes de tipo (D-F3-4: `made` e particao) ──────────

const ALL_MADE: MadeCategory[] = [
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

describe("F3a D-F3-4 — `made` e sempre exatamente UM valor da taxonomia", () => {
  it("toda leitura devolve uma categoria conhecida e um array de draws", () => {
    for (const board of [BOARD_Q77, BOARD_K94, BOARD_9876, BOARD_RIVER_5RANKS]) {
      for (const combo of allCombos(wideRange(), board)) {
        const read = classifyCombo(combo, board);
        expect(ALL_MADE, `${spot(combo, board)}: categoria fora da taxonomia`).toContain(read.made);
        expect(Array.isArray(read.draws), `${spot(combo, board)}: draws precisa ser array`).toBe(
          true,
        );
      }
    }
  });

  it("fromPocketPair nunca e true para uma mao que nao e par de bolso", () => {
    for (const board of [BOARD_Q77, BOARD_K94, BOARD_982]) {
      for (const combo of allCombos(wideRange(), board)) {
        const read = classifyCombo(combo, board);
        if (!read.fromPocketPair) continue;
        expect(
          combo[0].rank,
          `${spot(combo, board)}: fromPocketPair=true numa mao de ranks diferentes`,
        ).toBe(combo[1].rank);
      }
    }
  });

  it("set exige par de bolso do rank presente no bordo", () => {
    const read = classifyCombo(hole("8h", "8s"), BOARD_SET_FD_TURN);
    expect(read.made).toBe("set");
    expect(read.fromPocketPair).toBe(true);
    expect(read.madeQualifier).toBeNull();
  });
});

// ── criterio 7: consistencia com o oraculo (D4 / D-F3-17) ────

describe("F3a criterio 7 — classify concorda com evaluator.ts na familia", () => {
  /** Familia que cada categoria de FORCA obriga (a ida e a volta valem). */
  const FORCE_FAMILY: Partial<Record<MadeCategory, number>> = {
    straight_flush: 8,
    quads: 7,
    full_house: 6,
    flush: 5,
    straight: 4,
  };

  it("as cinco familias de forca sao bijetivas com o rotulo", () => {
    for (const board of [BOARD_Q77, BOARD_K94, BOARD_9876, BOARD_RIVER_5RANKS, BOARD_FLUSH_TURN]) {
      for (const combo of allCombos(wideRange(), board)) {
        const read = classifyCombo(combo, board);
        const family = evaluateHand([...board, ...combo]).category;
        const expected = FORCE_FAMILY[read.made];

        if (expected !== undefined) {
          expect(
            family,
            `${spot(combo, board)}: rotulo "${read.made}" exige familia ${expected}, veio ${family}`,
          ).toBe(expected);
        }
        if (family >= 4) {
          expect(
            expected,
            `${spot(combo, board)}: familia ${family} e de FORCA e mantem o nome (D-F3-3), ` +
              `mas o rotulo veio "${read.made}"`,
          ).toBe(family);
        }
      }
    }
  });

  it("set e trips so saem da familia 3; two_pair so da familia 2", () => {
    for (const board of [BOARD_Q77, BOARD_772, BOARD_7744, BOARD_K94]) {
      for (const combo of allCombos(wideRange(), board)) {
        const read = classifyCombo(combo, board);
        const family = evaluateHand([...board, ...combo]).category;
        if (read.made === "set" || read.made === "trips") {
          expect(family, `${spot(combo, board)}: "${read.made}" fora da familia 3`).toBe(3);
        }
        if (read.made === "two_pair") {
          expect(family, `${spot(combo, board)}: two_pair fora da familia 2`).toBe(2);
        }
      }
    }
  });

  it("categoria de par so aparece nas familias 0 a 3", () => {
    const PAIR_STEP: MadeCategory[] = [
      "overpair",
      "top_pair",
      "second_pair",
      "third_pair",
      "weak_pair",
      "underpair",
      "ace_high",
      "no_pair",
    ];
    for (const board of [BOARD_Q77, BOARD_K94, BOARD_9876]) {
      for (const combo of allCombos(wideRange(), board)) {
        const read = classifyCombo(combo, board);
        if (!PAIR_STEP.includes(read.made)) continue;
        const family = evaluateHand([...board, ...combo]).category;
        expect(
          family,
          `${spot(combo, board)}: "${read.made}" saiu da familia ${family}`,
        ).toBeLessThanOrEqual(3);
      }
    }
  });
});

// ── textura do bordo (emenda A15) ────────────────────────────

describe("F3a A15 — boardTexture tem duas dimensoes INDEPENDENTES", () => {
  it("a dimensao de naipe conta o maior numero de cartas do mesmo naipe", () => {
    expect(boardTexture(BOARD_K94).suitedMax).toBe(1);
    expect(boardTexture(BOARD_K94).suit).toBe("rainbow");

    expect(boardTexture(BOARD_982_CLUBS).suitedMax).toBe(2);
    expect(boardTexture(BOARD_982_CLUBS).suit).toBe("2flush");

    expect(boardTexture(cards("9h 8h 2h")).suitedMax).toBe(3);
    expect(boardTexture(cards("9h 8h 2h")).suit).toBe("monotone");

    expect(boardTexture(cards("9h 8h 2h Kh")).suitedMax).toBe(4);
    expect(boardTexture(cards("9h 8h 2h Kh 3h")).suitedMax).toBe(5);
  });

  it("os cinco rotulos de naipe sao distintos entre si", () => {
    const rotulos = new Set(
      [
        BOARD_K94,
        BOARD_982_CLUBS,
        cards("9h 8h 2h"),
        cards("9h 8h 2h Kh"),
        cards("9h 8h 2h Kh 3h"),
      ].map((b) => boardTexture(b).suit),
    );
    expect(rotulos.size, "dois bordos de naipe diferente sairam com o mesmo rotulo").toBe(5);
  });

  it("a dimensao de pareamento vai de unpaired a quads", () => {
    expect(boardTexture(BOARD_K94).pairing).toBe("unpaired");
    expect(boardTexture(BOARD_Q77).pairing).toBe("paired");
    expect(boardTexture(BOARD_777).pairing).toBe("trips");
    expect(boardTexture(BOARD_QUADS_RIVER).pairing).toBe("quads");
    expect(
      boardTexture(BOARD_7744).pairing,
      "bordo duplamente pareado continua 'paired' — a dimensao tem quatro valores, nao cinco",
    ).toBe("paired");
  });

  it("as duas dimensoes nao se contaminam", () => {
    const monotonePareado = boardTexture(cards("7h 7d 2h Kh"));
    expect(monotonePareado.suitedMax).toBe(3);
    expect(monotonePareado.pairing).toBe("paired");

    const rainbowSemPar = boardTexture(BOARD_762);
    expect(rainbowSemPar.suit).toBe("rainbow");
    expect(rainbowSemPar.pairing).toBe("unpaired");
  });
});
