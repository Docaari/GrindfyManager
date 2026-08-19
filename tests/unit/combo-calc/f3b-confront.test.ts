// F3b — `confront.ts`: quem esta na frente, com qual metodo e sobre qual base.
// Spec  : Docs/specs/range-lab/F3b-decisao.md (RF-03.3, RF-03.4, F-4)
// ADR   : Docs/architecture/decisions/249-range-lab-f3b-decisao.md
//         (D-F3-24 os quatro baldes, D-F3-25 a base declarada)
//
// O QUE ESTE ARQUIVO PROTEGE
//
// 1. A SEGUNDA CONDICAO DA BASE (D-F3-25). `discrete` exige river E heroi de mao
//    unica. No river com heroi como RANGE a equity por combo do vilao volta a ser
//    continua, e uma "contagem de combos que perdem" seria inventada — foi assim
//    que o `breakevenFrequency` da F0 anunciou 0,42 contra 0,20 real (D11).
// 2. O QUARTO BALDE. Combo com `equity: null` vai para `unknown`, NUNCA para
//    `bluff`. Zero disfarcado de blefe infla os blefes dele e vira o veredito de
//    "da pra foldar mais" para "pague mais largo" — o erro da D8 com outro nome.
// 3. OS DOIS METODOS CONCORDAM onde tem que concordar. No river com heroi de mao
//    unica, classificar por showdown e classificar por equity em {0, 0,5, 1} tem
//    de dar os mesmos tres baldes. Um teste, dois caminhos, mesma resposta.
//
// AMBIGUIDADE DECLARADA: o ADR nao define COMO a massa de cada balde e calculada
// sob `basis: "effective"` (F-4 diz apenas que o rotulo passa a ser "massa
// efetiva"). Este arquivo NAO inventa a formula: trava o que esta escrito — a
// base viaja no resultado, a classificacao nao muda com ela, e `totalMass`
// continua sendo a massa DECLARADA. A definicao da massa efetiva por balde
// precisa de emenda ao ADR, nao de chute do teste.
import { describe, it, expect } from "vitest";
import { decisionBasis, confrontNow, splitByConfrontation } from "@/lib/combo-calc/confront";
import type { ConfrontRow } from "@/lib/combo-calc/confront";
import { compareHands, evaluateHand } from "@/lib/combo-calc/evaluator";
import { boardDeadSet, expandRangeV2 } from "@/lib/combo-calc/engine/expand";
import { comboKey } from "@/lib/combo-calc/cards";
import type { Card } from "@/lib/combo-calc/types";
import {
  EPS,
  V3B_RIVER,
  V3B_RIVER_HERO_RANGE,
  V3B_FLOP_ONE_BLOCKED,
  RIVER_HERO,
  aliveVillainRows,
  blockedVillainRows,
  cards,
  hole,
  label,
  rangeFromTokens,
  runExact,
} from "./f3b-fixtures";
import { V2_FLOP, V2_TURN, V2_RIVER } from "./f1-fixtures";

const RIVER_BOARD = cards("Ah 7d 2c Ks 9h");
const FLOP_BOARD = cards("Ah 7d 2c");
const TURN_BOARD = cards("Ah 7d 2c 9h");

/** Oraculo lento e independente: quem ganha o showdown no bordo de agora. */
function oracle(
  hero: readonly [Card, Card],
  villain: readonly [Card, Card],
  board: readonly Card[],
): "value" | "bluff" | "chop" {
  const cmp = compareHands(evaluateHand([...villain, ...board]), evaluateHand([...hero, ...board]));
  return cmp > 0 ? "value" : cmp === 0 ? "chop" : "bluff";
}

function rowsFrom(rows: readonly { combo: [Card, Card]; weight: number; equity: number | null }[]): ConfrontRow[] {
  return rows.map((r) => ({ combo: r.combo, weight: r.weight, equity: r.equity }));
}

// ── base declarada ───────────────────────────────────────────

