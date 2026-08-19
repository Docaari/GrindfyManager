// F3b / RF-03.3 — o contrafactual do bloqueador, SEM segunda corrida do motor.
// Spec  : Docs/specs/range-lab/F3b-decisao.md (criterios 4 REESCRITO e 5)
// Porque: Docs/specs/range-lab/F3-detalhamento.md (F-5, D-F3-13)
// ADR   : Docs/architecture/decisions/249-range-lab-f3b-decisao.md
//         (Refutacao 1, D-F3-27, D-F3-29, D-F3-30)
// Diagrama: Docs/architecture/diagrams/range-lab-f3b/bloqueador-contrafactual-sequence.mermaid
//
// O QUE ESTE ARQUIVO PROTEGE
//
// 1. `equityReal === result.heroRangeEquity`. Os dois caminhos coincidem por
//    ALGEBRA, nao por coincidencia: com heroi de mao unica, `heroRangeEquity` ja
//    e a media ponderada de `1 - equity_v` sobre os vivos. Recalcular seria
//    reintroduzir a divergencia entre duas contas do mesmo numero que a D-F3-11
//    recusou por escrito — e a tela mostraria "58,3% contra 41,8%" sem ninguem
//    saber qual esta certo.
// 2. O DENOMINADOR DO PAR FICTICIO. O par impossivel remove TRES cartas
//    distintas, nao quatro: `C(46,2) = 1035` runouts validos no flop, e nao os
//    `990` de `cost.ts`. Usar a constante do motor daria um vies de 4,5% no
//    contrafactual, silencioso e sistematico. Este arquivo enumera o oraculo na
//    unha e cobra a diferenca.
// 3. ATRIBUICAO POR CARTA E ETIQUETA, NAO PARTICAO. O combo do vilao identico a
//    mao do heroi e bloqueado pelas DUAS cartas; as colunas somam mais que o
//    total, do mesmo jeito e pelo mesmo motivo que o bloco de draws da F3a.
// 4. NO MONTE CARLO O DELTA E SUPRIMIDO, e a CONTAGEM continua (D-F3-29). Um
//    delta tipico vive na casa de 1 a 3 pontos e a meia-largura pode ser da mesma
//    ordem: o numero seria menor que o proprio erro e apareceria com uma casa
//    decimal mesmo assim.
import { describe, it, expect } from "vitest";
import { blockerAvailability, analyzeBlockers } from "@/lib/combo-calc/blockers";
import type { BlockerReport } from "@/lib/combo-calc/blockers";
import { cardKey, comboKey } from "@/lib/combo-calc/cards";
import type { EngineResult } from "@/lib/combo-calc/engine/types";
import {
  ENGINE_RUNOUTS_PER_PAIR_FLOP,
  EPS,
  FICTITIOUS_PAIR_RUNOUTS,
  FLOP_ALIVE_COMBO,
  FLOP_BLOCKED_COMBO,
  FLOP_HERO,
  FLOP_RUNOUTS_ENUMERATED,
  RIVER_BLOCKED_COMBOS,
  RIVER_BLOCKED_MASS,
  RIVER_HERO,
  RIVER_HERO_EQUITY,
  RIVER_PER_CARD_COMBOS,
  TURN_RUNOUTS_ENUMERATED,
  V3B_FLOP_ONE_BLOCKED,
  V3B_NO_BLOCKERS,
  V3B_RIVER,
  V3B_RIVER_HERO_RANGE,
  V3B_TURN_ONE_BLOCKED,
  aliveVillainRows,
  blockedVillainRows,
  heroEquityAgainstCombo,
  rangeFromTokens,
  runExact,
  runMonteCarlo,
} from "./f3b-fixtures";

function report(input: Parameters<typeof analyzeBlockers>[0], tag: string): BlockerReport {
  const out = analyzeBlockers(input);
  if ("status" in out && out.status === "unavailable") {
    throw new Error(`${tag}: analyzeBlockers indisponivel (${out.reason}); o caso e valido`);
  }
  return out as BlockerReport;
}

