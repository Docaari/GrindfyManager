// F3a / RF-03.1 + RF-03.7 — agregacao por categoria e o filtro que pinta a matriz.
// Spec  : Docs/specs/range-lab/F3a-leitura-categorias.md (criterios 1 e 6)
// Porque: Docs/specs/range-lab/F3-detalhamento.md (secoes 4.2 e 5)
// ADR   : Docs/architecture/decisions/248-...-f3a-leitura-categorias.md (D-F3-4)
//
// O QUE ESTE ARQUIVO PROTEGE
//
// A soma que produziria 137% precisa ser IMPOSSIVEL DE ESCREVER, e nao "proibida
// por convencao". `made` e particao (soma = massa total) e `draws` e etiqueta
// (soma sem relacao com o total, pode passar dele). Sao dois campos de
// cardinalidade diferente, e por isso o numero bem definido do bloco de draws e
// outro: `combos com >= 1 draw`.
//
// O filtro tem uma regra que a spec chama de "a leitura util": OU dentro do
// grupo, E entre grupos. `top par` + `flush draw` acende so quem e top par E tem
// flush draw — "qual parte do meu top par tem backup".
import { describe, it, expect } from "vitest";
import { buildHighlight, buildRangeRead, comboClass, comboPassesFilter } from "@/lib/combo-calc/read";
import type { ReadCombo, ReadFilter } from "@/lib/combo-calc/read";
import { classifyCombo } from "@/lib/combo-calc/classify";
import type { DrawTag, MadeCategory } from "@/lib/combo-calc/classify";
import { boardDeadSet, expandRangeV2 } from "@/lib/combo-calc/engine/expand";
import { comboKey } from "@/lib/combo-calc/cards";
import type { Card, RangeEntry } from "@/lib/combo-calc/types";
import {
  BOARD_952,
  BOARD_982_CLUBS,
  BOARD_K94,
  BOARD_Q77,
  BOARD_RIVER_5RANKS,
  BOARD_SET_FD_TURN,
  hole,
  label,
  rangeEntry,
  unevenRange,
  wideRange,
} from "./f3a-fixtures";

const EPS = 1e-9;

/**
 * Equity sintetica DETERMINISTICA (sem RNG): 0..1 derivada dos ranks do combo.
 * O ponto do teste e a agregacao, nao a equity — mas ela precisa variar entre
 * combos, senao uma media errada passaria despercebida.
 */
function fakeEquity(combo: [Card, Card]): number {
  return ((combo[0].rank * 7 + combo[1].rank * 3) % 100) / 100;
}

/** Constroi a entrada do `read.ts` a partir do expansor REAL do motor (licao #3). */
function readCombos(
  entries: RangeEntry[],
  board: Card[],
  equityOf: (c: [Card, Card]) => number | null = fakeEquity,
): ReadCombo[] {
  const expanded = expandRangeV2(entries, boardDeadSet(board));
  return expanded.combos.map((c) => ({
    combo: c.combo,
    weight: c.weight,
    equity: equityOf(c.combo),
  }));
}

function emptyFilter(): ReadFilter {
  return { made: new Set<MadeCategory>(), draws: new Set<DrawTag>() };
}

function filterOf(made: MadeCategory[], draws: DrawTag[] = []): ReadFilter {
  return { made: new Set(made), draws: new Set(draws) };
}

// ── criterio 1: mao feita e PARTICAO ─────────────────────────

