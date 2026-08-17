// F1 — criterio de aceite 2: o flop de 236 combos abaixo de 20 ms.
// Spec: Docs/specs/range-lab/F1-motor.md (criterio de aceite 2)
// ADR : Docs/architecture/decisions/246-range-lab-f1-motor.md (D-F1-1 a D-F1-3)
//
// Medido antes de escrever este teste, num prototipo do avaliador e do laco:
// flop `Ad 8h 4h`, mao unica `As 6s`, 236 combos do vilao -> 7,0 ms e exatamente
// 233.640 showdowns. O alvo de 20 ms deixa quase 3x de folga.
//
// MEDIANA de 5 corridas, nao media nem melhor caso: media flaka em maquina
// carregada e melhor caso mente. Uma corrida de aquecimento antes, para o JIT.
//
// O `totalShowdowns` esta asserido junto de proposito — sem isso, "acelerar"
// calculando MENOS passaria por otimizacao.
import { describe, it, expect } from "vitest";
import { runEngineToCompletion } from "@/lib/combo-calc/engine/run";
import { estimateCost } from "@/lib/combo-calc/engine/cost";
import type { EngineRequest, EngineResult } from "@/lib/combo-calc/engine/types";
import {
  PERF_RUNOUTS_PER_PAIR,
  PERF_TOTAL_SHOWDOWNS,
  PERF_VALID_PAIRS,
  V2_PERF_FLOP,
} from "./f1-fixtures";

const TARGET_MS = 20;
const RUNS = 5;

const REQUEST: EngineRequest = {
  spot: V2_PERF_FLOP as EngineRequest["spot"],
  mode: "exact",
};

function okResult(result: EngineResult): Extract<EngineResult, { status: "ok" }> {
  if (result.status !== "ok") {
    throw new Error(`caso de performance degradou (${result.reason})`);
  }
  return result;
}

describe("F1 criterio 2 — flop de 236 combos abaixo de 20 ms", () => {
  it("faz o trabalho inteiro: 236 pares validos x 990 runouts = 233.640 showdowns", () => {
    const cost = estimateCost(REQUEST);
    expect(cost.validPairs).toBe(PERF_VALID_PAIRS);
    expect(cost.runoutsPerPair).toBe(PERF_RUNOUTS_PER_PAIR);

    const result = okResult(runEngineToCompletion(REQUEST));
    expect(
      result.totalShowdowns,
      `o motor contou ${result.totalShowdowns} showdowns; o caso exige ${PERF_TOTAL_SHOWDOWNS}` +
        " — calcular menos nao e otimizar",
    ).toBe(PERF_TOTAL_SHOWDOWNS);
    expect(result.totalShowdowns).toBe(233_640);
  });

  it("a mediana de 5 corridas fica abaixo de 20 ms", () => {
    // Aquecimento: a primeira corrida paga a compilacao JIT e a montagem das
    // tabelas do modulo. Medir ela seria medir outra coisa.
    okResult(runEngineToCompletion(REQUEST));

    const amostras: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      const result = runEngineToCompletion(REQUEST);
      amostras.push(performance.now() - t0);
      okResult(result);
    }

    const ordenadas = [...amostras].sort((a, b) => a - b);
    const mediana = ordenadas[Math.floor(RUNS / 2)];
    expect(
      mediana,
      `mediana ${mediana.toFixed(2)} ms (corridas: ${amostras
        .map((x) => x.toFixed(2))
        .join(", ")} ms). Medido no prototipo: 7,0 ms.`,
    ).toBeLessThan(TARGET_MS);
  }, 120_000);

  it("o numero nao muda entre corridas repetidas (motor puro)", () => {
    const a = okResult(runEngineToCompletion(REQUEST));
    const b = okResult(runEngineToCompletion(REQUEST));
    expect(b).toEqual(a);
  });
});
