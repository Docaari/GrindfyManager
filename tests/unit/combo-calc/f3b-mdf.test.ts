// F3b / RF-03.4 — MDF, alpha de defesa, blefes necessarios e a ordem dos
// bluffcatchers.
// Spec  : Docs/specs/range-lab/F3b-decisao.md (criterios 1, 2 e 3)
// Porque: Docs/specs/range-lab/F3-detalhamento.md (achado F-1)
// ADR   : Docs/architecture/decisions/249-range-lab-f3b-decisao.md
//         (D-F3-12, D-F3-23, D-F3-31)
//
// O QUE ESTE ARQUIVO PROTEGE
//
// 1. O ACHADO F-1, para sempre. `requiredEquity` do `ev.ts` e `B / (P + 2B)` — a
//    equity que o HEROI precisa para pagar. O alpha de defesa e `B / (P + B)` — o
//    quanto o BLEFE DELE precisa funcionar. Os dois numeros vao para o MESMO
//    cartao. Escrever `MDF = 1 - requiredEquity` produz um numero plausivel,
//    estavel e FALSO: com pote 20 e aposta 10 daria 75% onde o certo e 67%.
//    Numero errado que nao parece errado e o que a `00-produto.md` poe acima de
//    tudo, e e por isso que a desigualdade e teste e nao comentario.
// 2. A UNIAO DISCRIMINADA (D-F3-23). `P <= 0` nao devolve objeto com campos
//    nulos: devolve `status: "degraded"`. O unico jeito de garantir que NENHUM
//    numero vaze para a tela e nao ter numero no objeto.
// 3. A ORDEM ESTAVEL dos bluffcatchers (D-F3-31). No river metade do range tem
//    equity exatamente 1 ou 0; sem desempate por `comboKey`, o `k` mudaria a cada
//    vez que o jogador pinta uma celula. Numero que pisca sem nada ter mudado e
//    pior que numero ausente.
import { describe, it, expect } from "vitest";
import { computeMdf, computeBluffBalance, rankBluffcatchers } from "@/lib/combo-calc/mdf";
import { requiredEquity } from "@/lib/combo-calc/ev";
import { comboKey } from "@/lib/combo-calc/cards";
import type { HeroComboResult } from "@/lib/combo-calc/engine/types";
import {
  V3B_RIVER,
  V3B_FLOP_ONE_BLOCKED,
  V3B_RIVER_HERO_RANGE,
  hole,
  runExact,
} from "./f3b-fixtures";
import { V2_FLOP, V2_FLOP_FOLD, V2_PERF_FLOP, V2_TURN, V2_RIVER } from "./f1-fixtures";

function mdfOk(potCurrent: number, callAmount: number) {
  const out = computeMdf(potCurrent, callAmount);
  if (out.status !== "ok") {
    throw new Error(
      `computeMdf(${potCurrent}, ${callAmount}) degradou (${out.reason}); o caso e valido`,
    );
  }
  return out;
}

// ── criterio 1: MDF + defenseAlpha == 1 ──────────────────────

describe("F3b criterio 1 — MDF e alpha de defesa fecham em 1 na faixa inteira", () => {
  // 0,1x a 5x pote, em passos de 0,1x: 50 tamanhos de aposta.
  const MULTIPLICADORES = Array.from({ length: 50 }, (_, i) => (i + 1) / 10);
  const P = 20;

  it("soma 1 com tolerancia de 1e-12 em 50 tamanhos de aposta", () => {
    for (const mult of MULTIPLICADORES) {
      const B = P * mult;
      const m = mdfOk(P + B, B);
      expect(
        Math.abs(m.mdf + m.defenseAlpha - 1),
        `aposta ${mult}x pote: MDF ${m.mdf} + alpha ${m.defenseAlpha} nao fecha em 1`,
      ).toBeLessThan(1e-12);
    }
  });

  it("devolve o P e o B que usou, para a frase poder cita-los", () => {
    const m = mdfOk(30, 10);
    expect(m.potBeforeBet, "P = potCurrent - callAmount").toBe(20);
    expect(m.bet, "B = callAmount").toBe(10);
  });

  it("o exemplo da spec: pote 20, aposta 10 -> defesa 33,3%, MDF 66,7%", () => {
    const m = mdfOk(30, 10);
    expect(Math.abs(m.defenseAlpha - 1 / 3)).toBeLessThan(1e-12);
    expect(Math.abs(m.mdf - 2 / 3)).toBeLessThan(1e-12);
  });

  it("aposta de pote deixa os dois em 50%", () => {
    const m = mdfOk(40, 20);
    expect(Math.abs(m.defenseAlpha - 0.5)).toBeLessThan(1e-12);
    expect(Math.abs(m.mdf - 0.5)).toBeLessThan(1e-12);
  });
});

