// F3a / RF-03.1 — as 8 tags de draw: etiqueta, nao particao.
// Spec  : Docs/specs/range-lab/F3a-leitura-categorias.md (criterios 3 e 4)
// Porque: Docs/specs/range-lab/F3-detalhamento.md (secao 4.1)
// ADR   : Docs/architecture/decisions/248-...-f3a-leitura-categorias.md
//         (D-F3-4, D-F3-5, D-F3-6, D-F3-7, D-F3-8)
//
// O QUE ESTE ARQUIVO PROTEGE
//
// Quatro regras fazem o bloco de draws significar alguma coisa. Sem elas ele vira
// um painel inflado onde a linha que importa some:
//   D-F3-5  river nao tem draw nenhum — nao ha carta por vir;
//   D-F3-6  draw so conta o que a MAO ACRESCENTA ao que a mesa ja da;
//   D-F3-7  exclusao DENTRO da familia, acumulo ENTRE familias;
//   D-F3-8  overcards so quando a mao so tem potencial.
//
// A quinta regra e de tipo (D-F3-4): mao feita forte NAO apaga draw. Set com
// flush draw e `set` + `fd`. Nunca reclassificar, nunca subtrair.
import { describe, it, expect } from "vitest";
import { classifyCombo, straightOuts } from "@/lib/combo-calc/classify";
import type { DrawTag } from "@/lib/combo-calc/classify";
import { enumerateCombos, parseNotation } from "@/lib/combo-calc/combos";
import { cardKey } from "@/lib/combo-calc/cards";
import type { Card } from "@/lib/combo-calc/types";
import {
  BOARD_762,
  BOARD_772,
  BOARD_952,
  BOARD_982,
  BOARD_982_CLUBS,
  BOARD_9876,
  BOARD_AKQ,
  BOARD_FLUSH_TURN,
  BOARD_K94,
  BOARD_RIVER_5RANKS,
  BOARD_RIVER_BROADWAY,
  BOARD_SET_FD_TURN,
  BOARD_STRAIGHT_RIVER,
  cards,
  hole,
  label,
  rankMask,
  straightOutsOracle,
  wideRange,
} from "./f3a-fixtures";

const FLUSH_FAMILY: DrawTag[] = ["fd_nut", "fd", "bdfd"];
const STRAIGHT_FAMILY: DrawTag[] = ["oesd", "gutshot", "bdsd"];
const OVERCARD_FAMILY: DrawTag[] = ["overcards2", "overcard1"];
const ALL_DRAWS: DrawTag[] = [...FLUSH_FAMILY, ...STRAIGHT_FAMILY, ...OVERCARD_FAMILY];

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

function spot(h: [Card, Card], board: Card[]): string {
  return `mao ${label(h)} no bordo ${label(board)}`;
}

// ── straightOuts: a sonda de UMA carta, sobre a STRAIGHT_TOP da F1 ──

describe("F3a D-F3-6 — straightOuts sai da STRAIGHT_TOP; nao ha avaliador novo", () => {
  it("bordo 9-8-7-6 tem 2 outs de sequencia (o T e o 5)", () => {
    expect(straightOuts(rankMask(BOARD_9876))).toBe(2);
  });

  it("bordo que nao chega perto de sequencia tem 0 outs", () => {
    expect(straightOuts(rankMask(BOARD_K94))).toBe(0);
    expect(straightOuts(rankMask(BOARD_982))).toBe(0);
  });

  it("concorda com o oraculo independente em bordos e maos variados", () => {
    const casos: Card[][] = [
      BOARD_K94,
      BOARD_982,
      BOARD_9876,
      BOARD_AKQ,
      BOARD_RIVER_5RANKS,
      [...BOARD_982, ...hole("Jd", "Tc")],
      [...BOARD_K94, ...hole("Jd", "Tc")],
      [...BOARD_AKQ, ...hole("As", "Jd")],
    ];
    for (const conjunto of casos) {
      const mask = rankMask(conjunto);
      expect(
        straightOuts(mask),
        `${label(conjunto)} (mask ${mask}): divergiu do oraculo`,
      ).toBe(straightOutsOracle(mask));
    }
  });

  it("mascara vazia nao tem outs (nenhuma carta unica forma sequencia sozinha)", () => {
    expect(straightOuts(0)).toBe(0);
  });
});

// ── criterio 4: a mesa nao vira draw do range (D-F3-6) ───────

