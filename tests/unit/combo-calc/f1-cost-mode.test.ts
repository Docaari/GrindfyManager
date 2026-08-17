// F1 / RF-01.4 — estimativa de custo e escolha de modo.
// Spec: Docs/specs/range-lab/F1-motor.md (RF-01.4)
// ADR : Docs/architecture/decisions/246-range-lab-f1-motor.md (D-F1-3, D-F1-5)
//
// Duas armadilhas registradas no ADR e cobertas aqui:
//  1. "showdown" mudou de significado — no motor novo e uma COMPARACAO de dois
//     inteiros ja calculados, nao duas avaliacoes. `EXACT_LIMIT` conta showdowns
//     nesse sentido novo; contar avaliacoes subestimaria o trabalho por ordens de
//     grandeza no caso range vs range.
//  2. A ferramenta ESTIMA, MOSTRA e SUGERE. Nunca troca de modo sozinha.
import { describe, it, expect } from "vitest";
import {
  EXACT_LIMIT,
  estimateCost,
  runoutsPerPair,
  suggestMode,
} from "@/lib/combo-calc/engine/cost";
import { runEngineToCompletion } from "@/lib/combo-calc/engine/run";
import type { EngineRequest, EngineResult } from "@/lib/combo-calc/engine/types";
import {
  ABOVE_BUDGET_SHOWDOWNS,
  PERF_RUNOUTS_PER_PAIR,
  PERF_TOTAL_SHOWDOWNS,
  PERF_VALID_PAIRS,
  V2_ABOVE_BUDGET_FLOP,
  V2_FLOP,
  V2_PERF_FLOP,
  V2_RIVER,
  V2_TURN,
  type SpotV2Like,
} from "./f1-fixtures";

function exact(spot: SpotV2Like): EngineRequest {
  return { spot: spot as EngineRequest["spot"], mode: "exact" };
}

function okResult(result: EngineResult, label: string) {
  if (result.status !== "ok") {
    throw new Error(`${label}: esperava ok, veio degraded (${result.reason})`);
  }
  return result;
}

// ── estimateCost ─────────────────────────────────────────────

describe("F1 D-F1-5 — estimateCost mede o trabalho real", () => {
  it("o caso de aceite da spec da 233.640 showdowns (236 pares x 990 runouts)", () => {
    const cost = estimateCost(exact(V2_PERF_FLOP));
    expect(cost.runoutsPerPair, "flop tem 990 runouts por par").toBe(
      PERF_RUNOUTS_PER_PAIR,
    );
    expect(
      cost.validPairs,
      `pares validos: esperado ${PERF_VALID_PAIRS}, veio ${cost.validPairs}`,
    ).toBe(PERF_VALID_PAIRS);
    expect(cost.showdowns).toBe(PERF_TOTAL_SHOWDOWNS);
    expect(cost.showdowns).toBe(233_640);
  });

  it("o heroi do caso de aceite e UMA mao", () => {
    const cost = estimateCost(exact(V2_PERF_FLOP));
    expect(cost.heroCombos).toBe(1);
  });

  it("combos do vilao expandidos nunca sao MENOS que os pares validos", () => {
    // O vilao expande contra o bordo; o card removal contra o heroi acontece
    // depois, par a par. Logo `villainCombos >= validPairs` quando o heroi tem
    // uma mao so — e a diferenca e exatamente o que o bloqueio matou.
    const cost = estimateCost(exact(V2_PERF_FLOP));
    expect(
      cost.villainCombos,
      `villainCombos=${cost.villainCombos} validPairs=${cost.validPairs}`,
    ).toBeGreaterThanOrEqual(cost.validPairs);
  });

  it("showdowns e sempre pares validos x runouts por par, nos tres streets", () => {
    for (const [street, spot] of [
      ["river", V2_RIVER],
      ["turn", V2_TURN],
      ["flop", V2_FLOP],
    ] as const) {
      const cost = estimateCost(exact(spot));
      expect(
        cost.showdowns,
        `${street}: ${cost.validPairs} x ${cost.runoutsPerPair} != ${cost.showdowns}`,
      ).toBe(cost.validPairs * cost.runoutsPerPair);
      expect(cost.runoutsPerPair).toBe(runoutsPerPair(spot.board.length));
    }
  });

  it("a estimativa bate com o totalShowdowns que a corrida reporta", () => {
    const cost = estimateCost(exact(V2_FLOP));
    const result = okResult(runEngineToCompletion(exact(V2_FLOP)), "flop");
    expect(
      result.totalShowdowns,
      `estimado=${cost.showdowns} realizado=${result.totalShowdowns}`,
    ).toBe(cost.showdowns);
  });
});