describe("F3b D-F3-25 — a base sai do RESULTADO, e exige as DUAS condicoes", () => {
  it("river com heroi de mao unica: discrete", () => {
    const result = runExact(V3B_RIVER, "river mao unica");
    const out = decisionBasis(result, RIVER_BOARD);
    expect(out.basis).toBe("discrete");
    expect(out.heroCombos).toBe(1);
  });

  it("river com heroi como RANGE: effective — o caso que a segunda condicao pega", () => {
    // Sem esta condicao, a cascata mentiria no river em modo range exatamente
    // como o `breakevenFrequency` mentia no flop.
    const result = runExact(V3B_RIVER_HERO_RANGE, "river range");
    const out = decisionBasis(result, RIVER_BOARD);
    expect(
      out.basis,
      "com mais de um combo do heroi a equity por combo do vilao volta a ser continua",
    ).toBe("effective");
    expect(out.heroCombos).toBe(result.perHeroCombo.length);
    expect(out.heroCombos).toBeGreaterThan(1);
  });

  it("flop com heroi de mao unica: effective", () => {
    const result = runExact(V3B_FLOP_ONE_BLOCKED, "flop mao unica");
    expect(decisionBasis(result, FLOP_BOARD).basis).toBe("effective");
  });

  it("turn com heroi de mao unica: effective", () => {
    const result = runExact({ ...V3B_FLOP_ONE_BLOCKED, board: TURN_BOARD }, "turn");
    expect(decisionBasis(result, TURN_BOARD).basis).toBe("effective");
  });

  it("os spots de referencia da F1 respeitam a mesma regra", () => {
    expect(decisionBasis(runExact(V2_FLOP, "F1 flop"), V2_FLOP.board).basis).toBe("effective");
    expect(decisionBasis(runExact(V2_TURN, "F1 turn"), V2_TURN.board).basis).toBe("effective");
    expect(decisionBasis(runExact(V2_RIVER, "F1 river"), V2_RIVER.board).basis).toBe("discrete");
  });

  it("quem manda e perHeroCombo, nao o tamanho do range declarado", () => {
    // `AKs` e UMA entry, mas quatro combos. O predicado le o range EXPANDIDO —
    // o toggle "Minha mao" da tela e superficie e nao pode decidir isto.
    const spot = { ...V3B_RIVER, heroRange: rangeFromTokens(["AKs"]) };
    const result = runExact(spot, "river com AKs");
    const out = decisionBasis(result, RIVER_BOARD);
    expect(out.heroCombos).toBeGreaterThan(1);
    expect(out.basis).toBe("effective");
  });
});

// ── confronto no bordo de agora ──────────────────────────────