describe("F3a criterio 4 — no bordo 9-8-7-6, quem nao liga nada NAO recebe oesd", () => {
  it("22 no bordo 9-8-7-6 sai sem nenhuma tag de sequencia", () => {
    const h = hole("2s", "2d");
    const read = classifyCombo(h, BOARD_9876);

    expect(
      straightOuts(rankMask([...BOARD_9876, ...h])),
      "premissa: a mao nao acrescenta nenhum out ao que a mesa ja da",
    ).toBe(straightOuts(rankMask(BOARD_9876)));
    expect(
      read.draws,
      `${spot(h, BOARD_9876)}: a mesa da open-ended para os 1326 combos; ` +
        "marcar isso como 'draw do range' nao separa ninguem de ninguem",
    ).not.toContain("oesd");
    for (const tag of STRAIGHT_FAMILY) {
      expect(read.draws, `${spot(h, BOARD_9876)}: tag ${tag} sem contribuicao da mao`).not.toContain(
        tag,
      );
    }
  });

  it("nenhum combo do range ganha oesd por merito exclusivo da mesa", () => {
    const daMesa = straightOuts(rankMask(BOARD_9876));
    for (const combo of allCombos(wideRange(), BOARD_9876)) {
      const read = classifyCombo(combo, BOARD_9876);
      if (!read.draws.includes("oesd")) continue;
      expect(
        straightOuts(rankMask([...BOARD_9876, ...combo])),
        `${spot(combo, BOARD_9876)}: recebeu oesd sem acrescentar out ao bordo`,
      ).toBeGreaterThan(daMesa);
    }
  });
});

// ── criterio 3: river nao tem draw (D-F3-5) ──────────────────

describe("F3a criterio 3 — bordo de 5 cartas deixa `draws` vazio para TODO combo", () => {
  for (const board of [BOARD_STRAIGHT_RIVER, BOARD_RIVER_5RANKS, BOARD_RIVER_BROADWAY]) {
    it(`varredura do range inteiro no river ${label(board)}`, () => {
      const combos = allCombos(wideRange(), board);
      expect(combos.length, "a varredura precisa ter o que varrer").toBeGreaterThan(50);
      for (const combo of combos) {
        expect(
          classifyCombo(combo, board).draws,
          `${spot(combo, board)}: tag de draw no river e ruido que infla o painel`,
        ).toEqual([]);
      }
    });
  }

  it("overcards tambem somem no river — sao tags de draw como as outras", () => {
    // AK no river A-K-Q-J-9 nao tem overcard nenhuma; o caso que interessa e um
    // combo alto num river baixo, onde a versao ingenua ainda marcaria.
    const board = cards("9c 5d 2h 3s 4c");
    const read = classifyCombo(hole("Ks", "Qd"), board);
    expect(read.draws).toEqual([]);
    for (const tag of OVERCARD_FAMILY) {
      expect(read.draws, `${tag} no river`).not.toContain(tag);
    }
  });
});

// ── flush draw: contribuicao e nut (D-F3-6 + D-F3-10) ────────

describe("F3a RF-03.1 — flush draw so conta com contribuicao da mao", () => {
  it("4 do naipe com a maior carta VIVA da mao -> fd_nut", () => {
    const read = classifyCombo(hole("Ac", "Kc"), BOARD_982_CLUBS);
    expect(read.draws).toContain("fd_nut");
    expect(read.draws, "fd_nut e fd sao o mesmo desenho: nao acumulam").not.toContain("fd");
  });

  it("4 do naipe sem a maior carta viva -> fd simples", () => {
    const read = classifyCombo(hole("8h", "8s"), BOARD_SET_FD_TURN);
    expect(read.draws).toContain("fd");
    expect(read.draws).not.toContain("fd_nut");
  });

  it("3 do naipe no flop com contribuicao da mao -> bdfd", () => {
    const read = classifyCombo(hole("Kc", "Qs"), BOARD_982_CLUBS);
    expect(read.draws).toContain("bdfd");
    expect(read.draws, "bdfd e fd sao estagios do MESMO desenho").not.toContain("fd");
  });

  it("bdfd nao existe no turn — nao sobra carta suficiente", () => {
    // Bordo de 4 cartas com 2 copas; a mao acrescenta a terceira.
    const read = classifyCombo(hole("Qh", "Js"), cards("Kh 9h 2c 5d"));
    expect(
      read.draws,
      "backdoor de flush precisa de DUAS cartas por vir; no turn so vem uma",
    ).not.toContain("bdfd");
  });

  it("3 do naipe INTEIRAS na mesa nao dao bdfd a quem nao contribui", () => {
    const read = classifyCombo(hole("Ks", "Qd"), cards("9h 8h 2h"));
    expect(
      read.draws,
      "a mesa monotone da backdoor para todo mundo: a linha marcaria 100% e nao responderia nada",
    ).not.toContain("bdfd");
  });

  it("flush ja feito nao carrega tag de flush draw", () => {
    const read = classifyCombo(hole("Ah", "Qh"), BOARD_FLUSH_TURN);
    expect(read.made).toBe("flush");
    for (const tag of FLUSH_FAMILY) {
      expect(read.draws, `flush feito com a tag ${tag}`).not.toContain(tag);
    }
  });
});