// ── fronteira exato / Monte Carlo ────────────────────────────

describe("F1 D-F1-5 — fronteira do orcamento exato", () => {
  it("EXACT_LIMIT e 4.000.000 (medido no Mind River, emenda A2)", () => {
    expect(EXACT_LIMIT).toBe(4_000_000);
  });

  it("exatamente no limite ainda sugere exato", () => {
    expect(suggestMode(EXACT_LIMIT)).toBe("exact");
    expect(suggestMode(4_000_000)).toBe("exact");
  });

  it("um showdown acima do limite sugere Monte Carlo", () => {
    expect(suggestMode(EXACT_LIMIT + 1)).toBe("monte_carlo");
    expect(suggestMode(4_000_001)).toBe("monte_carlo");
  });

  it("o caso de aceite passa longe do teto e continua exato", () => {
    const cost = estimateCost(exact(V2_PERF_FLOP));
    expect(cost.showdowns).toBeLessThan(EXACT_LIMIT);
    expect(suggestMode(cost.showdowns)).toBe("exact");
  });

  it("range vs range no flop estoura o teto e vira sugestao de Monte Carlo", () => {
    const cost = estimateCost(exact(V2_ABOVE_BUDGET_FLOP));
    expect(
      cost.showdowns,
      `fixture deveria passar de ${EXACT_LIMIT}; veio ${cost.showdowns}`,
    ).toBeGreaterThan(EXACT_LIMIT);
    expect(cost.showdowns).toBe(ABOVE_BUDGET_SHOWDOWNS);
    expect(suggestMode(cost.showdowns)).toBe("monte_carlo");
  });
});

// ── o motor nunca troca de modo sozinho ──────────────────────

describe("F1 RF-01.4 — a ferramenta sugere, o motor obedece", () => {
  it("modo exato acima do orcamento roda exato mesmo assim", () => {
    const request = exact(V2_ABOVE_BUDGET_FLOP);
    const cost = estimateCost(request);
    expect(cost.showdowns).toBeGreaterThan(EXACT_LIMIT);
    expect(suggestMode(cost.showdowns)).toBe("monte_carlo");

    const result = okResult(runEngineToCompletion(request), "exato acima do teto");
    expect(
      result.mode,
      "o motor trocou de modo sozinho — o jogador que pede exato tem direito de esperar",
    ).toBe("exact");
    expect(result.confidence, "exato nao inventa intervalo").toBeNull();
    expect(result.seed).toBeNull();
    expect(result.totalShowdowns).toBe(cost.showdowns);
  }, 120_000);

  it("modo monte_carlo abaixo do orcamento roda Monte Carlo mesmo assim", () => {
    const cost = estimateCost(exact(V2_FLOP));
    expect(cost.showdowns).toBeLessThan(EXACT_LIMIT);
    expect(suggestMode(cost.showdowns)).toBe("exact");

    const result = okResult(
      runEngineToCompletion({
        spot: V2_FLOP as EngineRequest["spot"],
        mode: "monte_carlo",
        samples: 2_000,
      }),
      "monte carlo abaixo do teto",
    );
    expect(result.mode).toBe("monte_carlo");
    expect(result.confidence).not.toBeNull();
  });
});
