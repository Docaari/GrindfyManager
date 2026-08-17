// F1 / RF-01.4 — o motor e um stepper puro e sincrono.
// Spec: Docs/specs/range-lab/F1-motor.md (RF-01.4)
// ADR : Docs/architecture/decisions/246-range-lab-f1-motor.md (D-F1-6)
//
// Metade do valor da decisao esta AQUI: o teste dirige `step()` direto. Sem fake
// timer, sem Worker em jsdom, sem `await` de mensagem. Progresso, cancelamento e
// resultado parcial viram assercoes sincronas.
//
// O que este arquivo protege de verdade: fatiar o trabalho NAO pode mudar o
// numero. Uma barra de progresso que altera o resultado e a pior classe de bug
// possivel — o numero fica certo na maquina rapida e errado na lenta.
import { describe, it, expect } from "vitest";
import { createEngineRun, runEngineToCompletion } from "@/lib/combo-calc/engine/run";
import type { EngineRequest } from "@/lib/combo-calc/engine/types";
import { V2_FLOP, V2_RIVER, V2_TURN, type SpotV2Like } from "./f1-fixtures";

const SAFETY_CAP = 500_000;

function exact(spot: SpotV2Like): EngineRequest {
  return { spot: spot as EngineRequest["spot"], mode: "exact" };
}

/** Roda o stepper em fatias de `slice` unidades. Falha alto se nao terminar. */
function drain(run: ReturnType<typeof createEngineRun>, slice: number) {
  let calls = 0;
  let processed = 0;
  const progresses: number[] = [run.progress()];
  for (;;) {
    const step = run.step(slice);
    calls++;
    processed += step.processed;
    progresses.push(run.progress());
    expect(
      step.processed,
      `fatia ${calls}: processou ${step.processed} unidades com teto de ${slice}`,
    ).toBeLessThanOrEqual(slice);
    if (step.done) break;
    expect(
      step.processed,
      `fatia ${calls}: step nao terminou e nao processou nada — laco infinito`,
    ).toBeGreaterThan(0);
    if (calls > SAFETY_CAP) {
      throw new Error(`stepper nao terminou em ${SAFETY_CAP} fatias de ${slice} unidades`);
    }
  }
  return { calls, processed, progresses };
}

describe("F1 D-F1-6 — totalUnits e conhecido antes de comecar", () => {
  it("e um inteiro positivo (barra de progresso honesta exige isso)", () => {
    for (const [street, spot] of [
      ["river", V2_RIVER],
      ["turn", V2_TURN],
      ["flop", V2_FLOP],
    ] as const) {
      const run = createEngineRun(exact(spot));
      expect(Number.isFinite(run.totalUnits), `${street}: totalUnits nao finito`).toBe(true);
      expect(run.totalUnits, `${street}: totalUnits=${run.totalUnits}`).toBeGreaterThan(0);
    }
  });

  it("comeca com progresso 0, sem resultado e sem cancelamento", () => {
    const run = createEngineRun(exact(V2_FLOP));
    expect(run.progress()).toBe(0);
    expect(run.result(), "resultado parcial nunca se passa por final").toBeNull();
    expect(run.cancelled).toBe(false);
  });
});

describe("F1 D-F1-6 — fatiar leva ao fim e respeita o teto da fatia", () => {
  it("somando as fatias o stepper chega em done", () => {
    const run = createEngineRun(exact(V2_FLOP));
    const { processed } = drain(run, 37);
    expect(run.progress()).toBe(1);
    expect(run.result(), "done sem resultado").not.toBeNull();
    expect(
      processed,
      `processou ${processed} unidades de um total de ${run.totalUnits}`,
    ).toBeLessThanOrEqual(run.totalUnits);
  });

  it("uma fatia infinita termina em uma chamada so", () => {
    const run = createEngineRun(exact(V2_FLOP));
    const step = run.step(Infinity);
    expect(step.done).toBe(true);
    expect(run.progress()).toBe(1);
    expect(run.result()).not.toBeNull();
  });

  it("chamar step depois de done continua devolvendo done sem trabalhar", () => {
    const run = createEngineRun(exact(V2_RIVER));
    run.step(Infinity);
    const extra = run.step(Infinity);
    expect(extra.done).toBe(true);
    expect(extra.processed).toBe(0);
    expect(run.result()).not.toBeNull();
  });
});