describe("F3a criterio 1 — a soma das massas por mao feita bate com a massa total", () => {
  const BOARDS = [BOARD_Q77, BOARD_K94, BOARD_952, BOARD_SET_FD_TURN, BOARD_RIVER_5RANKS];

  for (const board of BOARDS) {
    it(`fecha em 1e-9 no bordo ${label(board)}, com pesos desiguais`, () => {
      const combos = readCombos(unevenRange(), board);
      expect(combos.length, "o caso precisa ter combos").toBeGreaterThan(10);

      const read = buildRangeRead(combos, board);
      const somaMassa = read.made.reduce((acc, row) => acc + row.mass, 0);
      const somaCombos = read.made.reduce((acc, row) => acc + row.combos, 0);

      expect(
        Math.abs(somaMassa - read.totalMass),
        `soma por categoria=${somaMassa} vs total=${read.totalMass}: ` +
          "`made` e um valor unico, entao isto vale POR CONSTRUCAO",
      ).toBeLessThan(EPS);
      expect(somaCombos, "a contagem tambem particiona").toBe(read.totalCombos);
    });
  }

  it("a massa total e a soma dos pesos declarados, nao a contagem de combos", () => {
    const combos = readCombos(unevenRange(), BOARD_K94);
    const read = buildRangeRead(combos, BOARD_K94);
    const esperado = combos.reduce((acc, c) => acc + c.weight, 0);

    expect(Math.abs(read.totalMass - esperado)).toBeLessThan(EPS);
    expect(read.totalCombos).toBe(combos.length);
    expect(
      read.totalMass,
      "range com frequencias abaixo de 1 tem massa MENOR que a contagem",
    ).toBeLessThan(read.totalCombos);
  });

  it("cada combo aparece em exatamente uma linha de mao feita", () => {
    const combos = readCombos(wideRange(), BOARD_Q77);
    const read = buildRangeRead(combos, BOARD_Q77);

    const porCategoria = new Map<MadeCategory, number>();
    for (const c of combos) {
      const made = classifyCombo(c.combo, BOARD_Q77).made;
      porCategoria.set(made, (porCategoria.get(made) ?? 0) + 1);
    }
    for (const row of read.made) {
      expect(row.combos, `linha ${row.id}`).toBe(porCategoria.get(row.id));
    }
    expect(read.made.length, "linha de categoria vazia nao vai para a tela").toBe(
      porCategoria.size,
    );
  });

  it("nenhuma linha entra com contagem zero", () => {
    const read = buildRangeRead(readCombos(wideRange(), BOARD_K94), BOARD_K94);
    for (const row of [...read.made, ...read.draws]) {
      expect(row.combos, `linha ${row.id} entrou vazia`).toBeGreaterThan(0);
      expect(row.mass, `linha ${row.id} com massa nao positiva`).toBeGreaterThan(0);
    }
  });
});

// ── draws: etiqueta, e por isso NAO somam ────────────────────

