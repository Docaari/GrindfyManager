// F1 — criterio de aceite 3: mao unica produz EXATAMENTE o mesmo veredito de hoje.
// Spec: Docs/specs/range-lab/F1-motor.md
// ADR : Docs/architecture/decisions/246-range-lab-f1-motor.md (D-F1-8, D-F1-9)
//
// `evaluateSpot` NAO e reescrita: ela e o oraculo de regressao. Uma mao unica no
// modelo v2 e UMA entry `specific` de frequencia 1 — sem caminho de codigo
// separado (RF-01.2). Se este arquivo ficar verde, o caminho novo cobre o caso
// simples com a mesma matematica do caminho antigo.
import { describe, it, expect } from "vitest";
import { runEngineToCompletion } from "@/lib/combo-calc/engine/run";
import type { EngineRequest, EngineResult } from "@/lib/combo-calc/engine/types";
import { evaluateSpot } from "@/lib/combo-calc/evaluateSpot";
import type { Spot } from "@/lib/combo-calc/types";
import {
  FLOP_HERO_EQUITY,
  LEGACY_FLOP,
  LEGACY_FLOP_FOLD,
  LEGACY_RIVER,
  LEGACY_TURN,
  V2_FLOP,
  V2_FLOP_FOLD,
  V2_RIVER,
  V2_TURN,
  type SpotV2Like,
} from "./f1-fixtures";

const TOL = 1e-9;

function exact(spot: SpotV2Like): EngineRequest {
  return { spot: spot as EngineRequest["spot"], mode: "exact" };
}

/** Estreita a uniao discriminada e falha com mensagem util quando degradou. */
function okResult(result: EngineResult, label: string) {
  if (result.status !== "ok") {
    throw new Error(
      `${label}: motor devolveu status "degraded" (reason=${result.reason}) onde o veredito legado existe`,
    );
  }
  return result;
}

const CASES: Array<{ street: string; v2: SpotV2Like; legacy: Spot; runouts: number }> = [
  { street: "river", v2: V2_RIVER, legacy: LEGACY_RIVER, runouts: 1 },
  { street: "turn", v2: V2_TURN, legacy: LEGACY_TURN, runouts: 44 },
  { street: "flop", v2: V2_FLOP, legacy: LEGACY_FLOP, runouts: 990 },
];

describe("F1 — motor novo x evaluateSpot (mao unica, os tres streets)", () => {
  for (const { street, v2, legacy, runouts } of CASES) {
    describe(`${street}`, () => {
      it("devolve status ok (mao unica nunca degrada)", () => {
        const result = runEngineToCompletion(exact(v2));
        expect(result.status, `${street}: status do motor`).toBe("ok");
      });

      it("heroRangeEquity bate com evaluateSpot(...).heroEquity", () => {
        const result = okResult(runEngineToCompletion(exact(v2)), street);
        const verdict = evaluateSpot(legacy);
        expect(
          Math.abs(result.heroRangeEquity - verdict.heroEquity),
          `${street}: motor=${result.heroRangeEquity} oraculo=${verdict.heroEquity}`,
        ).toBeLessThan(TOL);
      });

      it("requiredEquity, evCall e decision sao identicos ao veredito legado", () => {
        const result = okResult(runEngineToCompletion(exact(v2)), street);
        const verdict = evaluateSpot(legacy);
        expect(
          Math.abs(result.requiredEquity - verdict.requiredEquity),
          `${street}: alpha motor=${result.requiredEquity} oraculo=${verdict.requiredEquity}`,
        ).toBeLessThan(TOL);
        expect(
          Math.abs(result.evCall - verdict.evCall),
          `${street}: evCall motor=${result.evCall} oraculo=${verdict.evCall}`,
        ).toBeLessThan(TOL);
        expect(result.decision, `${street}: decisao`).toBe(verdict.decision);
      });

      it("perHeroCombo tem UM combo e a equity dele e a do agregado", () => {
        const result = okResult(runEngineToCompletion(exact(v2)), street);
        expect(result.perHeroCombo).toHaveLength(1);
        const only = result.perHeroCombo[0];
        expect(only.degradedReason, `${street}: combo unico nao pode degradar`).toBeNull();
        expect(only.equity).not.toBeNull();
        expect(
          Math.abs((only.equity as number) - result.heroRangeEquity),
          `${street}: combo=${only.equity} agregado=${result.heroRangeEquity}`,
        ).toBeLessThan(TOL);
      });

      it("runoutsPerPair e totalShowdowns descrevem a enumeracao real", () => {
        const result = okResult(runEngineToCompletion(exact(v2)), street);
        const verdict = evaluateSpot(legacy);
        expect(result.runoutsPerPair, `${street}: runouts por par`).toBe(runouts);
        expect(
          result.totalShowdowns,
          `${street}: showdowns = pares validos x runouts`,
        ).toBe(verdict.perCombo.length * runouts);
      });

      it("modo exato nao carrega intervalo de confianca nem semente", () => {
        const result = okResult(runEngineToCompletion(exact(v2)), street);
        expect(result.mode).toBe("exact");
        expect(result.confidence, `${street}: exato nao tem intervalo`).toBeNull();
        expect(result.seed).toBeNull();
        expect(result.samples).toBeNull();
      });
    });
  }

  it("o flop reproduz o numero medido: 72,584940312%", () => {
    const result = okResult(runEngineToCompletion(exact(V2_FLOP)), "flop medido");
    expect(
      Math.abs(result.heroRangeEquity - FLOP_HERO_EQUITY),
      `motor=${result.heroRangeEquity} medido=${FLOP_HERO_EQUITY}`,
    ).toBeLessThan(TOL);
  });

  it("o flop conta 11 combos validos do vilao (2 de A7s, 3 de 76s, 6 de KK)", () => {
    const result = okResult(runEngineToCompletion(exact(V2_FLOP)), "flop");
    expect(result.totalShowdowns).toBe(11 * 990);
  });
});

