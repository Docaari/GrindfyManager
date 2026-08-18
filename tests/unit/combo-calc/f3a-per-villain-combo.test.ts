// F3a / D-F3-11 — `perVillainCombo`: uma corrida so alimenta os DOIS lados.
// Spec  : Docs/specs/range-lab/F3a-leitura-categorias.md (criterio 2c + "Mudanca
//         de contrato do motor")
// Porque: Docs/specs/range-lab/F3-detalhamento.md (achado F-2, D-F3-11, D-F3-18, D-F3-20)
// ADR   : Docs/architecture/decisions/248-...-f3a-leitura-categorias.md
//
// O QUE ESTE ARQUIVO PROTEGE
//
// 1. ADITIVO. Quem consome `EngineResultOk` hoje nao pode quebrar nem mudar de
//    numero. O campo novo nunca aparece em `EngineResultDegraded`.
// 2. A IDENTIDADE. `heroRangeEquity + villainRangeEquity == 1` no modo exato.
//    Ela vale porque os dois agregados dividem o MESMO denominador e os
//    numeradores somam esse denominador (o chop conta 0,5 dos dois lados). E o
//    teste que prova que a corrida unica nao divergiu — a alternativa recusada
//    (rodar o motor de novo com os lados trocados) mostraria "58,3% contra 41,8%"
//    sem ninguem saber qual dos dois esta certo.
// 3. A ARMADILHA DO MONTE CARLO (D-F3-18). O acumulador do vilao NAO e o espelho
//    do heroi: o vilao ja e sorteado proporcional ao peso, enquanto os combos do
//    heroi sao percorridos exaustivamente e o peso deles nunca entrou na
//    amostragem. Contagem simples estima a equity do vilao contra um range de
//    heroi UNIFORME — plausivel, estavel, reproduzivel e errado.
import { describe, it, expect } from "vitest";
import { runEngineToCompletion } from "@/lib/combo-calc/engine/run";
import { boardDeadSet, expandRangeV2 } from "@/lib/combo-calc/engine/expand";
import { DEFAULT_SEED } from "@/lib/combo-calc/engine/random";
import { comboKey } from "@/lib/combo-calc/cards";
import type { EngineRequest, EngineResult } from "@/lib/combo-calc/engine/types";
import type { Card } from "@/lib/combo-calc/types";
import { FLOP_HERO_EQUITY, V2_EMPTY_HERO, V2_FLOP, V2_NO_VALID_PAIRS } from "./f1-fixtures";
import {
  MC_WATCHED_VILLAIN_COMBO,
  hole,
  V2_MC_HERO_EQUAL,
  V2_MC_HERO_UNEVEN,
  V2_UNEVEN_HERO,
  V2_UNEVEN_HERO_RIVER,
  V2_UNEVEN_HERO_TURN,
  V2_VILLAIN_COMBO_WITHOUT_OPPONENT,
  label,
  type SpotV2Like,
} from "./f3a-fixtures";

const EPS = 1e-9;

function exact(spot: SpotV2Like): EngineRequest {
  return { spot: spot as EngineRequest["spot"], mode: "exact" };
}

function mc(spot: SpotV2Like, samples = 20_000): EngineRequest {
  return { spot: spot as EngineRequest["spot"], mode: "monte_carlo", seed: DEFAULT_SEED, samples };
}

function ok(result: EngineResult, tag: string): Extract<EngineResult, { status: "ok" }> {
  if (result.status !== "ok") throw new Error(`${tag}: esperava ok, veio degraded (${result.reason})`);
  return result;
}

function findVillain(result: Extract<EngineResult, { status: "ok" }>, combo: [Card, Card]) {
  const wanted = comboKey(combo[0], combo[1]);
  const row = result.perVillainCombo.find((c) => comboKey(c.combo[0], c.combo[1]) === wanted);
  if (!row) throw new Error(`combo do vilao ${wanted} nao esta em perVillainCombo`);
  return row;
}

// ── 1. aditivo: o consumidor da F1 nao muda de numero ────────