function bucketsTotalCombos(split: {
  value: { combos: number };
  bluff: { combos: number };
  chop: { combos: number };
  unknown: { combos: number };
}): number {
  return split.value.combos + split.bluff.combos + split.chop.combos + split.unknown.combos;
}

// ── disponibilidade ──────────────────────────────────────────

describe("F3b D-F3-30 — quem decide se o painel existe e funcao pura, nao `if` no JSX", () => {
  it("sem resultado: indisponivel com razao no_result", () => {
    const out = blockerAvailability(null);
    expect(out.available).toBe(false);
    if (out.available) return;
    expect(out.reason).toBe("no_result");
    expect(out.heroCombos, "sem corrida nao ha combo do heroi a contar").toBe(0);
  });

  it("resultado degradado: engine_degraded", () => {
    const degradado: EngineResult = {
      status: "degraded",
      reason: "no_valid_pairs",
      mode: "exact",
      requiredEquity: 0.25,
    };
    const out = blockerAvailability(degradado);
    expect(out.available).toBe(false);
    if (out.available) return;
    expect(out.reason).toBe("engine_degraded");
  });

  it("heroi de mao unica: disponivel, com as duas cartas", () => {
    const out = blockerAvailability(runExact(V3B_RIVER, "disponibilidade"));
    expect(out.available).toBe(true);
    if (!out.available) return;
    expect(out.hero.map(cardKey).sort()).toEqual(["As", "Kd"].sort());
  });

  it("heroi como RANGE: indisponivel com hero_is_range e a CONTAGEM junto (F-5)", () => {
    // A razao carrega `heroCombos` para a frase poder ser especifica — "seu range
    // tem 2 combos; o bloqueador precisa de uma mao so" — em vez do generico
    // "indisponivel", que faz o jogador achar que quebrou.
    const result = runExact(V3B_RIVER_HERO_RANGE, "modo range");
    const out = blockerAvailability(result);
    expect(out.available).toBe(false);
    if (out.available) return;
    expect(out.reason).toBe("hero_is_range");
    expect(out.heroCombos).toBe(result.perHeroCombo.length);
    expect(out.heroCombos).toBeGreaterThan(1);
  });

  it("o predicado le perHeroCombo, nao o toggle da tela", () => {
    // Com "Minha mao" selecionado o jogador ainda pode pintar `AKs` e ter varios
    // combos. Quem manda e o range expandido.
    const spot = { ...V3B_RIVER, heroRange: rangeFromTokens(["AKs"]) };
    const result = runExact(spot, "toggle nao manda");
    expect(spot.heroRange.length, "uma entry so").toBe(1);
    expect(result.perHeroCombo.length, "mas mais de um combo depois do bordo").toBeGreaterThan(1);
    const out = blockerAvailability(result);
    expect(out.available).toBe(false);
    if (out.available) return;
    expect(out.reason).toBe("hero_is_range");
  });

  it("analyzeBlockers recusa o modo range com a MESMA razao", () => {
    const out = analyzeBlockers({
      result: runExact(V3B_RIVER_HERO_RANGE, "analyze em modo range"),
      board: V3B_RIVER_HERO_RANGE.board,
      computeDelta: true,
    });
    expect("status" in out && out.status === "unavailable").toBe(true);
    if (!("status" in out) || out.status !== "unavailable") return;
    expect(out.reason).toBe("hero_is_range");
  });
});

// ── contagem: gratis, direto de perVillainCombo (Refutacao 1) ──