describe("F3b D-F3-24 — confrontNow diz o RESULTADO contra a sua mao, nao a intencao dele", () => {
  const HERO = RIVER_HERO; // As Kd -> dois pares no river de referencia

  it("river: quem bate o heroi e value", () => {
    expect(confrontNow(HERO, hole("7h", "7s"), RIVER_BOARD)).toBe("value");
  });

  it("river: quem perde e blefe", () => {
    expect(confrontNow(HERO, hole("Qh", "Qd"), RIVER_BOARD)).toBe("bluff");
  });

  it("river: empate e chop, terceira contagem", () => {
    expect(confrontNow(HERO, hole("Ad", "Kh"), RIVER_BOARD)).toBe("chop");
  });

  it("aceita bordo de 3 cartas (5 no total) sem inventar carta", () => {
    expect(confrontNow(HERO, hole("Qh", "Qd"), FLOP_BOARD)).toBe(
      oracle(HERO, hole("Qh", "Qd"), FLOP_BOARD),
    );
  });

  it("aceita bordo de 4 cartas (6 no total)", () => {
    expect(confrontNow(HERO, hole("7h", "7s"), TURN_BOARD)).toBe(
      oracle(HERO, hole("7h", "7s"), TURN_BOARD),
    );
  });

  it("o par IMPOSSIVEL e avaliavel: cada mao de 7 e legal em si (D-F3-27)", () => {
    // Heroi `As Kd` contra vilao `As Qs` e um estado impossivel do baralho, mas
    // nao ha avaliacao de 9 cartas em lugar nenhum — sao duas maos separadas.
    expect(() => confrontNow(HERO, hole("As", "Qs"), RIVER_BOARD)).not.toThrow();
    expect(confrontNow(HERO, hole("As", "Qs"), RIVER_BOARD)).toBe(
      oracle(HERO, hole("As", "Qs"), RIVER_BOARD),
    );
    expect(confrontNow(HERO, hole("As", "Kd"), RIVER_BOARD)).toBe("chop");
  });

  it("concorda com o oraculo lento num range inteiro, nos tres bordos", () => {
    const range = rangeFromTokens(["22+", "A2s+", "KTs+", "QJs", "JTs", "AQo+", "KQo"]);
    for (const board of [FLOP_BOARD, TURN_BOARD, RIVER_BOARD]) {
      const expanded = expandRangeV2(range, boardDeadSet(board as Card[]));
      let conferidos = 0;
      for (const c of expanded.combos) {
        const esperado = oracle(HERO, c.combo, board);
        expect(
          confrontNow(HERO, c.combo, board),
          `bordo [${label(board)}] contra ${comboKey(c.combo[0], c.combo[1])}`,
        ).toBe(esperado);
        conferidos++;
      }
      expect(conferidos, "o range nao expandiu nada neste bordo").toBeGreaterThan(50);
    }
  });
});

// ── separacao em baldes ──────────────────────────────────────