describe("F1 — callThresholdIndex responde 'quantas das minhas maos pagam'", () => {
  it("vale 1 quando a decisao da mao unica e call", () => {
    const result = okResult(runEngineToCompletion(exact(V2_FLOP)), "flop call");
    expect(result.decision, "fixture do flop deveria decidir call").toBe("call");
    expect(result.callThresholdIndex).toBe(1);
  });

  it("vale 0 quando a decisao da mao unica e fold", () => {
    const verdict = evaluateSpot(LEGACY_FLOP_FOLD);
    expect(verdict.decision, "fixture de fold deveria decidir fold").toBe("fold");
    const result = okResult(runEngineToCompletion(exact(V2_FLOP_FOLD)), "flop fold");
    expect(result.decision).toBe("fold");
    expect(result.callThresholdIndex).toBe(0);
    expect(result.perHeroCombo[0].evCall).not.toBeNull();
    expect(result.perHeroCombo[0].evCall as number).toBeLessThan(0);
  });

  it("nunca passa da quantidade de combos do heroi nao degradados", () => {
    const result = okResult(runEngineToCompletion(exact(V2_FLOP)), "flop");
    const vivos = result.perHeroCombo.filter((c) => c.degradedReason === null);
    expect(result.callThresholdIndex).toBeLessThanOrEqual(vivos.length);
    expect(result.callThresholdIndex).toBeGreaterThanOrEqual(0);
  });
});

describe("F1 — classes que zeraram sao reportadas, nao somem", () => {
  it("range do vilao com classe morta por card removal aparece em emptyVillainEntries", () => {
    // `AdAs` e impossivel: Ad esta no bordo.
    const spot: SpotV2Like = {
      ...V2_FLOP,
      villainRange: [...V2_FLOP.villainRange, { notation: "AdAs", kind: "specific", frequency: 1 }],
    };
    const result = okResult(runEngineToCompletion(exact(spot)), "classe morta");
    expect(result.emptyVillainEntries).toContain("AdAs");
    expect(result.emptyHeroEntries).toEqual([]);
  });

  it("classe morta do vilao nao muda o numero do agregado", () => {
    const base = okResult(runEngineToCompletion(exact(V2_FLOP)), "base");
    const spot: SpotV2Like = {
      ...V2_FLOP,
      villainRange: [...V2_FLOP.villainRange, { notation: "AdAs", kind: "specific", frequency: 1 }],
    };
    const withDead = okResult(runEngineToCompletion(exact(spot)), "com classe morta");
    expect(
      Math.abs(withDead.heroRangeEquity - base.heroRangeEquity),
      `com classe morta=${withDead.heroRangeEquity} sem=${base.heroRangeEquity}`,
    ).toBeLessThan(TOL);
  });
});