describe("F3b Refutacao 1 — os bloqueados ja vem em perVillainCombo, com peso intacto", () => {
  it("o motor entrega os tres bloqueados do river com pairMass 0 e peso 1", () => {
    // Se isto mudar, `blockers.ts` perde a fonte de graca e o desenho inteiro cai.
    const result = runExact(V3B_RIVER, "fonte dos bloqueados");
    const bloqueados = blockedVillainRows(result);
    expect(bloqueados).toHaveLength(RIVER_BLOCKED_COMBOS);
    for (const row of bloqueados) {
      expect(row.pairMass).toBe(0);
      expect(row.equity).toBeNull();
      expect(row.degradedReason).toBe("no_valid_villain_combo");
      expect(row.weight, "o peso declarado tem que sobreviver").toBe(1);
    }
  });

  it("a contagem e a massa da UNIAO batem com o fixture", () => {
    const rel = report(
      { result: runExact(V3B_RIVER, "uniao"), board: V3B_RIVER.board, computeDelta: true },
      "uniao",
    );
    expect(rel.blockedCombos).toBe(RIVER_BLOCKED_COMBOS);
    expect(Math.abs(rel.blockedMass - RIVER_BLOCKED_MASS)).toBeLessThan(EPS);
    expect(rel.hero.map(cardKey).sort()).toEqual(["As", "Kd"].sort());
  });

  it("heroi que nao bloqueia nada: zero combos, e o delta sai com razao propria", () => {
    const rel = report(
      { result: runExact(V3B_NO_BLOCKERS, "sem bloqueio"), board: V3B_NO_BLOCKERS.board, computeDelta: true },
      "sem bloqueio",
    );
    expect(rel.blockedCombos).toBe(0);
    expect(rel.blockedMass).toBe(0);
    expect(rel.delta.status).toBe("unavailable");
    if (rel.delta.status !== "unavailable") return;
    expect(rel.delta.reason).toBe("no_blocked_combos");
  });
});

// ── por carta: ETIQUETA, nao particao ────────────────────────

describe("F3b D-F3-27 — a atribuicao por carta e etiqueta: as colunas podem se sobrepor", () => {
  it("AsKd no range do vilao com heroi AsKd conta nas DUAS colunas", () => {
    const rel = report(
      { result: runExact(V3B_RIVER, "etiqueta"), board: V3B_RIVER.board, computeDelta: true },
      "etiqueta",
    );

    const porCarta = new Map(rel.perCard.map((c) => [cardKey(c.card), c]));
    expect([...porCarta.keys()].sort()).toEqual(["As", "Kd"].sort());

    const as = porCarta.get("As");
    const kd = porCarta.get("Kd");
    if (!as || !kd) throw new Error("faltou coluna por carta");

    // As mata AsQs e AsKd; Kd mata KdQd e AsKd.
    expect(bucketsTotalCombos(as.removed)).toBe(RIVER_PER_CARD_COMBOS);
    expect(bucketsTotalCombos(kd.removed)).toBe(RIVER_PER_CARD_COMBOS);

    // O chop (AsKd, a mesma mao do heroi) aparece nas duas.
    expect(as.removed.chop.combos).toBe(1);
    expect(kd.removed.chop.combos).toBe(1);
    expect(as.removed.bluff.combos).toBe(1); // AsQs
    expect(kd.removed.bluff.combos).toBe(1); // KdQd
  });

  it("a soma das duas colunas PASSA da uniao — e o total conta uma vez so", () => {
    const rel = report(
      { result: runExact(V3B_RIVER, "soma das colunas"), board: V3B_RIVER.board, computeDelta: true },
      "soma das colunas",
    );
    const somaColunas = rel.perCard.reduce((acc, c) => acc + bucketsTotalCombos(c.removed), 0);
    expect(somaColunas).toBe(4);
    expect(
      rel.blockedCombos,
      "o agregado somou as colunas: o combo bloqueado pelas duas cartas contou duas vezes",
    ).toBe(3);
    expect(somaColunas).toBeGreaterThan(rel.blockedCombos);

    const somaMassas = rel.perCard.reduce((acc, c) => acc + c.removed.totalMass, 0);
    expect(somaMassas).toBe(4);
    expect(rel.blockedMass).toBe(3);
  });

  it("o split por carta usa o showdown, nao a equity (que e null nos bloqueados)", () => {
    const rel = report(
      { result: runExact(V3B_RIVER, "split por carta"), board: V3B_RIVER.board, computeDelta: true },
      "split por carta",
    );
    for (const coluna of rel.perCard) {
      expect(coluna.removed.method).toBe("showdown_now");
      expect(
        coluna.removed.unknown.combos,
        "bloqueado caiu em unknown: o painel perderia o value/blefe removido",
      ).toBe(0);
    }
  });
});

