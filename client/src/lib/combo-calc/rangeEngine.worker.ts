/// <reference lib="webworker" />
// Worker do motor de equity (ADR-246 D-F1-6 e D-F1-7).
//
// CASCA FINA, de proposito. Toda a matematica vive em `engine/run.ts`, que e um
// stepper sincrono e puro — testavel sem Worker, sem jsdom e sem fake timer.
// Aqui so ha o que exige o ambiente do worker: dirigir o stepper e CEDER a
// thread entre as fatias.
//
// Ceder e o ponto inteiro. Um laco sincrono dentro de um worker nunca recebe
// `postMessage`: a fila de mensagens so drena entre tarefas. Sem o `setTimeout`
// abaixo, a mensagem de cancelamento so chegaria depois do calculo terminar — ou
// seja, nunca chegaria a tempo de servir para alguma coisa.
import { createEngineRun, type EngineRun } from "./engine/run";
import {
  SLICE_MS,
  SLICE_UNITS,
  type EngineInboundMessage,
  type EngineOutboundMessage,
} from "./engine/protocol";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let activeRunId = 0;
let activeRun: EngineRun | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function post(message: EngineOutboundMessage): void {
  ctx.postMessage(message);
}

function stop(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  activeRun?.cancel();
  activeRun = null;
}

function drive(runId: number): void {
  timer = null;
  const run = activeRun;
  // Corrida trocada no meio: o trabalho velho morre aqui, sem postar nada.
  if (!run || runId !== activeRunId) return;

  try {
    const started = Date.now();
    let step = run.step(SLICE_UNITS);
    // Fatia = 200 ms OU 200 mil unidades, o que vier primeiro (emenda A2). O
    // cancelamento e checado neste mesmo ponto, entre fatias.
    while (!step.done && Date.now() - started < SLICE_MS) {
      step = run.step(SLICE_UNITS);
    }

    if (step.done) {
      const result = run.result();
      // `result()` nulo significa cancelada — resultado parcial nunca se passa
      // por final, entao nao ha o que postar.
      if (result) post({ type: "done", runId, result });
      activeRun = null;
      return;
    }

    post({ type: "progress", runId, percent: Math.round(run.progress() * 100) });
    timer = setTimeout(() => drive(runId), 0);
  } catch (error) {
    activeRun = null;
    post({
      type: "error",
      runId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

ctx.addEventListener("message", (event: MessageEvent) => {
  const msg = event.data as EngineInboundMessage | undefined;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "cancel") {
    if (msg.runId === activeRunId) stop();
    return;
  }

  if (msg.type === "run") {
    stop();
    activeRunId = msg.runId;
    try {
      activeRun = createEngineRun(msg.request);
    } catch (error) {
      activeRun = null;
      post({
        type: "error",
        runId: msg.runId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    post({ type: "progress", runId: msg.runId, percent: 0 });
    timer = setTimeout(() => drive(msg.runId), 0);
  }
});