// ── sequencia: oesd, gutshot e o backdoor de DUAS cartas ─────

describe("F3a RF-03.1 — as tres tags de sequencia", () => {
  it("2 outs acrescentados pela mao -> oesd", () => {
    const h = hole("Jd", "Tc");
    const read = classifyCombo(h, BOARD_982);
    expect(
      straightOuts(rankMask([...BOARD_982, ...h])) - straightOuts(rankMask(BOARD_982)),
      "premissa do caso: JT sobre 9-8 acrescenta o Q e o 7",
    ).toBe(2);
    expect(read.draws).toContain("oesd");
    expect(read.draws).not.toContain("gutshot");
  });

  it("1 out acrescentado pela mao -> gutshot", () => {
    const h = hole("Jd", "Tc");
    const read = classifyCombo(h, cards("Kh 9c 2d"));
    expect(read.draws).toContain("gutshot");
    expect(read.draws).not.toContain("oesd");
  });

  it("AJ em A-K-Q tem gutshot (falta o T) sem deixar de ser top par", () => {
    const read = classifyCombo(hole("As", "Jd"), BOARD_AKQ);
    expect(read.made, "mao feita forte nao apaga draw").toBe("top_pair");
    expect(read.draws).toContain("gutshot");
  });

  it("bdsd precisa da sonda de DUAS cartas — a de uma carta nao o enxerga", () => {
    const h = hole("Kd", "Qs");
    const board = BOARD_982;
    expect(
      straightOuts(rankMask([...board, ...h])),
      "premissa: com UMA carta nao ha out nenhum; KQ so completa com J e T juntos",
    ).toBe(straightOuts(rankMask(board)));

    const read = classifyCombo(h, board);
    expect(
      read.draws,
      `${spot(h, board)}: KQ sobre 9-8 completa com J+T; ` +
        "a sonda de uma carta nao ve isso, e escrever bdsd como se fosse a mesma funcao de oesd erra",
    ).toContain("bdsd");
    expect(read.draws).not.toContain("oesd");
    expect(read.draws).not.toContain("gutshot");
  });

  it("bdsd nao existe no turn", () => {
    const read = classifyCombo(hole("Kd", "Qs"), cards("9c 8d 2h 3s"));
    expect(read.draws).not.toContain("bdsd");
  });
});

// ── D-F3-8: overcards so descrevem quem SO tem potencial ─────