// ── criterio 2: o achado F-1 travado ─────────────────────────

describe("F3b criterio 2 — defenseAlpha NUNCA e o requiredEquity do ev.ts (achado F-1)", () => {
  const P = 20;

  it("os dois diferem em toda a faixa de 0,1x a 5x pote", () => {
    for (let i = 1; i <= 50; i++) {
      const B = (P * i) / 10;
      const m = mdfOk(P + B, B);
      const alphaHeroi = requiredEquity(P + B, B);
      expect(
        m.defenseAlpha,
        `aposta ${(i / 10).toFixed(1)}x pote: os dois alphas colidiram em ${m.defenseAlpha}. ` +
          "Reusar `requiredEquity` como MDF e o achado F-1 voltando.",
      ).not.toBe(alphaHeroi);
      expect(
        Math.abs(m.defenseAlpha - alphaHeroi),
        "a diferenca sumiu no ruido de ponto flutuante: o calculo virou o mesmo",
      ).toBeGreaterThan(1e-9);
    }
  });

  it("no exemplo da spec sao 33,3% contra 25% — e a soma com o MDF nao significa nada", () => {
    const m = mdfOk(30, 10);
    const alphaHeroi = requiredEquity(30, 10);
    expect(Math.abs(alphaHeroi - 0.25)).toBeLessThan(1e-12);
    expect(Math.abs(m.defenseAlpha - 1 / 3)).toBeLessThan(1e-12);
    expect(
      Math.abs(m.mdf + alphaHeroi - 1),
      "MDF + alpha do heroi fechou em 1: sinal de que os dois viraram a mesma grandeza",
    ).toBeGreaterThan(0.05);
  });

  it("a formula errada (1 - requiredEquity) devolve outro numero, e nao e o MDF", () => {
    const m = mdfOk(30, 10);
    const errada = 1 - requiredEquity(30, 10); // 0,75
    expect(
      Math.abs(m.mdf - errada),
      `MDF ${m.mdf} colidiu com 1 - requiredEquity (${errada})`,
    ).toBeGreaterThan(0.05);
  });

  it("so o caso degenerado B = 0 iguala os dois — e ele nao e um spot", () => {
    // Documenta a fronteira: com aposta zero os dois alphas sao 0. Nenhum spot
    // real passa por aqui (o portao `describeSpotReadiness` exige call > 0), mas
    // deixar isso implicito e como a excecao vira regra depois.
    const m = mdfOk(20, 0);
    expect(m.defenseAlpha).toBe(0);
    expect(requiredEquity(20, 0)).toBe(0);
    expect(m.mdf).toBe(1);
  });
});

// ── criterio 3: P <= 0 e P nao finito degradam ───────────────

