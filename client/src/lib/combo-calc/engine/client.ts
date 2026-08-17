// Cliente do motor: fala com o Worker, ou roda sozinho quando nao ha Worker
// (ADR-246 D-F1-7).
//
// O DESCARTE POR runId MORA AQUI, uma vez. Se cada painel tivesse que se lembrar
// de comparar, um deles esqueceria — e o sintoma seria o resultado de um bordo
// antigo pintando a tela sobre o bordo novo.
import { createEngineRun } from "./run";
import { SLICE_MS, SLICE_UNITS, type EngineOutboundMessage } from "./protocol";
import type { EngineRequest, EngineResult } from "./types";

export interface EngineHandlers {
  onProgress?: (percent: number) => void;
  onResult?: (result: EngineResult) => void;
  onError?: (error: string) => void;
}

/** O minimo de Worker que o cliente usa — o duble de teste implementa isto. */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener?(type: string, listener: (ev: { data: unknown }) => void): void;
  removeEventListener?(type: string, listener: (ev: { data: unknown }) => void): void;
  onmessage?: ((ev: { data: unknown }) => void) | null;
}

export interface RangeEngineClientOptions {
  /** Injetavel para teste (licao #34). Ausente = o Worker de producao. */
  createWorker?: () => WorkerLike;
}

export interface RangeEngineClient {
  /** Dispara a corrida e devolve o `runId` dela. Cancela a corrida anterior. */
  run(request: EngineRequest, handlers?: EngineHandlers): number;
  cancel(): void;
  dispose(): void;
}

function defaultCreateWorker(): WorkerLike {
  // A URL precisa ser literal: e assim que o Vite acha e empacota o worker.
  return new Worker(new URL("../rangeEngine.worker.ts", import.meta.url), {
    type: "module",
  }) as unknown as WorkerLike;
}

export function createRangeEngineClient(
  options: RangeEngineClientOptions = {},
): RangeEngineClient {
  const makeWorker = options.createWorker ?? defaultCreateWorker;

  let worker: WorkerLike | null = null;
  let workerFailed = false;
  let disposed = false;
  let nextRunId = 1;
  let currentRunId = 0;
  let currentHandlers: EngineHandlers = {};
  /** Timer do runner sincrono, para o cancelamento tambem valer nesse ramo. */
  let syncTimer: ReturnType<typeof setTimeout> | null = null;

  function handleMessage(ev: { data: unknown }): void {
    const msg = ev.data as EngineOutboundMessage | undefined;
    if (!msg || typeof msg !== "object") return;
    // O portao: mensagem que nao e da corrida corrente morre aqui.
    if (msg.runId !== currentRunId) return;
    if (msg.type === "progress") currentHandlers.onProgress?.(msg.percent);
    else if (msg.type === "done") currentHandlers.onResult?.(msg.result);
    else if (msg.type === "error") currentHandlers.onError?.(msg.error);
  }

  function ensureWorker(): WorkerLike | null {
    if (worker || workerFailed) return worker;
    try {
      const created = makeWorker();
      if (created.addEventListener) created.addEventListener("message", handleMessage);
      else created.onmessage = handleMessage;
      worker = created;
      return worker;
    } catch (error) {
      // Licao #9: logar ANTES de degradar. Cair no runner sincrono em silencio
      // traz de volta a tela travada sem ninguem saber por que.
      console.warn(
        "[range-lab] Web Worker indisponivel — o motor vai rodar na thread principal, " +
          "e calculos grandes podem travar a tela.",
        error,
      );
      workerFailed = true;
      return null;
    }
  }

  /**
   * Runner sincrono, fatiado com `setTimeout(0)` entre as fatias. Nao substitui o
   * worker — a main thread continua sendo bloqueada dentro de cada fatia — mas
   * pelo menos devolve o controle ao navegador entre elas.
   */
  function runSynchronously(runId: number, request: EngineRequest): void {
    let run: ReturnType<typeof createEngineRun>;
    try {
      run = createEngineRun(request);
    } catch (error) {
      if (runId === currentRunId) {
        currentHandlers.onError?.(error instanceof Error ? error.message : String(error));
      }
      return;
    }

    const drive = (): void => {
      syncTimer = null;
      if (runId !== currentRunId || disposed) return;
      const started = Date.now();
      let step = run.step(SLICE_UNITS);
      // Fatia = 200 ms OU 200 mil unidades, o que vier primeiro.
      while (!step.done && Date.now() - started < SLICE_MS) {
        step = run.step(SLICE_UNITS);
      }
      if (step.done) {
        const result = run.result();
        if (result) currentHandlers.onResult?.(result);
        return;
      }
      currentHandlers.onProgress?.(Math.round(run.progress() * 100));
      syncTimer = setTimeout(drive, 0);
    };

    syncTimer = setTimeout(drive, 0);
  }

  function stopSync(): void {
    if (syncTimer !== null) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
  }

  function cancelCurrent(): void {
    stopSync();
    if (currentRunId > 0 && worker) {
      worker.postMessage({ type: "cancel", runId: currentRunId });
    }
  }

  return {
    run(request: EngineRequest, handlers: EngineHandlers = {}): number {
      // Trocar de corrida sem cancelar deixaria o worker moendo trabalho morto.
      if (currentRunId > 0) cancelCurrent();
      const runId = nextRunId++;
      currentRunId = runId;
      currentHandlers = handlers;

      const w = ensureWorker();
      if (w) w.postMessage({ type: "run", runId, request });
      else runSynchronously(runId, request);
      return runId;
    },
    cancel(): void {
      cancelCurrent();
    },
    dispose(): void {
      disposed = true;
      cancelCurrent();
      currentHandlers = {};
      if (worker) {
        if (worker.removeEventListener) worker.removeEventListener("message", handleMessage);
        worker.terminate();
        worker = null;
      }
    },
  };
}