describe("F3a D-F3-4 — draws sao etiqueta: a soma deles nao tem relacao com o total", () => {
  it("a soma das massas por draw PODE passar da massa total, e isso e correto", () => {
    // Bordo 9-8 de paus: combos altos de paus pegam flush draw E overcards.
    const combos = readCombos(
      [rangeEntry("AKs", 1), rangeEntry("AQs", 1), rangeEntry("KQs", 1), rangeEntry("JTs", 1)],
      BOARD_982_CLUBS,
    );
    const read = buildRangeRead(combos, BOARD_982_CLUBS);
    const somaDraws = read.draws.reduce((acc, row) => acc + row.mass, 0);

    expect(
      somaDraws,
      `soma por draw=${somaDraws}, massa total=${read.totalMass}. ` +
        "Um combo com flush draw e overcards conta nas duas linhas — nao ha o que subtrair",
    ).toBeGreaterThan(read.totalMass);
  });

  it("o numero bem definido do bloco e `combos com >= 1 draw`, e ele nunca passa do total", () => {
    for (const board of [BOARD_982_CLUBS, BOARD_952, BOARD_SET_FD_TURN]) {
      const combos = readCombos(wideRange(), board);
      const read = buildRangeRead(combos, board);
      const esperado = combos.filter((c) => classifyCombo(c.combo, board).draws.length > 0);

      expect(read.drawCombos, `bordo ${label(board)}`).toBe(esperado.length);
      expect(read.drawCombos).toBeLessThanOrEqual(read.totalCombos);
      expect(
        Math.abs(read.drawMass - esperado.reduce((acc, c) => acc + c.weight, 0)),
        `bordo ${label(board)}: massa do rodape do bloco de draws`,
      ).toBeLessThan(EPS);
      expect(read.drawMass).toBeLessThanOrEqual(read.totalMass + EPS);
    }
  });

  it("set com flush draw aparece na linha de set E na linha de flush draw", () => {
    const combos = readCombos([rangeEntry("88", 1)], BOARD_SET_FD_TURN);
    const read = buildRangeRead(combos, BOARD_SET_FD_TURN);

    const set = read.made.find((r) => r.id === "set");
    const fd = read.draws.find((r) => r.id === "fd");
    expect(set, "a linha de set sumiu").toBeDefined();
    expect(fd, "a linha de flush draw sumiu — mao feita forte NAO apaga draw").toBeDefined();
    expect(
      fd!.combos,
      "o combo de set com flush draw tem que estar contado nas duas listas",
    ).toBeGreaterThan(0);
    expect(set!.combos).toBeGreaterThanOrEqual(fd!.combos);
  });

  it("no river o bloco de draws sai vazio, e o rodape diz zero (nunca some ao total)", () => {
    const read = buildRangeRead(readCombos(wideRange(), BOARD_RIVER_5RANKS), BOARD_RIVER_5RANKS);
    expect(read.draws).toEqual([]);
    expect(read.drawCombos).toBe(0);
    expect(read.drawMass).toBe(0);
    expect(read.totalCombos, "as maos feitas continuam la").toBeGreaterThan(0);
  });
});

// ── equity por linha: media ponderada, e `null` quando nao ha ──

describe("F3a RF-03.1 — equity por categoria: media ponderada pela massa, nunca zero inventado", () => {
  it("a media de uma linha e ponderada pela massa dos combos dela", () => {
    const combos = readCombos([rangeEntry("AA", 1)], BOARD_K94, () => null).map((c, i) => ({
      ...c,
      weight: i === 0 ? 3 : 1,
      equity: i === 0 ? 0.8 : 0.4,
    }));
    const read = buildRangeRead(combos, BOARD_K94);
    const overpair = read.made.find((r) => r.id === "overpair");

    expect(overpair, "AA no bordo K-9-4 e overpair").toBeDefined();
    const massaTotal = combos.reduce((acc, c) => acc + c.weight, 0);
    const esperada =
      combos.reduce((acc, c) => acc + c.weight * (c.equity as number), 0) / massaTotal;
    expect(
      Math.abs((overpair!.equity as number) - esperada),
      `veio ${overpair!.equity}, esperado ${esperada}: media simples ignoraria o peso`,
    ).toBeLessThan(EPS);
  });

  it("linha sem NENHUM combo com equity sai null, e nao 0%", () => {
    const combos = readCombos(wideRange(), BOARD_K94, () => null);
    const read = buildRangeRead(combos, BOARD_K94);

    expect(read.made.length, "as linhas continuam existindo — contagem e massa sao locais").toBeGreaterThan(
      0,
    );
    for (const row of read.made) {
      expect(
        row.equity,
        `linha ${row.id}: sem numero, a resposta e ausencia. ` +
          "0% aqui seria um numero errado com cara de certo",
      ).toBeNull();
      expect(row.combos, "a contagem sobrevive a ausencia de equity").toBeGreaterThan(0);
    }
  });

  it("combo sem equity nao entra na media, mas continua contado na linha", () => {
    const combos = readCombos([rangeEntry("AA", 1)], BOARD_K94).map((c, i) => ({
      ...c,
      weight: 1,
      equity: i === 0 ? null : 0.5,
    }));
    const read = buildRangeRead(combos, BOARD_K94);
    const overpair = read.made.find((r) => r.id === "overpair")!;

    expect(overpair.combos, "o combo sem equity nao pode sumir da contagem").toBe(combos.length);
    expect(
      Math.abs((overpair.equity as number) - 0.5),
      `veio ${overpair.equity}: tratar null como 0 puxaria a media para baixo`,
    ).toBeLessThan(EPS);
  });

  it("a leitura por combo fica acessivel por comboKey (a tabela do RF-03.8 usa a mesma)", () => {
    const combos = readCombos([rangeEntry("88", 1)], BOARD_SET_FD_TURN);
    const read = buildRangeRead(combos, BOARD_SET_FD_TURN);
    for (const c of combos) {
      const key = comboKey(c.combo[0], c.combo[1]);
      expect(read.reads.get(key), `leitura ausente para ${key}`).toEqual(
        classifyCombo(c.combo, BOARD_SET_FD_TURN),
      );
    }
  });
});

