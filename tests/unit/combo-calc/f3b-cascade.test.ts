// F3b / RF-03.2 — a cascata: cinco degraus, cada um com fonte nomeada.
// Spec  : Docs/specs/range-lab/F3b-decisao.md (RF-03.2, criterio 6 REESCRITO)
// ADR   : Docs/architecture/decisions/249-range-lab-f3b-decisao.md
//         (Refutacao 2, Refutacao 3, D-F3-26)
//
// O QUE ESTE ARQUIVO PROTEGE
//
// 1. A INVARIANTE E NO DEGRAU 3, nao no 5 (Refutacao 3). O criterio de aceite
//    original dizia "o total do ultimo degrau bate com a massa do range"; o
//    degrau 5 e subconjunto do 4, que e subconjunto do 3, e se ele batesse com o
//    bloco de maos feitas da F3a um dos dois estaria errado. O que os dois
//    paineis TEM que compartilhar e o ponto de partida.
// 2. O DEGRAU 4 NAO E `sum(pairMass)` (Refutacao 2). Somar `villainPairMass`
//    sobre `v` da massa do HEROI contada uma vez por combo do vilao: com heroi de
//    massa 1 e 200 combos vivos, marcaria 200 embaixo de um degrau 3 que marcou
//    138 — a barra SUBIRIA. A grandeza certa e ponderada por `heroTotalWeight`.
// 3. O DEGRAU 2 SAI DE `expandRangeV2` COM AS MORTAS VAZIAS, e nao de
//    `enumerateCombos` por fora: e `expandRangeV2` quem faz filtro de naipe,
//    `clampFreq` e o DEDUPE por `comboKey` que impede "AKs" mais "AsKs" de contar
//    duas vezes. O dedupe e o que ninguem lembraria de reimplementar.
// 4. DEGRAU AUSENTE NAO E DEGRAU ZERO. Sem resultado, os degraus 4 e 5 saem
//    `unavailable` com razao: massa zero na barra seria lida como "as suas cartas
//    mataram o range inteiro".
import { describe, it, expect } from "vitest";
import { buildCascade } from "@/lib/combo-calc/cascade";
import type { CascadeStep, CascadeStepId } from "@/lib/combo-calc/cascade";
import { splitByConfrontation } from "@/lib/combo-calc/confront";
import { buildRangeRead } from "@/lib/combo-calc/read";
import { boardDeadSet, expandRangeV2 } from "@/lib/combo-calc/engine/expand";
import type { EngineResult } from "@/lib/combo-calc/engine/types";
import {
  BOARD_EATS_AFTER_BOARD,
  BOARD_EATS_COMBO_BOARD,
  BOARD_EATS_COMBO_RANGE,
  BOARD_EATS_DECLARED,
  EPS,
  OVERLAPPING_DECLARED,
  OVERLAPPING_RANGE,
  RIVER_BLOCKED_MASS,
  RIVER_HERO,
  V3B_FLOP_ONE_BLOCKED,
  V3B_RIVER,
  V3B_RIVER_HERO_RANGE,
  V3B_WIDE_FLOP,
  aliveVillainRows,
  heroTotalWeight,
  runExact,
  type SpotV2Like,
} from "./f3b-fixtures";
import { V2_FLOP, V2_TURN, V2_RIVER } from "./f1-fixtures";

const ORDEM: CascadeStepId[] = [
  "nominal",
  "declared",
  "after_board_removal",
  "after_mutual_removal",
  "loses_to_hero",
];

function stepOk(steps: readonly CascadeStep[], id: CascadeStepId) {
  const step = steps.find((s) => s.id === id);
  if (!step) throw new Error(`degrau ${id} ausente da cascata`);
  if (step.status !== "ok") {
    throw new Error(`degrau ${id} veio unavailable (${step.reason}); o caso e valido`);
  }
  return step;
}