describe("F3b criterio 3 — pote antes da aposta invalido degrada, sem numero nenhum", () => {
  const CASOS: Array<[string, number, number]> = [
    ["aposta maior que o pote atual (P < 0)", 10, 100],
    ["aposta igual ao pote atual (P = 0)", 10, 10],
    ["pote NaN (o jogador esta digitando)", NaN, 10],
    ["pote Infinity", Infinity, 10],
    ["aposta NaN", 30, NaN],
    ["aposta Infinity", 30, Infinity],
    ["pote negativo", -30, 10],
  ];

  for (const [nome, pot, call] of CASOS) {
    it(`${nome} -> degraded/invalid_pot_before_bet`, () => {
      const out = computeMdf(pot, call);
      expect(out.status, `computeMdf(${pot}, ${call}) devolveu ok`).toBe("degraded");
      if (out.status !== "degraded") return;
      expect(out.reason).toBe("invalid_pot_before_bet");
    });
  }

  it("o objeto degradado NAO carrega nenhum campo numerico (D-F3-23)", () => {
    const out = computeMdf(10, 100);
    // O motivo de a uniao existir: campo lido e campo que alguem le. Um `mdf: null`
    // sobrevive a um `if` esquecido e vira `NaN%` na tela; um campo ausente nao.
    const chaves = Object.keys(out as unknown as Record<string, unknown>).sort();
    expect(chaves, "o degradado so pode ter status e reason").toEqual(["reason", "status"]);
  });

  it("um NaN nunca atravessa: nao existe defenseAlpha NaN", () => {
    for (const [, pot, call] of CASOS) {
      const out = computeMdf(pot, call) as Record<string, unknown>;
      expect(Number.isNaN(out.defenseAlpha as number)).toBe(false);
      expect(Number.isNaN(out.mdf as number)).toBe(false);
    }
  });
});

// ── blefes necessarios ───────────────────────────────────────

describe("F3b RF-03.4 — blefes necessarios saem de valueMass * B / P", () => {
  function balanceOk(
    pot: number,
    call: number,
    masses: { value: number; bluff: number; chop: number; unknown: number },
  ) {
    const out = computeBluffBalance(mdfOk(pot, call), masses);
    if (out.status !== "ok") throw new Error(`computeBluffBalance degradou (${out.reason})`);
    return out;
  }

  it("aposta de pote (B = P) pede exatamente a massa de value: a razao 1:1 do river", () => {
    // E o cheiro de que o F-1 esta corrigido. Com o alpha errado (B / (P + 2B) =
    // 1/3), `value * a/(1-a)` daria metade da massa de value.
    const b = balanceOk(40, 20, { value: 18, bluff: 4, chop: 0, unknown: 0 });
    expect(b.bluffsNeeded).toBe(18);
  });

  it("meia-pote pede metade — o exemplo escrito na spec (18 de value, 9 de blefe)", () => {
    const b = balanceOk(30, 10, { value: 18, bluff: 4, chop: 0, unknown: 0 });
    expect(Math.abs(b.bluffsNeeded - 9)).toBeLessThan(1e-12);
    expect(Math.abs(b.bluffGap - 5), "faltam 5 combos de blefe").toBeLessThan(1e-12);
    expect(b.verdict).toBe("bluffs_missing");
  });

  it("as duas formas da conta coincidem: value*B/P == value*alpha/(1-alpha)", () => {
    for (let i = 1; i <= 50; i++) {
      const P = 20;
      const B = (P * i) / 10;
      const m = mdfOk(P + B, B);
      const b = balanceOk(P + B, B, { value: 7.5, bluff: 1, chop: 0, unknown: 0 });
      const viaAlpha = (7.5 * m.defenseAlpha) / (1 - m.defenseAlpha);
      expect(
        Math.abs(b.bluffsNeeded - viaAlpha),
        `aposta ${(i / 10).toFixed(1)}x: ${b.bluffsNeeded} contra ${viaAlpha}`,
      ).toBeLessThan(1e-9);
    }
  });

  it("blefe a mais devolve gap negativo e o veredito de excesso", () => {
    const b = balanceOk(30, 10, { value: 18, bluff: 14, chop: 0, unknown: 0 });
    expect(b.bluffGap).toBeLessThan(0);
    expect(b.verdict).toBe("bluffs_excess");
  });

  it("a massa exata de blefe fecha em 'balanced'", () => {
    const b = balanceOk(40, 20, { value: 12, bluff: 12, chop: 0, unknown: 0 });
    expect(b.bluffGap).toBe(0);
    expect(b.verdict).toBe("balanced");
  });

  it("massa fracionaria nao e arredondada no calculo (so na exibicao)", () => {
    const b = balanceOk(30, 10, { value: 7.5, bluff: 1.25, chop: 0, unknown: 0 });
    expect(Math.abs(b.bluffsNeeded - 3.75)).toBeLessThan(1e-12);
    expect(Math.abs(b.bluffGap - 2.5)).toBeLessThan(1e-12);
  });

  it("sem massa de value nao ha razao de blefe: degraded/no_value_mass", () => {
    const out = computeBluffBalance(mdfOk(30, 10), {
      value: 0,
      bluff: 6,
      chop: 2,
      unknown: 0,
    });
    expect(out.status, "value 0 daria 'precisa de 0 blefes', que nao e resposta").toBe("degraded");
    if (out.status !== "degraded") return;
    expect(out.reason).toBe("no_value_mass");
  });

  it("a massa de combos SEM numero viaja separada e nunca entra como blefe", () => {
    // D-F3-24: zero disfarcado de blefe e o mesmo erro da D8 com outro nome —
    // infla os blefes dele e vira o veredito de "da pra foldar mais" para
    // "pague mais largo".
    const semDesconhecidos = balanceOk(30, 10, { value: 18, bluff: 4, chop: 1, unknown: 0 });
    const comDesconhecidos = balanceOk(30, 10, { value: 18, bluff: 4, chop: 1, unknown: 9 });

    expect(comDesconhecidos.unknownMass).toBe(9);
    expect(comDesconhecidos.bluffMass, "os 9 sem numero foram parar no balde de blefe").toBe(4);
    expect(comDesconhecidos.bluffGap).toBe(semDesconhecidos.bluffGap);
    expect(comDesconhecidos.verdict).toBe(semDesconhecidos.verdict);
  });

  it("chop e a terceira contagem: viaja no resultado e nao e distribuido", () => {
    const b = balanceOk(30, 10, { value: 18, bluff: 4, chop: 3, unknown: 0 });
    expect(b.chopMass).toBe(3);
    expect(b.valueMass).toBe(18);
    expect(b.bluffMass).toBe(4);
  });
});