/**
 * Shape do `EngineResultOk` COMO A F1 O DEIXOU — copiado aqui de proposito. Se a
 * F3a remover ou trocar o tipo de qualquer campo desta lista, este arquivo para
 * de compilar em `npm run check`, que e exatamente o alarme que se quer.
 */
interface F1EngineResultOk {
  status: "ok";
  mode: "exact" | "monte_carlo";
  seed: number | null;
  samples: number | null;
  heroRangeEquity: number;
  requiredEquity: number;
  evCall: number;
  decision: "call" | "fold" | "breakeven";
  confidence: { level: 0.95; halfWidth: number } | null;
  perHeroCombo: Array<{
    weight: number;
    pairMass: number;
    equity: number | null;
    evCall: number | null;
    confidenceHalfWidth: number | null;
    sampleCount: number | null;
  }>;
  callThresholdIndex: number;
  runoutsPerPair: number;
  totalShowdowns: number;
  emptyHeroEntries: string[];
  emptyVillainEntries: string[];
}

/** Consumidor escrito ANTES da F3a: ele nao sabe que `perVillainCombo` existe. */
function legacyConsumer(result: F1EngineResultOk): number {
  return result.perHeroCombo.reduce((acc, c) => acc + (c.equity ?? 0) * c.weight, 0);
}

describe("F3a D-F3-11 — `perVillainCombo` e ADITIVO", () => {
  it("o consumidor da F1 continua compilando e produzindo o mesmo numero", () => {
    const result = ok(runEngineToCompletion(exact(V2_FLOP)), "V2_FLOP");
    const esperado = result.perHeroCombo.reduce((acc, c) => acc + (c.equity ?? 0) * c.weight, 0);
    expect(legacyConsumer(result)).toBe(esperado);
  });

  it("todo campo que a F1 entregou continua presente e com o mesmo tipo", () => {
    // `tsconfig.json` EXCLUI `**/*.test.ts`, entao a interface `F1EngineResultOk`
    // acima nao passa por `npm run check` — ela documenta, mas nao cobra. Esta
    // verificacao em runtime e quem de fato cobra.
    const result = ok(runEngineToCompletion(exact(V2_FLOP)), "shape da F1");
    const esperado: Record<string, string> = {
      status: "string",
      mode: "string",
      heroRangeEquity: "number",
      requiredEquity: "number",
      evCall: "number",
      decision: "string",
      callThresholdIndex: "number",
      runoutsPerPair: "number",
      totalShowdowns: "number",
    };
    const bruto = result as unknown as Record<string, unknown>;
    for (const [campo, tipo] of Object.entries(esperado)) {
      expect(typeof bruto[campo], `campo ${campo} da F1 mudou de tipo ou sumiu`).toBe(tipo);
    }
    expect(Array.isArray(result.perHeroCombo)).toBe(true);
    expect(Array.isArray(result.emptyHeroEntries)).toBe(true);
    expect(Array.isArray(result.emptyVillainEntries)).toBe(true);
    expect("seed" in bruto && "samples" in bruto && "confidence" in bruto).toBe(true);
  });

  it("nenhum campo da F1 mudou de valor no caso medido do ADR-246", () => {
    const result = ok(runEngineToCompletion(exact(V2_FLOP)), "V2_FLOP");
    expect(
      Math.abs(result.heroRangeEquity - FLOP_HERO_EQUITY),
      `heroRangeEquity=${result.heroRangeEquity}, medido na F1=${FLOP_HERO_EQUITY}: ` +
        "o acumulo do lado do vilao nao pode mexer no numero do heroi",
    ).toBeLessThan(1e-9);
    expect(result.runoutsPerPair).toBe(990);
    expect(result.confidence).toBeNull();
  });

  it("resultado DEGRADADO nao carrega perVillainCombo nem villainRangeEquity", () => {
    for (const [tag, spot] of [
      ["heroi vazio", V2_EMPTY_HERO],
      ["sem par valido", V2_NO_VALID_PAIRS],
    ] as const) {
      const result = runEngineToCompletion(exact(spot));
      expect(result.status, tag).toBe("degraded");
      const bruto = result as unknown as Record<string, unknown>;
      expect(
        bruto.perVillainCombo,
        `${tag}: campo novo num resultado degradado e o "-13,8 fichas fantasma" voltando`,
      ).toBeUndefined();
      expect(bruto.villainRangeEquity, tag).toBeUndefined();
    }
  });

  it("ha uma linha por combo VIVO do range do vilao", () => {
    const result = ok(runEngineToCompletion(exact(V2_UNEVEN_HERO)), "linhas");
    const esperado = expandRangeV2(
      V2_UNEVEN_HERO.villainRange,
      boardDeadSet(V2_UNEVEN_HERO.board),
    );
    expect(result.perVillainCombo).toHaveLength(esperado.combos.length);

    const vistos = new Set(result.perVillainCombo.map((c) => comboKey(c.combo[0], c.combo[1])));
    for (const c of esperado.combos) {
      expect(vistos.has(comboKey(c.combo[0], c.combo[1])), "combo do vilao sumiu da lista").toBe(
        true,
      );
    }
  });
});