function stepOf(steps: readonly CascadeStep[], id: CascadeStepId): CascadeStep {
  const step = steps.find((s) => s.id === id);
  if (!step) throw new Error(`degrau ${id} ausente da cascata`);
  return step;
}

function cascadeOf(spot: SpotV2Like, tag: string) {
  const result = runExact(spot, tag);
  const cascade = buildCascade({
    villainRange: spot.villainRange,
    board: spot.board,
    result,
  });
  return { result, cascade };
}

// ── forma ────────────────────────────────────────────────────

describe("F3b D-F3-26 — a cascata tem sempre cinco degraus, sempre na mesma ordem", () => {
  it("cinco degraus, na ordem, mesmo sem resultado", () => {
    const cascade = buildCascade({
      villainRange: V3B_RIVER.villainRange,
      board: V3B_RIVER.board,
      result: null,
    });
    expect(cascade.steps.map((s) => s.id)).toEqual(ORDEM);
  });

  it("o degrau nominal e a constante 1326, sempre", () => {
    const { cascade } = cascadeOf(V3B_RIVER, "nominal");
    const nominal = stepOk(cascade.steps, "nominal");
    expect(nominal.mass).toBe(1326);
    expect(nominal.combos).toBe(1326);
    expect(nominal.basis, "so o degrau 5 declara base").toBeNull();
  });

  it("so o degrau 5 declara base; os quatro primeiros nao", () => {
    const { cascade } = cascadeOf(V3B_RIVER, "base por degrau");
    for (const id of ORDEM.slice(0, 4)) {
      const step = stepOk(cascade.steps, id);
      expect(step.basis, `degrau ${id} declarou base`).toBeNull();
    }
    expect(stepOk(cascade.steps, "loses_to_hero").basis).toBe("discrete");
    expect(cascade.basis).toBe("discrete");
  });
});

// ── degrau 2 contra degrau 3 ─────────────────────────────────

describe("F3b D-F3-26 — o degrau 2 e o declarado; o 3 e o que sobrou do bordo", () => {
  it("AKs com o As no bordo: 4 declarados, 3 depois do bordo", () => {
    const cascade = buildCascade({
      villainRange: BOARD_EATS_COMBO_RANGE,
      board: BOARD_EATS_COMBO_BOARD,
      result: null,
    });
    expect(stepOk(cascade.steps, "declared").mass).toBe(BOARD_EATS_DECLARED);
    expect(stepOk(cascade.steps, "after_board_removal").mass).toBe(BOARD_EATS_AFTER_BOARD);
  });

  it("o degrau 2 deduplica: 'AKs' mais 'AsKs' contam 4 combos, nao 5", () => {
    // Chamar `enumerateCombos` por fora reimplementaria parse, filtro de naipe,
    // clampFreq e o dedupe — e o dedupe e o que ninguem lembraria.
    const cascade = buildCascade({
      villainRange: OVERLAPPING_RANGE,
      board: BOARD_EATS_COMBO_BOARD,
      result: null,
    });
    expect(stepOk(cascade.steps, "declared").mass).toBe(OVERLAPPING_DECLARED);
  });

  it("o degrau 2 ignora o bordo por definicao (mortas vazias)", () => {
    const semBordo = expandRangeV2(BOARD_EATS_COMBO_RANGE, new Set<string>());
    const cascadeComBordo = buildCascade({
      villainRange: BOARD_EATS_COMBO_RANGE,
      board: BOARD_EATS_COMBO_BOARD,
      result: null,
    });
    const cascadeSemBordo = buildCascade({
      villainRange: BOARD_EATS_COMBO_RANGE,
      board: [],
      result: null,
    });
    expect(stepOk(cascadeComBordo.steps, "declared").mass).toBe(semBordo.totalWeight);
    expect(stepOk(cascadeSemBordo.steps, "declared").mass).toBe(semBordo.totalWeight);
  });

  it("o degrau 3 usa exatamente `expandRangeV2` com as cartas do bordo", () => {
    const esperado = expandRangeV2(
      V3B_RIVER.villainRange,
      boardDeadSet(V3B_RIVER.board),
    ).totalWeight;
    const { cascade } = cascadeOf(V3B_RIVER, "degrau 3");
    expect(Math.abs(stepOk(cascade.steps, "after_board_removal").mass - esperado)).toBeLessThan(EPS);
  });
});