// ── ordem dos bluffcatchers ──────────────────────────────────

function heroRow(
  a: string,
  b: string,
  equity: number | null,
  evCall: number | null,
  weight = 1,
): HeroComboResult {
  const [c1, c2] = hole(a, b);
  return {
    combo: [c1, c2],
    weight,
    pairMass: equity === null ? 0 : 12,
    equity,
    evCall,
    decision: evCall === null ? null : evCall >= 0 ? "call" : "fold",
    confidenceHalfWidth: null,
    sampleCount: null,
    degradedReason: equity === null ? "no_valid_villain_combo" : null,
  };
}

describe("F3b D-F3-31 — a ordem dos bluffcatchers e estavel e o corte e prefixo dela", () => {
  it("ordena por equity decrescente", () => {
    const ranking = rankBluffcatchers([
      heroRow("7c", "2d", 0.1, -8),
      heroRow("As", "Ks", 0.9, 20),
      heroRow("Qh", "Qd", 0.5, 2),
    ]);
    expect(ranking.order).toEqual([comboKey(...hole("As", "Ks")), comboKey(...hole("Qh", "Qd")), comboKey(...hole("7c", "2d"))]);
    expect(ranking.rankByCombo.get(comboKey(...hole("As", "Ks")))).toBe(1);
    expect(ranking.rankByCombo.get(comboKey(...hole("7c", "2d")))).toBe(3);
  });

  it("empate de equity desempata por comboKey crescente", () => {
    const ranking = rankBluffcatchers([
      heroRow("Kh", "Kd", 1, 20),
      heroRow("Ac", "Ad", 1, 20),
      heroRow("Qs", "Qh", 1, 20),
    ]);
    const esperado = [
      comboKey(...hole("Ac", "Ad")),
      comboKey(...hole("Kh", "Kd")),
      comboKey(...hole("Qs", "Qh")),
    ].sort();
    expect(ranking.order, "empate sem desempate total deixa a ordem a merce do array").toEqual(
      esperado,
    );
  });

  it("a mesma mao declarada em ORDEM DIFERENTE produz o mesmo rank (D-F3-31)", () => {
    // A ordem de `perHeroCombo` acompanha a ordem das entradas do range, que muda
    // quando o jogador pinta uma celula. Se o rank mudar junto, o `k` da tela
    // pisca sem nada ter mudado.
    const rows = [
      heroRow("Ac", "Ad", 1, 20),
      heroRow("Kh", "Kd", 1, 20),
      heroRow("Qs", "Qh", 0, -13.8),
      heroRow("Js", "Jh", 0, -13.8),
      heroRow("Tc", "Td", 0.5, 0),
    ];
    const direto = rankBluffcatchers(rows);
    const invertido = rankBluffcatchers([...rows].reverse());
    const embaralhado = rankBluffcatchers([rows[2], rows[0], rows[4], rows[3], rows[1]]);

    expect(invertido.order).toEqual(direto.order);
    expect(embaralhado.order).toEqual(direto.order);
    expect([...invertido.rankByCombo.entries()].sort()).toEqual(
      [...direto.rankByCombo.entries()].sort(),
    );
  });

  it("N e a contagem de combos COM numero, nao o tamanho de perHeroCombo", () => {
    // O achado colateral do ponto aberto 1 do ADR: `RangeLab.tsx` mostra
    // `callThresholdIndex` de `perHeroCombo.length`, misturando numerador
    // filtrado com denominador cheio. Aqui o denominador e coerente.
    const ranking = rankBluffcatchers([
      heroRow("As", "Ks", 0.9, 20),
      heroRow("Qh", "Qd", 0.5, 2),
      heroRow("7c", "2d", null, null),
      heroRow("3c", "3d", null, null),
    ]);
    expect(ranking.total, "os 2 combos sem numero entraram no denominador").toBe(2);
    expect(
      ranking.order,
      "combo sem equity nao tem posicao: ranquea-lo seria inventar onde ele entra",
    ).toHaveLength(2);
    expect(ranking.rankByCombo.has(comboKey(...hole("7c", "2d")))).toBe(false);
  });

  it("o corte de EV zero e um PREFIXO da ordem por equity", () => {
    // `evCall = equity * finalPot - call` e afim crescente na equity, entao
    // ordenar por EV e ordenar por equity. Se o corte nao for prefixo, um dos
    // dois calculos esta errado.
    const ranking = rankBluffcatchers([
      heroRow("7c", "2d", 0.1, -8),
      heroRow("As", "Ks", 0.9, 20),
      heroRow("Qh", "Qd", 0.5, 2),
      heroRow("Jc", "Jd", 0.4, -1),
    ]);
    expect(ranking.thresholdIndex).toBe(2);
    for (let i = 0; i < ranking.thresholdIndex; i++) {
      const rank = ranking.rankByCombo.get(ranking.order[i]);
      expect(rank, "o corte pulou uma posicao: nao e prefixo").toBe(i + 1);
    }
  });
});