describe("F3b D-F3-24 — splitByConfrontation escolhe o metodo pelo heroi recebido", () => {
  it("heroi presente -> showdown_now", () => {
    const split = splitByConfrontation({
      hero: RIVER_HERO,
      rows: [{ combo: hole("7h", "7s"), weight: 1, equity: null }],
      board: RIVER_BOARD,
      basis: "discrete",
    });
    expect(split.method).toBe("showdown_now");
  });

  it("heroi null -> equity_vs_range", () => {
    const split = splitByConfrontation({
      hero: null,
      rows: [{ combo: hole("7h", "7s"), weight: 1, equity: 0.8 }],
      board: RIVER_BOARD,
      basis: "effective",
    });
    expect(
      split.method,
      "sem 'a sua mao' o showdown nao existe; o criterio passa a ser a equity",
    ).toBe("equity_vs_range");
  });

  it("a base recebida viaja no resultado, os dois metodos", () => {
    for (const basis of ["discrete", "effective"] as const) {
      for (const hero of [RIVER_HERO, null]) {
        const split = splitByConfrontation({
          hero,
          rows: [{ combo: hole("7h", "7s"), weight: 1, equity: 0.8 }],
          board: RIVER_BOARD,
          basis,
        });
        expect(split.basis).toBe(basis);
      }
    }
  });

  it("equity_vs_range corta em 0,5: acima value, abaixo blefe, exatamente 0,5 chop", () => {
    const split = splitByConfrontation({
      hero: null,
      rows: [
        { combo: hole("7h", "7s"), weight: 1, equity: 0.51 },
        { combo: hole("Qh", "Qd"), weight: 2, equity: 0.49 },
        { combo: hole("Ad", "Kh"), weight: 4, equity: 0.5 },
      ],
      board: RIVER_BOARD,
      basis: "discrete",
    });
    expect(split.value.combos).toBe(1);
    expect(split.value.mass).toBe(1);
    expect(split.bluff.combos).toBe(1);
    expect(split.bluff.mass).toBe(2);
    expect(split.chop.combos).toBe(1);
    expect(split.chop.mass).toBe(4);
    expect(split.unknown.combos).toBe(0);
  });

  it("combo sem numero vai para unknown e NAO engorda o blefe (D-F3-24)", () => {
    const base: ConfrontRow[] = [
      { combo: hole("7h", "7s"), weight: 3, equity: 0.9 },
      { combo: hole("Qh", "Qd"), weight: 2, equity: 0.1 },
    ];
    const semNulo = splitByConfrontation({
      hero: null,
      rows: base,
      board: RIVER_BOARD,
      basis: "discrete",
    });
    const comNulo = splitByConfrontation({
      hero: null,
      rows: [...base, { combo: hole("Jc", "Jd"), weight: 5, equity: null }],
      board: RIVER_BOARD,
      basis: "discrete",
    });

    expect(comNulo.unknown.combos).toBe(1);
    expect(comNulo.unknown.mass).toBe(5);
    expect(
      comNulo.bluff.mass,
      "o combo sem amostra foi parar no balde de blefe: e o erro que vira o veredito",
    ).toBe(semNulo.bluff.mass);
    expect(comNulo.value.mass).toBe(semNulo.value.mass);
  });

  it("no showdown_now a equity nao decide nada: `null` continua classificado", () => {
    // E o que o painel de bloqueadores exige. Os combos bloqueados TEM `equity:
    // null` por construcao (`pairMass` 0) e mesmo assim precisam sair separados
    // em "value removido" e "blefe removido".
    const split = splitByConfrontation({
      hero: RIVER_HERO,
      rows: [
        { combo: hole("As", "Qs"), weight: 1, equity: null },
        { combo: hole("Kd", "Qd"), weight: 1, equity: null },
        { combo: hole("As", "Kd"), weight: 1, equity: null },
      ],
      board: RIVER_BOARD,
      basis: "discrete",
    });
    expect(
      split.unknown.mass,
      "no showdown as cartas decidem; mandar tudo para unknown apagaria o painel de bloqueadores",
    ).toBe(0);
    expect(split.bluff.combos).toBe(2); // AsQs e KdQd perdem para os dois pares
    expect(split.chop.combos).toBe(1); // AsKd e a mesma mao
    expect(split.value.combos).toBe(0);
  });

  it("na base discrete os quatro baldes particionam a massa declarada", () => {
    const rows: ConfrontRow[] = [
      { combo: hole("7h", "7s"), weight: 1, equity: 0.9 },
      { combo: hole("Qh", "Qd"), weight: 2, equity: 0.1 },
      { combo: hole("Ad", "Kh"), weight: 0.5, equity: 0.5 },
      { combo: hole("Jc", "Jd"), weight: 0.25, equity: null },
    ];
    const split = splitByConfrontation({
      hero: null,
      rows,
      board: RIVER_BOARD,
      basis: "discrete",
    });
    const soma = split.value.mass + split.bluff.mass + split.chop.mass + split.unknown.mass;
    expect(Math.abs(soma - split.totalMass)).toBeLessThan(EPS);
    expect(Math.abs(split.totalMass - 3.75)).toBeLessThan(EPS);
  });

  it("totalMass e a massa DECLARADA nas duas bases", () => {
    // O painel divide por ele e a cascata compara com ele. Se `effective` mexesse
    // no denominador, os dois paineis passariam a contar coisas diferentes.
    const rows: ConfrontRow[] = [
      { combo: hole("7h", "7s"), weight: 1, equity: 0.9 },
      { combo: hole("Qh", "Qd"), weight: 2, equity: 0.1 },
    ];
    for (const basis of ["discrete", "effective"] as const) {
      const split = splitByConfrontation({ hero: null, rows, board: RIVER_BOARD, basis });
      expect(Math.abs(split.totalMass - 3), `base ${basis}`).toBeLessThan(EPS);
    }
  });

  it("a base muda a MASSA, nunca em qual balde o combo cai", () => {
    const rows: ConfrontRow[] = [
      { combo: hole("7h", "7s"), weight: 1, equity: 0.9 },
      { combo: hole("Qh", "Qd"), weight: 2, equity: 0.1 },
      { combo: hole("Ad", "Kh"), weight: 1, equity: 0.5 },
      { combo: hole("Jc", "Jd"), weight: 1, equity: null },
    ];
    const discreto = splitByConfrontation({
      hero: null,
      rows,
      board: RIVER_BOARD,
      basis: "discrete",
    });
    const efetivo = splitByConfrontation({
      hero: null,
      rows,
      board: RIVER_BOARD,
      basis: "effective",
    });
    for (const balde of ["value", "bluff", "chop", "unknown"] as const) {
      expect(
        efetivo[balde].combos,
        `balde ${balde}: a classificacao mudou com a base — base e unidade de massa, nao criterio`,
      ).toBe(discreto[balde].combos);
    }
  });

  it("lista vazia devolve zeros, nao NaN", () => {
    const split = splitByConfrontation({
      hero: RIVER_HERO,
      rows: [],
      board: RIVER_BOARD,
      basis: "discrete",
    });
    expect(split.totalMass).toBe(0);
    for (const balde of ["value", "bluff", "chop", "unknown"] as const) {
      expect(split[balde].combos).toBe(0);
      expect(split[balde].mass).toBe(0);
    }
  });
});