// ── a invariante da Refutacao 3 ──────────────────────────────

describe("F3b criterio 6 REESCRITO — degrau 3 e o total do painel de categorias da F3a", () => {
  const SPOTS: Array<[string, SpotV2Like]> = [
    ["river do bloqueador", V3B_RIVER],
    ["flop com um bloqueado", V3B_FLOP_ONE_BLOCKED],
    ["river com heroi como range", V3B_RIVER_HERO_RANGE],
    ["flop de referencia da F1", V2_FLOP],
    ["turn de referencia da F1", V2_TURN],
    ["river de referencia da F1", V2_RIVER],
  ];

  for (const [nome, spot] of SPOTS) {
    it(`${nome}: degrau3 === buildRangeRead(...).totalMass`, () => {
      const { result, cascade } = cascadeOf(spot, nome);
      // Exatamente como `RangeLab.tsx` monta hoje: `perVillainCombo` INTEIRO,
      // bloqueados inclusive. E o que faz os dois paineis contarem a mesma
      // historia — e a queda do 3 para o 4 e o que a cascata existe para mostrar.
      const read = buildRangeRead(
        result.perVillainCombo.map((row) => ({
          combo: row.combo,
          weight: row.weight,
          equity: row.equity,
        })),
        spot.board,
      );
      expect(
        Math.abs(stepOk(cascade.steps, "after_board_removal").mass - read.totalMass),
        "os dois paineis partiram de pontos diferentes",
      ).toBeLessThan(1e-9);
    });
  }

  it("o degrau 5 NAO bate com o total da F3a — e se batesse, um dos dois estaria errado", () => {
    const { result, cascade } = cascadeOf(V3B_RIVER, "degrau 5 nao e o total");
    const read = buildRangeRead(
      result.perVillainCombo.map((row) => ({
        combo: row.combo,
        weight: row.weight,
        equity: row.equity,
      })),
      V3B_RIVER.board,
    );
    expect(stepOk(cascade.steps, "loses_to_hero").mass).toBeLessThan(read.totalMass);
  });
});

// ── o degrau 4 e a Refutacao 2 ───────────────────────────────

describe("F3b Refutacao 2 — o degrau 4 e ponderado pela massa do heroi", () => {
  it("com heroi de mao unica colapsa na soma dos pesos dos combos VIVOS", () => {
    const { result, cascade } = cascadeOf(V3B_RIVER, "degrau 4 mao unica");
    const vivos = aliveVillainRows(result).reduce((acc, row) => acc + row.weight, 0);
    expect(Math.abs(stepOk(cascade.steps, "after_mutual_removal").mass - vivos)).toBeLessThan(EPS);
    expect(vivos).toBe(3);
  });

  it("bate com a formula ponderada em heroi como RANGE", () => {
    const { result, cascade } = cascadeOf(V3B_RIVER_HERO_RANGE, "degrau 4 range");
    const total = heroTotalWeight(result);
    const esperado = result.perVillainCombo.reduce(
      (acc, row) => acc + (row.weight * row.pairMass) / total,
      0,
    );
    expect(
      Math.abs(stepOk(cascade.steps, "after_mutual_removal").mass - esperado),
      "o degrau 4 nao esta na mesma unidade do degrau 3",
    ).toBeLessThan(1e-9);
  });

  it("NAO e `sum(pairMass)` cru — a soma crua estoura o degrau 3", () => {
    // Com heroi como range, `sum(villainPairMass)` conta massa do HEROI uma vez
    // por combo do vilao e passa do degrau de cima. Este teste e a barra
    // SUBINDO, que e o sintoma visivel do erro que a Refutacao 2 corrigiu.
    // Fixture: heroi com 2 combos (massa 2), 6 combos do vilao -> soma crua 9
    // contra um degrau 3 de 6.
    const { result, cascade } = cascadeOf(V3B_RIVER_HERO_RANGE, "soma crua");
    const somaCrua = result.perVillainCombo.reduce((acc, row) => acc + row.pairMass, 0);
    const d3 = stepOk(cascade.steps, "after_board_removal").mass;
    const d4 = stepOk(cascade.steps, "after_mutual_removal").mass;
    expect(somaCrua, "o fixture perdeu a assimetria que denuncia a soma crua").toBeGreaterThan(d3);
    expect(d4, "o degrau 4 esta somando pairMass cru").toBeLessThanOrEqual(d3 + EPS);
  });
});