// ── D-F3-20: sem evCall e sem decision do lado do vilao ──────

describe("F3a D-F3-20 — o lado do vilao nao ganha evCall nem decision", () => {
  it("nenhuma linha do vilao carrega os dois campos", () => {
    const result = ok(runEngineToCompletion(exact(V2_UNEVEN_HERO)), "sem evCall");
    for (const row of result.perVillainCombo) {
      const bruto = row as unknown as Record<string, unknown>;
      expect(
        bruto.evCall,
        "quem enfrenta a aposta e o heroi: um EV de call do lado do vilao seria um " +
          "numero finito, calculavel e sem pergunta correspondente na tela",
      ).toBeUndefined();
      expect(bruto.decision).toBeUndefined();
    }
  });

  it("a linha do vilao tem exatamente os campos que a spec lista", () => {
    const result = ok(runEngineToCompletion(exact(V2_UNEVEN_HERO)), "shape");
    const row = result.perVillainCombo[0];
    expect(Array.isArray(row.combo)).toBe(true);
    expect(row.combo).toHaveLength(2);
    expect(typeof row.weight).toBe("number");
    expect(typeof row.pairMass).toBe("number");
    expect(row.equity === null || typeof row.equity === "number").toBe(true);
    expect(row.degradedReason === null || typeof row.degradedReason === "string").toBe(true);
  });
});

// ── 2. a identidade heroi + vilao = 1 (criterio 2c) ──────────

describe("F3a criterio 2c — no modo exato, heroRangeEquity + villainRangeEquity = 1", () => {
  const CASOS: Array<[string, SpotV2Like]> = [
    ["flop", V2_UNEVEN_HERO],
    ["turn", V2_UNEVEN_HERO_TURN],
    ["river", V2_UNEVEN_HERO_RIVER],
    ["mao unica do heroi", V2_FLOP],
  ];

  for (const [rua, spot] of CASOS) {
    it(`fecha em 1e-9 no ${rua} (bordo ${label(spot.board)}), com pesos desiguais`, () => {
      const result = ok(runEngineToCompletion(exact(spot)), rua);
      const soma = result.heroRangeEquity + result.villainRangeEquity;
      expect(
        Math.abs(soma - 1),
        `heroi=${result.heroRangeEquity} vilao=${result.villainRangeEquity} soma=${soma}. ` +
          "Duas corridas separadas divergiriam por ULPs; uma corrida so fecha por construcao",
      ).toBeLessThan(EPS);
    });
  }

  it("a identidade tambem fecha quando recalculada a partir das duas listas", () => {
    const result = ok(runEngineToCompletion(exact(V2_UNEVEN_HERO)), "recalculo");

    const agregado = (rows: Array<{ weight: number; pairMass: number; equity: number | null }>) => {
      let num = 0;
      let den = 0;
      for (const r of rows) {
        if (r.equity === null) continue;
        const peso = r.weight * r.pairMass;
        num += peso * r.equity;
        den += peso;
      }
      return { num, den };
    };

    const heroi = agregado(result.perHeroCombo);
    const vilao = agregado(result.perVillainCombo);

    expect(
      Math.abs(heroi.den - vilao.den),
      `denominadores diferentes (${heroi.den} vs ${vilao.den}): os dois lados precisam ` +
        "somar sobre os MESMOS pares validos, senao a identidade e coincidencia",
    ).toBeLessThan(1e-6);
    expect(Math.abs(heroi.num / heroi.den - result.heroRangeEquity)).toBeLessThan(1e-9);
    expect(Math.abs(vilao.num / vilao.den - result.villainRangeEquity)).toBeLessThan(1e-9);
  });

  it("a massa que cada combo do vilao enfrenta e a soma dos pesos do heroi que nao colidem", () => {
    const result = ok(runEngineToCompletion(exact(V2_MC_HERO_UNEVEN)), "pairMass do vilao");
    const observado = findVillain(result, MC_WATCHED_VILLAIN_COMBO);
    expect(
      Math.abs(observado.pairMass - 1.1),
      `pairMass=${observado.pairMass}: KcKd enfrenta AsKs (peso 1) e 7c2d (peso 0,1)`,
    ).toBeLessThan(EPS);
  });
});

