// F1 / RF-01.4 — contrato do Worker e do cliente do motor.
// Spec: Docs/specs/range-lab/F1-motor.md (RF-01.4)
// ADR : Docs/architecture/decisions/246-range-lab-f1-motor.md (D-F1-7)
//
// A dependencia entra por PARAMETRO (`options.createWorker`), nao por `vi.mock`
// do modulo — licao #34. Assim o teste nao precisa saber como o cliente resolve
// a URL do worker, e o duble vale para os dois ramos (worker e fallback).
//
// O caso que este arquivo existe para matar: trocar o bordo no meio do calculo e
// o resultado do bordo ANTIGO pintar a tela. Passa despercebido por semanas.
//
// Contrato de mensagens (D-F1-7):
//   entrada: { type: 'run', runId, request } | { type: 'cancel', runId }
//   saida  : { type: 'progress', runId, percent }
//          | { type: 'done', runId, result }
//          | { type: 'error', runId, error }
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRangeEngineClient } from "@/lib/combo-calc/engine/client";
import { runEngineToCompletion } from "@/lib/combo-calc/engine/run";
import type { EngineRequest, EngineResult } from "@/lib/combo-calc/engine/types";
import { V2_FLOP, V2_TURN, type SpotV2Like } from "./f1-fixtures";

function exact(spot: SpotV2Like): EngineRequest {
  return { spot: spot as EngineRequest["spot"], mode: "exact" };
}

type Listener = (ev: { data: unknown }) => void;

/**
 * Duble de Worker. Suporta os dois estilos de escuta (`addEventListener` e
 * `onmessage`) para nao amarrar o implementer a um deles.
 */
class FakeWorker {
  posted: any[] = [];
  terminated = false;
  onmessage: Listener | null = null;
  onerror: Listener | null = null;
  private listeners = new Map<string, Listener[]>();

  postMessage(msg: unknown): void {
    this.posted.push(msg);
  }
  addEventListener(type: string, fn: Listener): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }
  removeEventListener(type: string, fn: Listener): void {
    const arr = this.listeners.get(type) ?? [];
    this.listeners.set(type, arr.filter((x) => x !== fn));
  }
  terminate(): void {
    this.terminated = true;
  }

  /** Simula uma mensagem VINDA do worker. */
  emit(msg: unknown): void {
    const ev = { data: msg };
    for (const fn of this.listeners.get("message") ?? []) fn(ev);
    if (this.onmessage) this.onmessage(ev);
  }

  lastRunMessage(): any {
    for (let i = this.posted.length - 1; i >= 0; i--) {
      if (this.posted[i]?.type === "run") return this.posted[i];
    }
    throw new Error(
      `nenhuma mensagem 'run' postada no worker (postadas: ${JSON.stringify(this.posted)})`,
    );
  }
}

function makeHandlers() {
  return {
    onProgress: vi.fn(),
    onResult: vi.fn(),
    onError: vi.fn(),
  };
}

let worker: FakeWorker;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  worker = new FakeWorker();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

// ── caminho do worker ────────────────────────────────────────