// ── o contrafactual ──────────────────────────────────────────

describe("F3b D-F3-27 — equityReal e literalmente o heroRangeEquity da corrida", () => {
  const CASOS: Array<[string, Parameters<typeof runExact>[0], boolean]> = [
    ["river", V3B_RIVER, true],
    ["flop com um bloqueado", V3B_FLOP_ONE_BLOCKED, true],
    ["turn com um bloqueado", V3B_TURN_ONE_BLOCKED, true],
  ];

  for (const [nome, spot, computeDelta] of CASOS) {
    it(`${nome}: equityReal === result.heroRangeEquity ate 1e-9`, () => {
      const result = runExact(spot, nome);
      const rel = report({ result, board: spot.board, computeDelta }, nome);
      expect(rel.delta.status).toBe("ok");
      if (rel.delta.status !== "ok") return;
      expect(
        Math.abs(rel.delta.equityReal - result.heroRangeEquity),
        "o contrafactual REFEZ a corrida em vez de reusa-la: duas contas do mesmo numero",
      ).toBeLessThan(1e-9);
    });
  }

  it("no river do fixture a equity real e 0,5 — conferida a mao", () => {
    const result = runExact(V3B_RIVER, "equity real do river");
    expect(Math.abs(result.heroRangeEquity - RIVER_HERO_EQUITY)).toBeLessThan(1e-12);
  });
});

describe("F3b criterio 4 REESCRITO — o contrafactual do river conferido a mao", () => {
  it("bate com a media ponderada montada dentro do proprio teste", () => {
    // A linha de base e o range COM os bloqueados vivos. Remover na unha os
    // combos com a carta do heroi daria delta zero — o motor JA os removeu.
    const result = runExact(V3B_RIVER, "contrafactual do river");
    const board = V3B_RIVER.board;

    let num = 0;
    let den = 0;
    for (const row of aliveVillainRows(result)) {
      const eqHero = 1 - (row.equity as number);
      num += row.weight * eqHero;
      den += row.weight;
    }
    for (const row of blockedVillainRows(result)) {
      const { equity, runouts } = heroEquityAgainstCombo(RIVER_HERO, row.combo, board);
      expect(runouts, "no river o par ficticio tem exatamente 1 runout").toBe(1);
      num += row.weight * equity;
      den += row.weight;
    }
    const esperado = num / den;

    // (1 + 0 + 0,5) dos vivos mais (1 + 1 + 0,5) dos bloqueados, sobre 6.
    expect(Math.abs(esperado - 4 / 6)).toBeLessThan(1e-12);

    const rel = report({ result, board, computeDelta: true }, "contrafactual do river");
    expect(rel.delta.status).toBe("ok");
    if (rel.delta.status !== "ok") return;
    expect(Math.abs(rel.delta.equityCounterfactual - esperado)).toBeLessThan(1e-9);
    expect(
      Math.abs(rel.delta.delta - (rel.delta.equityReal - rel.delta.equityCounterfactual)),
    ).toBeLessThan(1e-12);
    expect(
      rel.delta.delta,
      "as cartas do heroi mataram maos que ele BATE: bloquear custou equity",
    ).toBeLessThan(0);
    expect(rel.delta.runoutsEnumerated).toBe(1);
  });
});