// ── criterio 6 / RF-03.7: o filtro ───────────────────────────

describe("F3a RF-03.7 — OU dentro do grupo, E entre grupos", () => {
  const board = BOARD_952;

  it("sem filtro marcado, TUDO passa (nao tudo apagado)", () => {
    const combos = readCombos(wideRange(), board);
    const highlight = buildHighlight(combos, board, emptyFilter());
    expect(
      highlight.passingCombos,
      "filtro vazio significa 'sem restricao', e nao 'nada selecionado'",
    ).toBe(highlight.totalCombos);
    expect(highlight.totalCombos).toBe(combos.length);
  });

  it("duas categorias de mao feita marcadas acendem quem for uma OU outra", () => {
    const read = classifyCombo(hole("As", "9d"), board);
    expect(read.made, "premissa do caso").toBe("top_pair");
    expect(comboPassesFilter(read, filterOf(["top_pair", "second_pair"]))).toBe(true);

    const semPar = classifyCombo(hole("Ks", "Qd"), board);
    expect(semPar.made, "premissa: KQ no bordo 9-5-2 nao pareia nada").toBe("no_pair");
    expect(comboPassesFilter(semPar, filterOf(["top_pair", "second_pair"]))).toBe(false);
  });

  it("duas tags de draw marcadas acendem quem tiver uma OU outra", () => {
    const comFd = classifyCombo(hole("Ac", "Kc"), BOARD_982_CLUBS);
    expect(comboPassesFilter(comFd, filterOf([], ["fd", "fd_nut"]))).toBe(true);
    const semFd = classifyCombo(hole("7d", "6s"), BOARD_982_CLUBS);
    expect(comboPassesFilter(semFd, filterOf([], ["fd", "fd_nut"]))).toBe(false);
  });

  it("mao feita MAIS draw exige as duas coisas — a leitura util da spec", () => {
    const setComFd = classifyCombo(hole("8h", "8s"), BOARD_SET_FD_TURN);
    const setSemFd = classifyCombo(hole("8s", "8c"), BOARD_SET_FD_TURN);
    expect(setComFd.made).toBe("set");
    expect(setSemFd.made).toBe("set");

    const filtro = filterOf(["set"], ["fd"]);
    expect(
      comboPassesFilter(setComFd, filtro),
      "'qual parte do meu set tem backup' so responde se for E entre grupos",
    ).toBe(true);
    expect(
      comboPassesFilter(setSemFd, filtro),
      "OU entre grupos acenderia este combo e a pergunta deixaria de ser respondida",
    ).toBe(false);
  });

  it("categoria marcada que o combo nao tem reprova mesmo com o draw batendo", () => {
    const read = classifyCombo(hole("Ac", "Kc"), BOARD_982_CLUBS);
    expect(read.draws).toContain("fd_nut");
    expect(comboPassesFilter(read, filterOf(["top_pair"], ["fd_nut"]))).toBe(false);
  });
});