describe("F1 D-F1-6 — progresso e monotono e termina em 1", () => {
  it("nunca decresce e fica em 0..1 ao longo de todas as fatias", () => {
    const run = createEngineRun(exact(V2_FLOP));
    const { progresses } = drain(run, 53);
    for (let i = 1; i < progresses.length; i++) {
      expect(
        progresses[i],
        `fatia ${i}: progresso caiu de ${progresses[i - 1]} para ${progresses[i]}`,
      ).toBeGreaterThanOrEqual(progresses[i - 1]);
      expect(progresses[i], `fatia ${i}: progresso fora de 0..1`).toBeGreaterThanOrEqual(0);
      expect(progresses[i], `fatia ${i}: progresso fora de 0..1`).toBeLessThanOrEqual(1);
    }
    expect(progresses[progresses.length - 1]).toBe(1);
  });

  it("progresso avanca de verdade no meio da corrida (nao pula de 0 para 1)", () => {
    const run = createEngineRun(exact(V2_FLOP));
    run.step(Math.max(1, Math.floor(run.totalUnits / 4)));
    const p = run.progress();
    expect(p, `progresso no primeiro quarto: ${p}`).toBeGreaterThan(0);
    expect(p, `progresso no primeiro quarto: ${p}`).toBeLessThan(1);
  });
});

describe("F1 D-F1-6 — fatiar NAO muda o numero", () => {
  it("uma fatia infinita e muitas fatias de 37 dao o mesmo resultado", () => {
    const inteiro = createEngineRun(exact(V2_FLOP));
    inteiro.step(Infinity);
    const deUmaVez = inteiro.result();

    const picado = createEngineRun(exact(V2_FLOP));
    drain(picado, 37);
    const emFatias = picado.result();

    expect(emFatias).toEqual(deUmaVez);
  });

  it("fatias de tamanhos diferentes convergem para o mesmo resultado", () => {
    const referencia = runEngineToCompletion(exact(V2_TURN));
    for (const slice of [1, 7, 101, 5_000]) {
      const run = createEngineRun(exact(V2_TURN));
      drain(run, slice);
      expect(run.result(), `fatia de ${slice} unidades divergiu`).toEqual(referencia);
    }
  });

  it("runEngineToCompletion e o mesmo que step(Infinity)", () => {
    const run = createEngineRun(exact(V2_FLOP));
    run.step(Infinity);
    expect(runEngineToCompletion(exact(V2_FLOP))).toEqual(run.result());
  });
});

describe("F1 D-F1-6 — cancelamento no limite da fatia", () => {
  it("cancel() no meio interrompe e NAO entrega resultado", () => {
    const run = createEngineRun(exact(V2_FLOP));
    run.step(Math.max(1, Math.floor(run.totalUnits / 10)));
    expect(run.progress(), "a corrida precisa ter comecado para o teste valer").toBeGreaterThan(0);
    expect(run.progress()).toBeLessThan(1);

    run.cancel();
    expect(run.cancelled).toBe(true);

    const step = run.step(Infinity);
    expect(step.done, "a proxima fatia depois do cancel tem que encerrar").toBe(true);
    expect(
      run.result(),
      "resultado parcial se passando por final — e o defeito que o cancelamento existe para evitar",
    ).toBeNull();
  });

  it("cancel() antes da primeira fatia tambem encerra sem resultado", () => {
    const run = createEngineRun(exact(V2_FLOP));
    run.cancel();
    expect(run.cancelled).toBe(true);
    const step = run.step(Infinity);
    expect(step.done).toBe(true);
    expect(step.processed).toBe(0);
    expect(run.result()).toBeNull();
  });

  it("cancel() depois de done nao apaga o resultado ja pronto", () => {
    const run = createEngineRun(exact(V2_RIVER));
    run.step(Infinity);
    const antes = run.result();
    expect(antes).not.toBeNull();
    run.cancel();
    expect(run.result()).toEqual(antes);
  });

  it("cancel() e idempotente", () => {
    const run = createEngineRun(exact(V2_FLOP));
    run.cancel();
    run.cancel();
    expect(run.cancelled).toBe(true);
    expect(run.result()).toBeNull();
  });
});