describe("F3b D-F3-27 — o denominador do par ficticio e C(46,2), nunca os 990 do motor", () => {
  it("no flop, o laco externo enumera C(47,2) = 1081 runouts", () => {
    const rel = report(
      {
        result: runExact(V3B_FLOP_ONE_BLOCKED, "runouts do flop"),
        board: V3B_FLOP_ONE_BLOCKED.board,
        computeDelta: true,
      },
      "runouts do flop",
    );
    expect(rel.delta.status).toBe("ok");
    if (rel.delta.status !== "ok") return;
    expect(
      rel.delta.runoutsEnumerated,
      "baralho menos bordo menos as DUAS cartas do heroi = 47 cartas",
    ).toBe(FLOP_RUNOUTS_ENUMERATED);
  });

  it("no turn, 46 runouts", () => {
    const rel = report(
      {
        result: runExact(V3B_TURN_ONE_BLOCKED, "runouts do turn"),
        board: V3B_TURN_ONE_BLOCKED.board,
        computeDelta: true,
      },
      "runouts do turn",
    );
    expect(rel.delta.status).toBe("ok");
    if (rel.delta.status !== "ok") return;
    expect(rel.delta.runoutsEnumerated).toBe(TURN_RUNOUTS_ENUMERATED);
  });

  it("a equity ficticia sai do denominador PROPRIO do combo (1035), nao do global (990)", () => {
    // O fixture tem UM vivo e UM bloqueado, pesos 1: o contrafactual e a media de
    // dois termos, entao a equity ficticia sai por algebra do proprio relatorio.
    const result = runExact(V3B_FLOP_ONE_BLOCKED, "denominador ficticio");
    const board = V3B_FLOP_ONE_BLOCKED.board;

    const oraculo = heroEquityAgainstCombo(FLOP_HERO, FLOP_BLOCKED_COMBO, board);
    expect(
      oraculo.runouts,
      "o par ficticio tira 6 cartas (bordo 3 + heroi 2 + a carta livre do vilao)",
    ).toBe(FICTITIOUS_PAIR_RUNOUTS);
    expect(oraculo.runouts).not.toBe(ENGINE_RUNOUTS_PER_PAIR_FLOP);

    const rel = report({ result, board, computeDelta: true }, "denominador ficticio");
    expect(rel.blockedCombos).toBe(1);
    expect(rel.delta.status).toBe("ok");
    if (rel.delta.status !== "ok") return;

    const eqBloqueado = 2 * rel.delta.equityCounterfactual - rel.delta.equityReal;
    expect(
      Math.abs(eqBloqueado - oraculo.equity),
      `equity ficticia ${eqBloqueado} contra o oraculo ${oraculo.equity}. ` +
        `Dividir pelos ${ENGINE_RUNOUTS_PER_PAIR_FLOP} runouts do motor daria ` +
        `${(oraculo.equity * FICTITIOUS_PAIR_RUNOUTS) / ENGINE_RUNOUTS_PER_PAIR_FLOP}.`,
    ).toBeLessThan(1e-9);

    // O teste so vale se as duas contas discordarem de verdade neste fixture.
    const comDenominadorErrado =
      (oraculo.equity * FICTITIOUS_PAIR_RUNOUTS) / ENGINE_RUNOUTS_PER_PAIR_FLOP;
    expect(
      Math.abs(comDenominadorErrado - oraculo.equity),
      "o fixture nao separa os dois denominadores: o teste nao provaria nada",
    ).toBeGreaterThan(1e-3);
  });

  it("o combo vivo do flop continua vindo do motor, nao de enumeracao nova", () => {
    const result = runExact(V3B_FLOP_ONE_BLOCKED, "vivo vem do motor");
    const vivos = aliveVillainRows(result);
    expect(vivos).toHaveLength(1);
    expect(comboKey(vivos[0].combo[0], vivos[0].combo[1])).toBe(
      comboKey(FLOP_ALIVE_COMBO[0], FLOP_ALIVE_COMBO[1]),
    );
    const rel = report(
      { result, board: V3B_FLOP_ONE_BLOCKED.board, computeDelta: true },
      "vivo vem do motor",
    );
    if (rel.delta.status !== "ok") throw new Error("delta indisponivel");
    expect(Math.abs(rel.delta.equityReal - (1 - (vivos[0].equity as number)))).toBeLessThan(1e-9);
  });
});

// ── quando o delta NAO sai ───────────────────────────────────