describe("F1 D-F1-7 — o cliente conversa com o worker pelo protocolo", () => {
  it("run posta { type: 'run', runId, request }", () => {
    const client = createRangeEngineClient({ createWorker: () => worker });
    const request = exact(V2_FLOP);
    const runId = client.run(request, makeHandlers());

    const msg = worker.lastRunMessage();
    expect(msg.type).toBe("run");
    expect(msg.runId).toBe(runId);
    expect(msg.request).toEqual(request);
    client.dispose();
  });

  it("o payload leva RangeEntry[] e o bordo, nao a lista de combos ja expandida", () => {
    const client = createRangeEngineClient({ createWorker: () => worker });
    client.run(exact(V2_FLOP), makeHandlers());
    const msg = worker.lastRunMessage();
    expect(Array.isArray(msg.request.spot.heroRange)).toBe(true);
    expect(Array.isArray(msg.request.spot.villainRange)).toBe(true);
    expect(msg.request.spot.villainRange[0]).toHaveProperty("notation");
    client.dispose();
  });

  it("runId e monotonico entre corridas", () => {
    const client = createRangeEngineClient({ createWorker: () => worker });
    const a = client.run(exact(V2_FLOP), makeHandlers());
    const b = client.run(exact(V2_TURN), makeHandlers());
    const c = client.run(exact(V2_FLOP), makeHandlers());
    expect(b, `runId nao cresceu: ${a} -> ${b}`).toBeGreaterThan(a);
    expect(c, `runId nao cresceu: ${b} -> ${c}`).toBeGreaterThan(b);
    client.dispose();
  });

  it("mensagem done com o runId atual chega no handler de resultado", () => {
    const client = createRangeEngineClient({ createWorker: () => worker });
    const handlers = makeHandlers();
    const request = exact(V2_FLOP);
    const runId = client.run(request, handlers);
    const result = runEngineToCompletion(request);

    worker.emit({ type: "done", runId, result });

    expect(handlers.onResult).toHaveBeenCalledTimes(1);
    expect(handlers.onResult.mock.calls[0][0]).toEqual(result);
    expect(handlers.onError).not.toHaveBeenCalled();
    client.dispose();
  });

  it("mensagem progress chega no handler de progresso", () => {
    const client = createRangeEngineClient({ createWorker: () => worker });
    const handlers = makeHandlers();
    const runId = client.run(exact(V2_FLOP), handlers);

    worker.emit({ type: "progress", runId, percent: 12 });
    worker.emit({ type: "progress", runId, percent: 73 });

    expect(handlers.onProgress).toHaveBeenCalledTimes(2);
    expect(handlers.onProgress.mock.calls[0][0]).toBe(12);
    expect(handlers.onProgress.mock.calls[1][0]).toBe(73);
    client.dispose();
  });
});

// ── o caso "trocou o bordo no meio do calculo" ───────────────

describe("F1 D-F1-7 — resultado velho nunca pinta a tela", () => {
  it("done com runId antigo e DESCARTADO", () => {
    const client = createRangeEngineClient({ createWorker: () => worker });
    const primeiros = makeHandlers();
    const velhoId = client.run(exact(V2_FLOP), primeiros);

    // O jogador troca o bordo: nova corrida, runId novo.
    const segundos = makeHandlers();
    const novoId = client.run(exact(V2_TURN), segundos);
    expect(novoId).not.toBe(velhoId);

    // O worker antigo termina DEPOIS e responde com o runId velho.
    worker.emit({ type: "done", runId: velhoId, result: runEngineToCompletion(exact(V2_FLOP)) });

    expect(
      primeiros.onResult,
      "resultado de um bordo antigo chegou na tela — o descarte por runId nao existe",
    ).not.toHaveBeenCalled();
    expect(segundos.onResult).not.toHaveBeenCalled();
    client.dispose();
  });

  it("progress com runId antigo tambem e descartado", () => {
    const client = createRangeEngineClient({ createWorker: () => worker });
    const primeiros = makeHandlers();
    const velhoId = client.run(exact(V2_FLOP), primeiros);
    const segundos = makeHandlers();
    client.run(exact(V2_TURN), segundos);

    worker.emit({ type: "progress", runId: velhoId, percent: 90 });

    expect(primeiros.onProgress).not.toHaveBeenCalled();
    expect(segundos.onProgress).not.toHaveBeenCalled();
    client.dispose();
  });

  it("depois de descartar o velho, o done da corrida atual continua funcionando", () => {
    const client = createRangeEngineClient({ createWorker: () => worker });
    const velhoId = client.run(exact(V2_FLOP), makeHandlers());
    const handlers = makeHandlers();
    const novoId = client.run(exact(V2_TURN), handlers);

    worker.emit({ type: "done", runId: velhoId, result: runEngineToCompletion(exact(V2_FLOP)) });
    const atual = runEngineToCompletion(exact(V2_TURN));
    worker.emit({ type: "done", runId: novoId, result: atual });

    expect(handlers.onResult).toHaveBeenCalledTimes(1);
    expect(handlers.onResult.mock.calls[0][0]).toEqual(atual);
    client.dispose();
  });
});

// ── cancelamento e erro ──────────────────────────────────────

