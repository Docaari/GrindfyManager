// F1 / RF-01.4 — Monte Carlo: reprodutivel, com intervalo, e com card removal
// que continua EXATO dentro da amostragem.
// Spec: Docs/specs/range-lab/F1-motor.md (RF-01.4)
// ADR : Docs/architecture/decisions/246-range-lab-f1-motor.md (D-F1-5)
//
// Criterio de aceite 4: numero de Monte Carlo sem intervalo de confianca e bug.
// O heroi permanece EXAUSTIVO — amostra-se o par (combo do vilao, runout). E a
// rejeicao de amostras que colidem com o combo do heroi entrega a distribuicao
// condicional certa, o que mantem o estimador nao-viesado.
import { describe, it, expect } from "vitest";
import { runEngineToCompletion } from "@/lib/combo-calc/engine/run";
import { monteCarloSamples, EXACT_LIMIT } from "@/lib/combo-calc/engine/cost";
import { DEFAULT_SEED, mulberry32 } from "@/lib/combo-calc/engine/random";
import type { EngineRequest, EngineResult } from "@/lib/combo-calc/engine/types";
import { comboKey } from "@/lib/combo-calc/cards";
import {
  V2_FLOP,
  V2_HERO_COMBO_WITHOUT_OPPONENT,
  type SpotV2Like,
} from "./f1-fixtures";

/**
 * Piso declarado de amostras. Abaixo disso o intervalo de 95% fica largo demais
 * para significar alguma coisa, entao o orcamento nunca desce daqui — mesmo que
 * o custo estimado mande.
 */
const MC_MIN_SAMPLES = 1000;

function mc(spot: SpotV2Like, extra: Partial<EngineRequest> = {}): EngineRequest {
  return {
    spot: spot as EngineRequest["spot"],
    mode: "monte_carlo",
    seed: DEFAULT_SEED,
    samples: 20_000,
    ...extra,
  };
}

function okResult(result: EngineResult, label: string) {
  if (result.status !== "ok") {
    throw new Error(`${label}: esperava ok, veio degraded (${result.reason})`);
  }
  return result;
}

// ── PRNG proprio ─────────────────────────────────────────────

describe("F1 D-F1-5 — mulberry32 como PRNG semeado do projeto", () => {
  it("DEFAULT_SEED e 20240815", () => {
    expect(DEFAULT_SEED).toBe(20240815);
  });

  it("mesma semente produz a mesma sequencia", () => {
    const a = mulberry32(DEFAULT_SEED);
    const b = mulberry32(DEFAULT_SEED);
    for (let i = 0; i < 200; i++) {
      const x = a();
      const y = b();
      expect(y, `posicao ${i}: ${x} != ${y}`).toBe(x);
    }
  });

  it("sementes diferentes divergem", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 50 }, () => a());
    const seqB = Array.from({ length: 50 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("devolve valores em [0, 1) e nao uma constante", () => {
    const rng = mulberry32(DEFAULT_SEED);
    const vistos = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(Number.isFinite(v), `amostra ${i} nao e finita: ${v}`).toBe(true);
      expect(v, `amostra ${i} abaixo de 0`).toBeGreaterThanOrEqual(0);
      expect(v, `amostra ${i} chegou em 1`).toBeLessThan(1);
      vistos.add(v);
    }
    expect(vistos.size, "PRNG constante disfarcado").toBeGreaterThan(900);
  });
});

// ── reprodutibilidade ────────────────────────────────────────

describe("F1 RF-01.4 — Monte Carlo e reprodutivel", () => {
  it("mesma request e mesma semente devolvem resultado profundamente igual", () => {
    const first = runEngineToCompletion(mc(V2_FLOP));
    const second = runEngineToCompletion(mc(V2_FLOP));
    expect(second).toEqual(first);
  });

  it("semente diferente move o numero (nao e constante disfarcada)", () => {
    const a = okResult(runEngineToCompletion(mc(V2_FLOP, { seed: 11, samples: 1500 })), "seed 11");
    const b = okResult(runEngineToCompletion(mc(V2_FLOP, { seed: 22, samples: 1500 })), "seed 22");
    expect(
      a.heroRangeEquity,
      `seed 11 = ${a.heroRangeEquity} e seed 22 = ${b.heroRangeEquity}: a semente nao esta sendo usada`,
    ).not.toBe(b.heroRangeEquity);
  });

  it("a semente usada volta no resultado", () => {
    const result = okResult(runEngineToCompletion(mc(V2_FLOP, { seed: 4242 })), "seed eco");
    expect(result.seed).toBe(4242);
    expect(result.mode).toBe("monte_carlo");
    expect(result.samples).toBeGreaterThan(0);
  });
});

// ── intervalo de confianca obrigatorio (criterio de aceite 4) ─

