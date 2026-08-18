// Historico local generico de undo/redo (F2, D-F2-2, ADR-247).
// Modulo PURO e GENERICO: nao conhece RangeEntry, so `T`. Cada consumidor
// (range do heroi, range do vilao, entries do popup) instancia sua PROPRIA
// pilha — nunca compartilhada (D-F2-2: "por matriz", nao "por pagina").
export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

/** Cap de `past` — evita crescimento ilimitado numa sessao longa de pintura. */
export const HISTORY_CAP = 50;

export function createHistory<T>(initial: T): HistoryState<T> {
  return { past: [], present: initial, future: [] };
}

function capPast<T>(past: T[]): T[] {
  if (past.length <= HISTORY_CAP) return past;
  return past.slice(past.length - HISTORY_CAP);
}

/** Empilha o `present` atual em `past` e adota `next`; limpa `future` (redo morre). */
export function push<T>(state: HistoryState<T>, next: T): HistoryState<T> {
  return {
    past: capPast([...state.past, state.present]),
    present: next,
    future: [],
  };
}

/** Move `present` para `future` e recupera o topo de `past`. No-op se `past` vazio. */
export function undo<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.past.length === 0) return state;
  const past = state.past.slice(0, -1);
  const present = state.past[state.past.length - 1];
  return { past, present, future: [state.present, ...state.future] };
}

/** Desfaz um undo: recupera o topo de `future`. No-op se `future` vazio. */
export function redo<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.future.length === 0) return state;
  const [present, ...future] = state.future;
  return { past: capPast([...state.past, state.present]), present, future };
}

/**
 * Reset em prop externa (loadSpot()/reset() de RangeLab.tsx) — NAO e um push.
 * Zera past/future para nao revelar o estado ANTERIOR ao reset num Ctrl+Z
 * seguinte (estado fantasma, D-F2-2).
 */
export function resetHistory<T>(_state: HistoryState<T>, next: T): HistoryState<T> {
  return { past: [], present: next, future: [] };
}