// ── 3. combo do vilao sem oponente ───────────────────────────

describe("F3a D-F3-11 — combo do vilao sem oponente sai null com razao, nunca 0", () => {
  for (const modo of ["exact", "monte_carlo"] as const) {
    it(`${modo}: KsQs bloqueado pela unica mao do heroi degrada com razao nomeada`, () => {
      const request =
        modo === "exact"
          ? exact(V2_VILLAIN_COMBO_WITHOUT_OPPONENT)
          : mc(V2_VILLAIN_COMBO_WITHOUT_OPPONENT, 5_000);
      const result = ok(runEngineToCompletion(request), modo);

      const orfao = findVillain(result, hole("Ks", "Qs"));
      expect(orfao.pairMass).toBe(0);
      expect(
        orfao.equity,
        "0% aqui seria um numero errado com cara de certo — a regra que rege a frente",
      ).toBeNull();
      expect(orfao.degradedReason).toBe("no_valid_villain_combo");

      const vivo = findVillain(result, hole("2c", "2d"));
      expect(vivo.equity, "o combo que TEM oponente continua com numero").not.toBeNull();
      expect(vivo.degradedReason).toBeNull();
    });
  }

  it("a razao vem da uniao ja existente do lado do heroi (nomes espelhados)", () => {
    const result = ok(
      runEngineToCompletion(mc(V2_VILLAIN_COMBO_WITHOUT_OPPONENT, 5_000)),
      "uniao de razoes",
    );
    for (const row of result.perVillainCombo) {
      if (row.degradedReason === null) continue;
      expect(
        ["no_valid_villain_combo", "insufficient_samples"],
        `razao "${row.degradedReason}" fora da uniao — o consumidor guarda por status/null, ` +
          "nao pela razao especifica, mas a uniao nao pode crescer em silencio",
      ).toContain(row.degradedReason);
    }
  });

  it("equity null e degradedReason null nunca aparecem juntos", () => {
    const result = ok(runEngineToCompletion(exact(V2_UNEVEN_HERO)), "invariante");
    for (const row of result.perVillainCombo) {
      const key = comboKey(row.combo[0], row.combo[1]);
      if (row.equity === null) {
        expect(row.degradedReason, `${key}: sem numero e sem razao`).not.toBeNull();
      } else {
        expect(row.degradedReason, `${key}: numero e razao ao mesmo tempo`).toBeNull();
        expect(Number.isFinite(row.equity)).toBe(true);
      }
    }
  });
});

// ── 4. a armadilha do Monte Carlo (D-F3-18) ──────────────────