// ── monotonia e blockedMass ──────────────────────────────────

describe("F3b D-F3-26 — a barra so pode descer", () => {
  const SPOTS: Array<[string, SpotV2Like]> = [
    ["river do bloqueador", V3B_RIVER],
    ["flop com um bloqueado", V3B_FLOP_ONE_BLOCKED],
    ["river com heroi como range", V3B_RIVER_HERO_RANGE],
    ["flop largo", V3B_WIDE_FLOP],
    ["flop da F1", V2_FLOP],
    ["river da F1", V2_RIVER],
  ];

  for (const [nome, spot] of SPOTS) {
    it(`${nome}: 1326 >= d2 >= d3 >= d4 >= d5`, () => {
      const { cascade } = cascadeOf(spot, nome);
      const massas = ORDEM.map((id) => stepOk(cascade.steps, id).mass);
      for (let i = 1; i < massas.length; i++) {
        expect(
          massas[i],
          `degrau ${ORDEM[i]} (${massas[i]}) subiu acima de ${ORDEM[i - 1]} (${massas[i - 1]})`,
        ).toBeLessThanOrEqual(massas[i - 1] + EPS);
      }
      expect(massas[0]).toBe(1326);
    });
  }

  it("blockedMass e a diferenca do degrau 3 para o degrau 4", () => {
    const { cascade } = cascadeOf(V3B_RIVER, "blockedMass");
    const d3 = stepOk(cascade.steps, "after_board_removal").mass;
    const d4 = stepOk(cascade.steps, "after_mutual_removal").mass;
    expect(cascade.blockedMass).not.toBeNull();
    expect(Math.abs((cascade.blockedMass as number) - (d3 - d4))).toBeLessThan(EPS);
    expect(
      Math.abs((cascade.blockedMass as number) - RIVER_BLOCKED_MASS),
      "os tres combos que as suas cartas mataram",
    ).toBeLessThan(EPS);
  });

  it("o degrau 5 fica entre o que perde e o que perde mais o chop", () => {
    // O ADR nomeia o degrau `loses_to_hero`; a spec escreve a linha como "perde
    // para voce / chop". O teste trava a faixa em que as duas leituras cabem, e
    // recusa qualquer coisa fora dela (o total dos vivos, por exemplo).
    const { result, cascade } = cascadeOf(V3B_RIVER, "degrau 5");
    const split = splitByConfrontation({
      hero: RIVER_HERO,
      rows: aliveVillainRows(result).map((r) => ({
        combo: r.combo,
        weight: r.weight,
        equity: r.equity,
      })),
      board: V3B_RIVER.board,
      basis: "discrete",
    });
    const d5 = stepOk(cascade.steps, "loses_to_hero").mass;
    expect(d5).toBeGreaterThanOrEqual(split.bluff.mass - EPS);
    expect(d5).toBeLessThanOrEqual(split.bluff.mass + split.chop.mass + EPS);
  });
});

// ── contagem por base ────────────────────────────────────────