describe("F1 D-F1-7 — cancelamento e erro", () => {
  it("cancel() posta { type: 'cancel', runId } com o runId corrente", () => {
    const client = createRangeEngineClient({ createWorker: () => worker });
    const runId = client.run(exact(V2_FLOP), makeHandlers());
    client.cancel();

    const cancelMsg = worker.posted.find((m) => m?.type === "cancel");
    expect(
      cancelMsg,
      `nenhuma mensagem 'cancel' postada (postadas: ${JSON.stringify(worker.posted)})`,
    ).toBeDefined();
    expect(cancelMsg.runId).toBe(runId);
    client.dispose();
  });

  it("uma corrida nova cancela a anterior antes de comecar", () => {
    const client = createRangeEngineClient({ createWorker: () => worker });
    const primeiro = client.run(exact(V2_FLOP), makeHandlers());
    client.run(exact(V2_TURN), makeHandlers());

    const cancelMsg = worker.posted.find((m) => m?.type === "cancel");
    expect(cancelMsg, "trocar de corrida sem cancelar deixa o worker moendo trabalho morto")
      .toBeDefined();
    expect(cancelMsg.runId).toBe(primeiro);
    client.dispose();
  });

  it("mensagem error vai para o handler de erro, nunca para o de resultado", () => {
    const client = createRangeEngineClient({ createWorker: () => worker });
    const handlers = makeHandlers();
    const runId = client.run(exact(V2_FLOP), handlers);

    worker.emit({ type: "error", runId, error: "bordo invalido" });

    expect(handlers.onError).toHaveBeenCalledTimes(1);
    expect(handlers.onError.mock.calls[0][0]).toBe("bordo invalido");
    expect(handlers.onResult).not.toHaveBeenCalled();
    client.dispose();
  });

  it("dispose() encerra o worker", () => {
    const client = createRangeEngineClient({ createWorker: () => worker });
    client.run(exact(V2_FLOP), makeHandlers());
    client.dispose();
    expect(worker.terminated).toBe(true);
  });
});

// ── fallback sincrono (teste, SSR, navegador antigo) ─────────

describe("F1 D-F1-7 — sem Worker, o runner sincrono cobre o mesmo contrato", () => {
  it("createWorker que lanca nao derruba o cliente e ainda entrega resultado", async () => {
    const client = createRangeEngineClient({
      createWorker: () => {
        throw new Error("Worker nao existe neste ambiente");
      },
    });
    const handlers = makeHandlers();
    client.run(exact(V2_FLOP), handlers);

    await vi.waitFor(() => expect(handlers.onResult).toHaveBeenCalledTimes(1));
    expect(handlers.onError).not.toHaveBeenCalled();
    client.dispose();
  });

  it("o resultado do fallback e IDENTICO ao do caminho de worker", async () => {
    const request = exact(V2_FLOP);

    // Caminho de worker: o duble roda o motor e devolve pelo protocolo.
    const comWorker = createRangeEngineClient({ createWorker: () => worker });
    const handlersWorker = makeHandlers();
    const runId = comWorker.run(request, handlersWorker);
    worker.emit({ type: "done", runId, result: runEngineToCompletion(request) });
    const resultadoWorker = handlersWorker.onResult.mock.calls[0][0] as EngineResult;
    comWorker.dispose();

    // Caminho sincrono.
    const semWorker = createRangeEngineClient({
      createWorker: () => {
        throw new Error("sem Worker");
      },
    });
    const handlersSync = makeHandlers();
    semWorker.run(request, handlersSync);
    await vi.waitFor(() => expect(handlersSync.onResult).toHaveBeenCalledTimes(1));
    const resultadoSync = handlersSync.onResult.mock.calls[0][0] as EngineResult;
    semWorker.dispose();

    expect(resultadoSync).toEqual(resultadoWorker);
  });

  it("o ramo de fallback e observavel: loga antes de degradar (licao #9)", () => {
    const client = createRangeEngineClient({
      createWorker: () => {
        throw new Error("sem Worker");
      },
    });
    client.run(exact(V2_FLOP), makeHandlers());
    expect(
      warnSpy,
      "cair no runner sincrono em silencio traz de volta a tela travada sem ninguem saber por que",
    ).toHaveBeenCalled();
    client.dispose();
  });

  it("sem options o cliente ainda e construivel (producao resolve o Worker sozinha)", () => {
    expect(() => {
      const client = createRangeEngineClient();
      client.dispose();
    }).not.toThrow();
  });
});
