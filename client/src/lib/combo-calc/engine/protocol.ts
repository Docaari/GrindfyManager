// Protocolo de mensagens entre a main thread e o worker do motor (ADR-246 D-F1-7).
//
// O `runId` e monotonico e o cliente DESCARTA qualquer mensagem que nao seja da
// corrida corrente. E o que impede o resultado de um bordo antigo pintar a tela
// sobre o bordo novo — defeito que passa despercebido por semanas porque o numero
// parece plausivel.
//
// O payload leva `RangeEntry[]` e o bordo, NAO a lista de combos ja expandida: a
// expansao acontece dentro do worker. Menos trabalho na main thread e payload
// menor (um range grande vira centenas de objetos que nao precisam atravessar a
// fronteira de serializacao).
import type { EngineRequest, EngineResult } from "./types";

export type EngineInboundMessage =
  | { type: "run"; runId: number; request: EngineRequest }
  | { type: "cancel"; runId: number };

export type EngineOutboundMessage =
  | { type: "progress"; runId: number; percent: number }
  | { type: "done"; runId: number; result: EngineResult }
  | { type: "error"; runId: number; error: string };

/** Fatia de trabalho: 200 ms OU 200 mil unidades, o que vier primeiro (emenda A2). */
export const SLICE_MS = 200;
export const SLICE_UNITS = 200_000;
