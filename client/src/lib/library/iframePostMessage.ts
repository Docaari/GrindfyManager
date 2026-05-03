// =============================================================================
// iframePostMessage — Sprint Biblioteca-2 / RF-06 + ADR-094.
//
// Helpers para o protocolo postMessage entre LessonViewer (parent) e o
// iframe sandbox que renderiza o artigo (child com lesson.js).
//
// Whitelist de tipos:
//   - 'grindfy:library:resize'  -> payload { height: number }, cap 50000.
//   - 'grindfy:library:scroll'  -> payload { percent: number }, clamp 0-100.
//
// Mensagens fora desse contrato sao ignoradas silenciosamente.
//
// IMPORTANT (ADR-092 + ADR-094): event.source eh validado pelo CALLER, nao
// aqui. parseLibraryMessage assume que `data` ja foi extraido do
// MessageEvent. event.origin nao eh validado porque iframe sandbox sem
// allow-same-origin tem origin === 'null'.
// =============================================================================

export type LibraryMessageType =
  | "grindfy:library:resize"
  | "grindfy:library:scroll";

export interface LibraryResizeMessage {
  type: "grindfy:library:resize";
  payload: { height: number };
}

export interface LibraryScrollMessage {
  type: "grindfy:library:scroll";
  payload: { percent: number };
}

export type LibraryMessage = LibraryResizeMessage | LibraryScrollMessage;

const MAX_HEIGHT = 50000;

export function clampHeight(h: number): number {
  if (typeof h !== "number" || Number.isNaN(h)) return 0;
  if (h < 0) return 0;
  if (h > MAX_HEIGHT) return MAX_HEIGHT;
  return h;
}

export function clampPercent(p: number): number {
  if (typeof p !== "number" || Number.isNaN(p)) return 0;
  if (p < 0) return 0;
  if (p > 100) return 100;
  return p;
}

export function isResizeMessage(data: any): data is LibraryResizeMessage {
  return (
    !!data &&
    typeof data === "object" &&
    data.type === "grindfy:library:resize" &&
    !!data.payload &&
    typeof data.payload.height === "number"
  );
}

export function isScrollMessage(data: any): data is LibraryScrollMessage {
  return (
    !!data &&
    typeof data === "object" &&
    data.type === "grindfy:library:scroll" &&
    !!data.payload &&
    typeof data.payload.percent === "number"
  );
}

/**
 * Valida + retorna mensagem tipada da Biblioteca, ou null quando data
 * fora do contrato (type errado, payload mal-formado, data nao-objeto).
 */
export function parseLibraryMessage(data: any): LibraryMessage | null {
  if (data == null) return null;
  if (typeof data !== "object") return null;
  if (isResizeMessage(data)) return data;
  if (isScrollMessage(data)) return data;
  return null;
}
