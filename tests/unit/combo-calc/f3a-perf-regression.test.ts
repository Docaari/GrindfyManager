// F3a — regressao de tempo do laco exato depois do acumulo do lado do vilao.
// Spec  : Docs/specs/range-lab/F3a-leitura-categorias.md ("Risco de execucao a
//         medir, nao presumir")
// ADR   : Docs/architecture/decisions/248-...-f3a-leitura-categorias.md
//         (Consequencias / "Obrigacoes de teste que nascem deste ADR")
//
// POR QUE ESTE ARQUIVO EXISTE SEPARADO DO f1-perf.test.ts
//
// A D-F3-11 poe UMA ESCRITA A MAIS em `Float64Array` por par por runout, no laco
// mais quente do produto. A F1 mediu esse laco descendo de 555 ms para 7,0 ms, e
// depois de 33 ms para o alvo de 20 ms so trocando acesso a objeto por array
// plano — e um laco SENSIVEL, que ja reagiu a mudancas que pareciam inofensivas.
// O ADR e explicito: "o acumulo do lado do vilao nao pode devolver o laco ao
// patamar de 33 ms", e a medida e obrigacao da frente, nao presuncao.
//
// Se o orcamento estourar, a saida declarada pela spec e acumular o lado do vilao
// SO no modo exato e declarar a ausencia no Monte Carlo. Afrouxar o alvo aqui
// nao e uma das saidas.
import { describe, it, expect } from "vitest";
import { runEngineToCompletion } from "@/lib/combo-calc/engine/run";
import type { EngineRequest, EngineResult } from "@/lib/combo-calc/engine/types";
import { PERF_TOTAL_SHOWDOWNS, V2_PERF_FLOP } from "./f1-fixtures";

const TARGET_MS = 20;
const RUNS = 5;

const REQUEST: EngineRequest = {
  spot: V2_PERF_FLOP as EngineRequest["spot"],
  mode: "exact",
};

function ok(result: EngineResult): Extract<EngineResult, { status: "ok" }> {
  if (result.status !== "ok") throw new Error(`caso de performance degradou (${result.reason})`);
  return result;
}

describe("F3a — o acumulo do vilao nao devolve o laco exato ao patamar de 33 ms", () => {
  it("o trabalho continua o mesmo: 233.640 showdowns", () => {
    const result = ok(runEngineToCompletion(REQUEST));
    expect(
      result.totalShowdowns,
      `contou ${result.totalShowdowns}; o caso exige ${PERF_TOTAL_SHOWDOWNS} — ` +
        "calcular menos nao e otimizar",
    ).toBe(PERF_TOTAL_SHOWDOWNS);
  });

  it("o lado do vilao foi de fato acumulado neste mesmo caso", () => {
    // Sem esta asserção, "ficar rapido" por nao acumular nada passaria no teste
    // de tempo abaixo — que e exatamente o modo de falha que ele deveria pegar.
    const result = ok(runEngineToCompletion(REQUEST));
    expect(result.perVillainCombo.length, "perVillainCombo vazio no caso de aceite").toBeGreaterThan(
      200,
    );
    expect(
      result.perVillainCombo.filter((c) => c.equity !== null).length,
      "nenhum combo do vilao saiu com numero: o acumulo nao rodou",
    ).toBeGreaterThan(200);
    expect(Math.abs(result.heroRangeEquity + result.villainRangeEquity - 1)).toBeLessThan(1e-9);
  });

  it("a mediana de 5 corridas fica abaixo de 20 ms", () => {
    // Aquecimento: a primeira corrida paga o JIT e a montagem das tabelas de
    // modulo. Medir ela seria medir outra coisa. Mediana, nao media nem melhor
    // caso: media flaka em maquina carregada e melhor caso mente.
    ok(runEngineToCompletion(REQUEST));

    const amostras: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      const result = runEngineToCompletion(REQUEST);
      amostras.push(performance.now() - t0);
      ok(result);
    }

    const ordenadas = [...amostras].sort((a, b) => a - b);
    const mediana = ordenadas[Math.floor(RUNS / 2)];
    expect(
      mediana,
      `mediana ${mediana.toFixed(2)} ms (corridas: ${amostras
        .map((x) => x.toFixed(2))
        .join(", ")} ms). A F1 media 7,0 ms neste mesmo caso ANTES do acumulo do vilao.`,
    ).toBeLessThan(TARGET_MS);
  }, 120_000);

  it("a corrida continua pura: duas execucoes devolvem o mesmo objeto", () => {
    expect(ok(runEngineToCompletion(REQUEST))).toEqual(ok(runEngineToCompletion(REQUEST)));
  });
});