describe("F3b D-F3-26 — a contagem do degrau 5 depende da base", () => {
  it("river com mao unica: base discrete e contagem inteira", () => {
    const { cascade } = cascadeOf(V3B_RIVER, "contagem discreta");
    const step = stepOk(cascade.steps, "loses_to_hero");
    expect(step.basis).toBe("discrete");
    expect(step.combos, "a base discrete produz contagem").not.toBeNull();
    expect(Number.isInteger(step.combos as number)).toBe(true);
  });

  it("fora do river: base effective e contagem NULL", () => {
    // `null` ali significa "esta base nao produz contagem", e e o que faz a tela
    // escrever `massa efetiva` em vez de `combos que perdem`.
    const { cascade } = cascadeOf(V3B_FLOP_ONE_BLOCKED, "contagem efetiva");
    const step = stepOk(cascade.steps, "loses_to_hero");
    expect(step.basis).toBe("effective");
    expect(step.combos).toBeNull();
    expect(cascade.basis).toBe("effective");
  });

  it("river com heroi como range tambem e effective", () => {
    const { cascade } = cascadeOf(V3B_RIVER_HERO_RANGE, "river em modo range");
    expect(stepOk(cascade.steps, "loses_to_hero").basis).toBe("effective");
    expect(stepOk(cascade.steps, "loses_to_hero").combos).toBeNull();
  });
});

// ── degradacao ───────────────────────────────────────────────

describe("F3b D-F3-34 — sem corrida, os tres primeiros degraus continuam de pe", () => {
  it("result null: 1 a 3 ok, 4 e 5 unavailable com razao no_result", () => {
    const cascade = buildCascade({
      villainRange: V3B_RIVER.villainRange,
      board: V3B_RIVER.board,
      result: null,
    });
    for (const id of ORDEM.slice(0, 3)) {
      expect(stepOf(cascade.steps, id).status, `degrau ${id} sumiu sem o motor`).toBe("ok");
    }
    for (const id of ORDEM.slice(3)) {
      const step = stepOf(cascade.steps, id);
      expect(step.status).toBe("unavailable");
      if (step.status !== "unavailable") return;
      expect(step.reason).toBe("no_result");
    }
    expect(cascade.basis).toBeNull();
    expect(cascade.blockedMass).toBeNull();
  });

  it("result degradado: razao engine_degraded, e nunca massa zero", () => {
    // Massa zero na barra seria lida como "as suas cartas mataram o range
    // inteiro" — a diferenca entre "nao sei" e "e zero".
    const degradado: EngineResult = {
      status: "degraded",
      reason: "empty_hero_range",
      mode: "exact",
      requiredEquity: 0.25,
    };
    const cascade = buildCascade({
      villainRange: V3B_RIVER.villainRange,
      board: V3B_RIVER.board,
      result: degradado,
    });
    for (const id of ORDEM.slice(3)) {
      const step = stepOf(cascade.steps, id);
      expect(step.status).toBe("unavailable");
      if (step.status !== "unavailable") return;
      expect(step.reason).toBe("engine_degraded");
      expect(
        (step as unknown as Record<string, unknown>).mass,
        "degrau indisponivel carregando massa: alguem vai le-la",
      ).toBeUndefined();
    }
  });

  it("range vazio nao vira NaN: os degraus locais saem zerados e declarados", () => {
    const cascade = buildCascade({ villainRange: [], board: V3B_RIVER.board, result: null });
    expect(stepOk(cascade.steps, "declared").mass).toBe(0);
    expect(stepOk(cascade.steps, "after_board_removal").mass).toBe(0);
    expect(Number.isNaN(stepOk(cascade.steps, "nominal").mass)).toBe(false);
  });

  it("sem bordo, degrau 2 e degrau 3 sao iguais", () => {
    const cascade = buildCascade({
      villainRange: V3B_RIVER.villainRange,
      board: [],
      result: null,
    });
    expect(stepOk(cascade.steps, "declared").mass).toBe(
      stepOk(cascade.steps, "after_board_removal").mass,
    );
  });
});