describe("F3a D-F3-8 — overcards so quando `made` e no_pair ou ace_high", () => {
  it("duas cartas acima de b0 sem par -> overcards2", () => {
    const read = classifyCombo(hole("Kd", "Qs"), BOARD_982);
    expect(read.made).toBe("no_pair");
    expect(read.draws).toContain("overcards2");
    expect(read.draws).not.toContain("overcard1");
  });

  it("uma carta acima de b0 sem par -> overcard1", () => {
    const read = classifyCombo(hole("Kd", "5s"), BOARD_982);
    expect(read.draws).toContain("overcard1");
    expect(read.draws).not.toContain("overcards2");
  });

  it("ace_high tambem recebe overcard", () => {
    const read = classifyCombo(hole("Ad", "5s"), BOARD_982);
    expect(read.made).toBe("ace_high");
    expect(read.draws).toContain("overcard1");
  });

  it("overpair com duas cartas acima de b0 NAO recebe tag de overcard", () => {
    const h = hole("Ks", "Kd");
    const read = classifyCombo(h, BOARD_762);
    expect(read.made).toBe("overpair");
    for (const tag of OVERCARD_FAMILY) {
      expect(
        read.draws,
        `${spot(h, BOARD_762)}: '2 overcards' com valor feito e ruido — ` +
          "as cartas altas nao mudam nada da decisao",
      ).not.toContain(tag);
    }
  });

  it("trinca com kicker acima de b0 NAO recebe tag de overcard", () => {
    const read = classifyCombo(hole("As", "7c"), BOARD_772);
    expect(read.made).toBe("trips");
    for (const tag of OVERCARD_FAMILY) {
      expect(read.draws, `trinca com a tag ${tag}`).not.toContain(tag);
    }
  });

  it("set nunca carrega tag de overcard", () => {
    // Estruturalmente o set nem produz overcard (as duas cartas do heroi tem o
    // rank que esta no bordo, entao nunca sao estritamente maiores que b0). A
    // asserção fica assim mesmo: e barata e trava a regra se a definicao de
    // overcard mudar.
    const read = classifyCombo(hole("8h", "8s"), BOARD_SET_FD_TURN);
    expect(read.made).toBe("set");
    for (const tag of OVERCARD_FAMILY) {
      expect(read.draws, `set com a tag ${tag}`).not.toContain(tag);
    }
  });

  it("top par com kicker acima de b0 NAO recebe tag de overcard", () => {
    const read = classifyCombo(hole("Ah", "9d"), BOARD_952);
    expect(read.made).toBe("top_pair");
    for (const tag of OVERCARD_FAMILY) {
      expect(read.draws, `top par com a tag ${tag}`).not.toContain(tag);
    }
  });
});

// ── D-F3-7: exclusao dentro da familia, acumulo entre familias ──

describe("F3a D-F3-7 — exclusao DENTRO da familia, acumulo ENTRE familias", () => {
  it("nenhum combo carrega duas tags da mesma familia", () => {
    for (const board of [BOARD_982, BOARD_982_CLUBS, BOARD_K94, BOARD_9876, BOARD_SET_FD_TURN]) {
      for (const combo of allCombos(wideRange(), board)) {
        const draws = classifyCombo(combo, board).draws;
        for (const familia of [FLUSH_FAMILY, STRAIGHT_FAMILY, OVERCARD_FAMILY]) {
          const marcadas = familia.filter((t) => draws.includes(t));
          expect(
            marcadas.length,
            `${spot(combo, board)}: tags [${marcadas.join(", ")}] sao o mesmo desenho ` +
              "em estagios diferentes e nao podem coexistir",
          ).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("flush draw e gutshot no mesmo combo — e essa a informacao que o jogador procura", () => {
    // Bordo 9-8 de paus: KcQc tem 4 paus (fd) e completa a sequencia com J+T
    // (backdoor), entao acumula entre as duas familias.
    const read = classifyCombo(hole("Kc", "Qc"), BOARD_982_CLUBS);
    expect(read.draws).toContain("fd");
    expect(read.draws).toContain("bdsd");
    expect(
      read.draws.length,
      `veio [${read.draws.join(", ")}]: familias diferentes acumulam`,
    ).toBeGreaterThanOrEqual(2);
  });

  it("set com flush draw aparece nas DUAS listas — nunca reclassificar, nunca subtrair", () => {
    const read = classifyCombo(hole("8h", "8s"), BOARD_SET_FD_TURN);
    expect(read.made, "mao feita forte nao apaga draw").toBe("set");
    expect(read.draws).toContain("fd");
  });

  it("toda tag emitida pertence a taxonomia fechada de 8", () => {
    for (const board of [BOARD_982, BOARD_982_CLUBS, BOARD_9876]) {
      for (const combo of allCombos(wideRange(), board)) {
        for (const tag of classifyCombo(combo, board).draws) {
          expect(ALL_DRAWS, `${spot(combo, board)}: tag desconhecida "${tag}"`).toContain(tag);
        }
      }
    }
  });

  it("a lista de draws nunca repete a mesma tag", () => {
    for (const board of [BOARD_982, BOARD_982_CLUBS, BOARD_SET_FD_TURN]) {
      for (const combo of allCombos(wideRange(), board)) {
        const draws = classifyCombo(combo, board).draws;
        expect(
          new Set(draws).size,
          `${spot(combo, board)}: [${draws.join(", ")}] tem tag repetida — ` +
            "a contagem por linha sairia inflada",
        ).toBe(draws.length);
      }
    }
  });
});