describe("F3b D-F3-31 — thresholdIndex bate com callThresholdIndex do motor", () => {
  const SPOTS: Array<[string, Parameters<typeof runExact>[0]]> = [
    ["flop de referencia da F1", V2_FLOP],
    ["mesmo flop com decisao de fold", V2_FLOP_FOLD],
    ["turn", V2_TURN],
    ["river", V2_RIVER],
    ["river do bloqueador", V3B_RIVER],
    ["flop com um combo bloqueado", V3B_FLOP_ONE_BLOCKED],
    ["river com heroi como range", V3B_RIVER_HERO_RANGE],
    ["flop de 236 combos", V2_PERF_FLOP],
  ];

  for (const [nome, spot] of SPOTS) {
    it(`${nome}: o corte da tela e o corte do motor`, () => {
      const result = runExact(spot, nome);
      const ranking = rankBluffcatchers(result.perHeroCombo);
      expect(
        ranking.thresholdIndex,
        "se divergir, e bug — a spec ja dizia isso antes de existir o modulo",
      ).toBe(result.callThresholdIndex);
      expect(
        ranking.total,
        "N tem que contar os combos com numero do MESMO resultado",
      ).toBe(result.perHeroCombo.filter((r) => r.equity !== null).length);
      expect(ranking.thresholdIndex).toBeLessThanOrEqual(ranking.total);
    });
  }
});