// ── os dois metodos, o mesmo river ───────────────────────────

describe("F3b — no river com mao unica, showdown e equity produzem os MESMOS baldes", () => {
  it("um teste, dois caminhos, mesma resposta", () => {
    const result = runExact(V3B_RIVER, "cruzamento de metodo");
    const vivos = rowsFrom(aliveVillainRows(result));
    expect(vivos.length, "o fixture perdeu os combos vivos").toBe(3);
    for (const row of vivos) {
      expect(
        [0, 0.5, 1],
        `no river a equity por combo so pode ser 0, 0,5 ou 1 — veio ${row.equity}`,
      ).toContain(row.equity);
    }

    const porShowdown = splitByConfrontation({
      hero: RIVER_HERO,
      rows: vivos,
      board: RIVER_BOARD,
      basis: "discrete",
    });
    const porEquity = splitByConfrontation({
      hero: null,
      rows: vivos,
      board: RIVER_BOARD,
      basis: "discrete",
    });

    expect(porShowdown.method).toBe("showdown_now");
    expect(porEquity.method).toBe("equity_vs_range");
    for (const balde of ["value", "bluff", "chop", "unknown"] as const) {
      expect(porEquity[balde], `balde ${balde} divergiu entre os dois metodos`).toEqual(
        porShowdown[balde],
      );
    }
  });

  it("o split dos vivos do river bate com a leitura a mao do fixture", () => {
    const result = runExact(V3B_RIVER, "split dos vivos");
    const split = splitByConfrontation({
      hero: RIVER_HERO,
      rows: rowsFrom(aliveVillainRows(result)),
      board: RIVER_BOARD,
      basis: "discrete",
    });
    expect(split.value.combos).toBe(1); // 7h7s, trinca
    expect(split.bluff.combos).toBe(1); // QhQd, par de damas
    expect(split.chop.combos).toBe(1); // AdKh, os mesmos dois pares
    expect(split.unknown.combos).toBe(0);
    expect(split.totalMass).toBe(3);
  });

  it("o split dos BLOQUEADOS existe e nao depende de equity", () => {
    const result = runExact(V3B_RIVER, "split dos bloqueados");
    const bloqueados = blockedVillainRows(result);
    expect(bloqueados).toHaveLength(3);
    for (const row of bloqueados) {
      expect(row.equity, "bloqueado com numero: o motor mudou de contrato").toBeNull();
    }
    const split = splitByConfrontation({
      hero: RIVER_HERO,
      rows: rowsFrom(bloqueados),
      board: RIVER_BOARD,
      basis: "discrete",
    });
    expect(split.bluff.combos).toBe(2);
    expect(split.chop.combos).toBe(1);
    expect(split.unknown.combos).toBe(0);
    expect(split.totalMass).toBe(3);
  });
});