describe("F3a D-F3-18 — o acumulador do vilao carrega hero.weight EXPLICITAMENTE", () => {
  it("mudar so o PESO do range do heroi muda a equity do combo do vilao", () => {
    const iguais = ok(runEngineToCompletion(mc(V2_MC_HERO_EQUAL)), "pesos iguais");
    const desiguais = ok(runEngineToCompletion(mc(V2_MC_HERO_UNEVEN)), "pesos desiguais");

    const a = findVillain(iguais, MC_WATCHED_VILLAIN_COMBO).equity;
    const b = findVillain(desiguais, MC_WATCHED_VILLAIN_COMBO).equity;
    expect(a, "KcKd sem numero com pesos iguais").not.toBeNull();
    expect(b, "KcKd sem numero com pesos desiguais").not.toBeNull();

    expect(
      Math.abs((a as number) - (b as number)),
      `pesos iguais -> ${a}; pesos desiguais -> ${b}. ` +
        "Contagem simples sobre as amostras estimaria a equity do vilao contra um range " +
        "de heroi UNIFORME, e os dois numeros sairiam identicos",
    ).toBeGreaterThan(0.1);
  });

  it("controle: a equity POR COMBO do heroi nao muda entre as duas corridas", () => {
    // Os pesos do heroi nao entram na amostragem (`pickVillain` usa o peso do
    // vilao; a rejeicao usa colisao de carta). Com a mesma semente as amostras
    // aceitas sao IDENTICAS — entao a diferenca medida acima so pode vir da
    // ponderacao, e nao de ruido de amostragem.
    const iguais = ok(runEngineToCompletion(mc(V2_MC_HERO_EQUAL)), "controle iguais");
    const desiguais = ok(runEngineToCompletion(mc(V2_MC_HERO_UNEVEN)), "controle desiguais");

    for (const linha of iguais.perHeroCombo) {
      const key = comboKey(linha.combo[0], linha.combo[1]);
      const par = desiguais.perHeroCombo.find((c) => comboKey(c.combo[0], c.combo[1]) === key);
      expect(par, `${key} sumiu na segunda corrida`).toBeDefined();
      expect(par!.equity, `${key}: a equity por combo do heroi nao depende do peso dele`).toBe(
        linha.equity,
      );
      expect(par!.sampleCount, `${key}: as amostras aceitas precisam ser as mesmas`).toBe(
        linha.sampleCount,
      );
    }
  });

  it("o Monte Carlo e reprodutivel tambem do lado do vilao", () => {
    const a = ok(runEngineToCompletion(mc(V2_MC_HERO_UNEVEN)), "run a");
    const b = ok(runEngineToCompletion(mc(V2_MC_HERO_UNEVEN)), "run b");
    // A existencia vem ANTES da igualdade: `undefined` e igual a `undefined`, e
    // sem esta linha o teste passaria em verde com o campo inexistente.
    expect(Array.isArray(a.perVillainCombo), "perVillainCombo ausente").toBe(true);
    expect(a.perVillainCombo.length).toBeGreaterThan(0);
    expect(b.perVillainCombo).toEqual(a.perVillainCombo);
  });

  it("no Monte Carlo o combo do vilao carrega meia-largura e contagem; no exato, nao", () => {
    const aproximado = ok(runEngineToCompletion(mc(V2_UNEVEN_HERO)), "mc");
    for (const row of aproximado.perVillainCombo) {
      if (row.equity === null) continue;
      const key = comboKey(row.combo[0], row.combo[1]);
      expect(row.sampleCount, `${key}: sem contagem de amostras`).not.toBeNull();
      expect(row.confidenceHalfWidth, `${key}: numero aproximado sem margem`).not.toBeNull();
    }

    const exato = ok(runEngineToCompletion(exact(V2_UNEVEN_HERO)), "exato");
    for (const row of exato.perVillainCombo) {
      expect(row.sampleCount).toBeNull();
      expect(row.confidenceHalfWidth).toBeNull();
    }
  });

  it("a equity por categoria pode vir PARCIAL no Monte Carlo — e isso e limite declarado, nao bug", () => {
    // Um combo do vilao so aparece nas amostras em que foi sorteado; com peso
    // baixo, pode nao receber amostra nenhuma. O contrato aqui e so um: nunca 0.
    const result = ok(runEngineToCompletion(mc(V2_UNEVEN_HERO, 1_200)), "parcial");
    for (const row of result.perVillainCombo) {
      if (row.equity !== null) continue;
      expect(row.degradedReason, "sem numero exige razao").not.toBeNull();
    }
    expect(
      result.perVillainCombo.some((c) => c.equity !== null),
      "no minimo um combo do vilao precisa ter numero, senao o painel nao tem coluna",
    ).toBe(true);
  });
});