describe("F1 RF-01.4 — numero aproximado nunca aparece sem intervalo", () => {
  it("modo monte_carlo sempre carrega confidence de 95% com meia-largura positiva", () => {
    const result = okResult(runEngineToCompletion(mc(V2_FLOP)), "intervalo");
    expect(result.confidence, "Monte Carlo sem intervalo e bug (criterio 4)").not.toBeNull();
    expect(result.confidence!.level).toBe(0.95);
    expect(result.confidence!.halfWidth).toBeGreaterThan(0);
    expect(Number.isFinite(result.confidence!.halfWidth)).toBe(true);
  });

  it("todo combo do heroi com equity tem meia-largura propria", () => {
    const result = okResult(runEngineToCompletion(mc(V2_FLOP)), "intervalo por combo");
    for (const c of result.perHeroCombo) {
      if (c.equity === null) continue;
      const label = comboKey(c.combo[0], c.combo[1]);
      expect(
        c.confidenceHalfWidth,
        `${label}: equity=${c.equity} sem meia-largura`,
      ).not.toBeNull();
      expect(c.confidenceHalfWidth as number).toBeGreaterThan(0);
      expect(c.sampleCount, `${label}: sem contagem de amostras aceitas`).not.toBeNull();
      expect(c.sampleCount as number).toBeGreaterThan(0);
    }
  });

  it("modo exato NAO carrega intervalo (nem no agregado nem por combo)", () => {
    const result = okResult(
      runEngineToCompletion({ spot: V2_FLOP as EngineRequest["spot"], mode: "exact" }),
      "exato",
    );
    expect(result.confidence).toBeNull();
    for (const c of result.perHeroCombo) {
      expect(
        c.confidenceHalfWidth,
        `${comboKey(c.combo[0], c.combo[1])}: exato nao tem meia-largura`,
      ).toBeNull();
      expect(c.sampleCount).toBeNull();
    }
  });
});

// ── convergencia ─────────────────────────────────────────────

describe("F1 D-F1-5 — Monte Carlo converge para o exato", () => {
  it("com amostra alta cai dentro de exato +- 3 meias-larguras", () => {
    const exact = okResult(
      runEngineToCompletion({ spot: V2_FLOP as EngineRequest["spot"], mode: "exact" }),
      "exato",
    );
    const approx = okResult(
      runEngineToCompletion(mc(V2_FLOP, { samples: 50_000 })),
      "monte carlo",
    );
    const halfWidth = approx.confidence!.halfWidth;
    const delta = Math.abs(approx.heroRangeEquity - exact.heroRangeEquity);
    expect(
      delta,
      `exato=${exact.heroRangeEquity} mc=${approx.heroRangeEquity} ` +
        `delta=${delta} meia-largura=${halfWidth} (tolerancia 3x = ${3 * halfWidth})`,
    ).toBeLessThan(3 * halfWidth);
  });

  it("mais amostras estreitam o intervalo", () => {
    const poucas = okResult(runEngineToCompletion(mc(V2_FLOP, { samples: 2_000 })), "2k");
    const muitas = okResult(runEngineToCompletion(mc(V2_FLOP, { samples: 50_000 })), "50k");
    expect(
      muitas.confidence!.halfWidth,
      `2k -> ${poucas.confidence!.halfWidth}, 50k -> ${muitas.confidence!.halfWidth}`,
    ).toBeLessThan(poucas.confidence!.halfWidth);
  });
});

// ── card removal continua exato dentro do Monte Carlo ────────

describe("F1 D-F1-5 — card removal exato dentro do Monte Carlo", () => {
  it("combo do heroi sem oponente continua degradado, nao amostrado", () => {
    const result = okResult(
      runEngineToCompletion(mc(V2_HERO_COMBO_WITHOUT_OPPONENT)),
      "sem oponente no MC",
    );
    const orfao = result.perHeroCombo.find(
      (c) => comboKey(c.combo[0], c.combo[1]) ===
        comboKey({ rank: 13, suit: "s" }, { rank: 12, suit: "s" }),
    );
    expect(orfao, "KsQs sumiu da lista").toBeDefined();
    expect(orfao!.degradedReason).toBe("no_valid_villain_combo");
    expect(orfao!.equity, "equity amostrada onde nao ha oponente e numero inventado").toBeNull();
    expect(orfao!.pairMass).toBe(0);
    expect(orfao!.confidenceHalfWidth).toBeNull();
  });

  it("o heroi permanece exaustivo: todo combo do range aparece na lista", () => {
    const result = okResult(runEngineToCompletion(mc(V2_HERO_COMBO_WITHOUT_OPPONENT)), "exaustivo");
    expect(result.perHeroCombo).toHaveLength(2);
  });
});

// ── orcamento de amostras ────────────────────────────────────

describe("F1 D-F1-5 — orcamento de amostras do Monte Carlo", () => {
  it("EXACT_LIMIT e 4.000.000 de showdowns (numero medido, nao chutado)", () => {
    expect(EXACT_LIMIT).toBe(4_000_000);
  });

  it("1300 combos do heroi dentro do orcamento dao cerca de 3.000 amostras", () => {
    const s = monteCarloSamples(4_000_000, 1300);
    expect(Number.isInteger(s), `amostras nao inteiras: ${s}`).toBe(true);
    expect(s, `esperado em torno de 3.000, veio ${s}`).toBeGreaterThanOrEqual(2_800);
    expect(s, `esperado em torno de 3.000, veio ${s}`).toBeLessThanOrEqual(3_300);
  });

  it("nunca desce do piso declarado, por menor que seja o orcamento", () => {
    for (const [budget, heroCombos] of [[1, 1_000_000], [10, 5_000], [0, 10]] as const) {
      const s = monteCarloSamples(budget, heroCombos);
      expect(
        s,
        `orcamento ${budget} com ${heroCombos} combos do heroi devolveu ${s}, abaixo do piso ${MC_MIN_SAMPLES}`,
      ).toBeGreaterThanOrEqual(MC_MIN_SAMPLES);
    }
  });

  it("orcamento maior compra mais amostras", () => {
    const pequeno = monteCarloSamples(4_000_000, 1300);
    const grande = monteCarloSamples(40_000_000, 1300);
    expect(grande).toBeGreaterThan(pequeno);
  });

  it("mais combos do heroi custam mais por amostra, entao cabem menos amostras", () => {
    expect(monteCarloSamples(4_000_000, 10)).toBeGreaterThan(
      monteCarloSamples(4_000_000, 1300),
    );
  });
});