describe("F3a criterio 6 — o filtro acende CELULAS, e o rodape conta combos", () => {
  const board = BOARD_982_CLUBS;

  it("marcar so flush draw acende apenas as classes que fazem flush draw nesse bordo", () => {
    const combos = readCombos(wideRange(), board);
    const filtro = filterOf([], ["fd", "fd_nut"]);
    const highlight = buildHighlight(combos, board, filtro);

    expect(highlight.cells.size, "nenhuma classe acesa: o filtro nao pode apagar tudo").toBeGreaterThan(
      0,
    );
    expect(
      highlight.cells.size,
      "acender tudo significa que o filtro nao filtrou nada",
    ).toBeLessThan(new Set(combos.map((c) => comboClass(c.combo))).size);

    for (const cell of highlight.cells) {
      const passam = combos.filter(
        (c) =>
          comboClass(c.combo) === cell && comboPassesFilter(classifyCombo(c.combo, board), filtro),
      );
      expect(
        passam.length,
        `a classe ${cell} acendeu sem nenhum combo que faca flush draw aqui`,
      ).toBeGreaterThan(0);
    }
  });

  it("uma celula acende com UM combo que passe, e o tooltip diz X de Y", () => {
    const combos = readCombos(wideRange(), board);
    const filtro = filterOf([], ["fd", "fd_nut"]);
    const highlight = buildHighlight(combos, board, filtro);

    for (const [cell, contagem] of highlight.perCell) {
      expect(contagem.total, `celula ${cell} sem total`).toBeGreaterThan(0);
      expect(contagem.passing, `celula ${cell}: passam mais combos que existem`).toBeLessThanOrEqual(
        contagem.total,
      );
      expect(
        highlight.cells.has(cell),
        `celula ${cell}: ${contagem.passing} de ${contagem.total} passam, ` +
          "e a celula acende com UM que passe",
      ).toBe(contagem.passing > 0);
    }
  });

  it("o rodape global conta combos, nao classes", () => {
    const combos = readCombos(wideRange(), board);
    const filtro = filterOf([], ["fd", "fd_nut"]);
    const highlight = buildHighlight(combos, board, filtro);

    const esperado = combos.filter((c) =>
      comboPassesFilter(classifyCombo(c.combo, board), filtro),
    ).length;
    expect(highlight.passingCombos).toBe(esperado);
    expect(highlight.totalCombos).toBe(combos.length);
    expect(
      highlight.passingCombos,
      "o rodape conta COMBOS; a celula e uma classe com ate 4 deles",
    ).toBeGreaterThanOrEqual(highlight.cells.size);
  });

  it("filtro que nao casa com nada apaga a matriz inteira sem quebrar o rodape", () => {
    const combos = readCombos([rangeEntry("22", 1)], board);
    const highlight = buildHighlight(combos, board, filterOf(["straight_flush"]));
    expect(highlight.cells.size).toBe(0);
    expect(highlight.passingCombos).toBe(0);
    expect(highlight.totalCombos, "o total continua sendo o total").toBe(combos.length);
  });
});

describe("F3a RF-03.7 — comboClass devolve a notacao da celula da matriz 13x13", () => {
  it("par, suited e offsuit", () => {
    expect(comboClass(hole("Ts", "Td"))).toBe("TT");
    expect(comboClass(hole("As", "7s"))).toBe("A7s");
    expect(comboClass(hole("As", "7d"))).toBe("A7o");
  });

  it("a ordem das cartas nao muda a classe", () => {
    expect(comboClass(hole("7s", "As"))).toBe("A7s");
    expect(comboClass(hole("7d", "As"))).toBe("A7o");
  });

  it("os quatro combos de uma classe suited caem na MESMA celula", () => {
    const classes = new Set(
      [
        hole("Ac", "7c"),
        hole("Ad", "7d"),
        hole("Ah", "7h"),
        hole("As", "7s"),
      ].map(comboClass),
    );
    expect(classes.size, "a celula da matriz e a classe, nao o combo").toBe(1);
  });
});