describe("F3b D-F3-29 — no Monte Carlo o delta e suprimido, e a contagem continua", () => {
  it("modo monte_carlo: delta unavailable/monte_carlo_mode", () => {
    // `eqReal` carrega meia-largura de intervalo e `eqCf` sairia analitico. Um
    // delta de 1 a 3 pontos ficaria MENOR que o proprio erro e ainda assim
    // apareceria com uma casa decimal.
    const result = runMonteCarlo(V3B_FLOP_ONE_BLOCKED, 5_000, "monte carlo");
    const rel = report(
      { result, board: V3B_FLOP_ONE_BLOCKED.board, computeDelta: true },
      "monte carlo",
    );
    expect(rel.delta.status).toBe("unavailable");
    if (rel.delta.status !== "unavailable") return;
    expect(rel.delta.reason).toBe("monte_carlo_mode");
  });

  it("a contagem de combos removidos sobrevive ao Monte Carlo", () => {
    const rel = report(
      {
        result: runMonteCarlo(V3B_RIVER, 5_000, "contagem no MC"),
        board: V3B_RIVER.board,
        computeDelta: true,
      },
      "contagem no MC",
    );
    expect(rel.blockedCombos, "a contagem nao depende da corrida").toBe(RIVER_BLOCKED_COMBOS);
    expect(rel.blockedMass).toBe(RIVER_BLOCKED_MASS);
    for (const coluna of rel.perCard) {
      expect(bucketsTotalCombos(coluna.removed)).toBe(RIVER_PER_CARD_COMBOS);
    }
  });
});

describe("F3b D-F3-13 — fora do river o delta so sai sob pedido", () => {
  it("computeDelta false: unavailable/not_requested, com a contagem de pe", () => {
    const rel = report(
      {
        result: runExact(V3B_FLOP_ONE_BLOCKED, "sem pedido"),
        board: V3B_FLOP_ONE_BLOCKED.board,
        computeDelta: false,
      },
      "sem pedido",
    );
    expect(rel.delta.status).toBe("unavailable");
    if (rel.delta.status !== "unavailable") return;
    expect(rel.delta.reason).toBe("not_requested");
    expect(rel.blockedCombos, "a contagem e barata e nao depende do botao").toBe(1);
  });

  it("computeDelta true no flop: o delta sai", () => {
    const rel = report(
      {
        result: runExact(V3B_FLOP_ONE_BLOCKED, "sob pedido"),
        board: V3B_FLOP_ONE_BLOCKED.board,
        computeDelta: true,
      },
      "sob pedido",
    );
    expect(rel.delta.status).toBe("ok");
  });
});

// ── pureza ───────────────────────────────────────────────────

describe("F3b — analyzeBlockers e uma funcao pura e sincrona", () => {
  it("duas chamadas devolvem exatamente o mesmo objeto", () => {
    const result = runExact(V3B_FLOP_ONE_BLOCKED, "pureza");
    const input = { result, board: V3B_FLOP_ONE_BLOCKED.board, computeDelta: true };
    expect(analyzeBlockers(input)).toEqual(analyzeBlockers(input));
  });

  it("nao devolve Promise: o contrato da D-F3-28 exige bloco sincrono", () => {
    // `loadBoard` e estado de MODULO. Ceder a thread no meio deixaria o segundo
    // cliente do `fastEvaluator` ler um bordo que nao e o dele.
    const out = analyzeBlockers({
      result: runExact(V3B_FLOP_ONE_BLOCKED, "sincrono"),
      board: V3B_FLOP_ONE_BLOCKED.board,
      computeDelta: true,
    });
    expect(out).not.toBeInstanceOf(Promise);
    expect(typeof (out as unknown as { then?: unknown }).then).toBe("undefined");
  });

  it("nao muta o resultado do motor", () => {
    const result = runExact(V3B_RIVER, "sem mutacao");
    const antes = JSON.stringify(result);
    analyzeBlockers({ result, board: V3B_RIVER.board, computeDelta: true });
    expect(JSON.stringify(result)).toBe(antes);
  });

  it("nao troca a ordem das colunas por carta entre chamadas", () => {
    const result = runExact(V3B_RIVER, "ordem estavel");
    const a = report({ result, board: V3B_RIVER.board, computeDelta: true }, "a");
    const b = report({ result, board: V3B_RIVER.board, computeDelta: true }, "b");
    expect(a.perCard.map((c) => cardKey(c.card))).toEqual(b.perCard.map((c) => cardKey(c.card)));
    expect(a.perCard.map((c) => cardKey(c.card)).sort()).toEqual(["As", "Kd"].sort());
  });
});
