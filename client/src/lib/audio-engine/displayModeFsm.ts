// displayMode FSM — pure transitions. Sprint Mini Player 1 / ADR-188.
// Canonical machine: hidden <-> bar <-> expanded. Pure, testable without React.

import type { DisplayMode } from "./types";

export function canExpand(current: unknown): boolean {
  return current !== null && current !== undefined;
}

export function nextOnEsc(mode: DisplayMode): DisplayMode {
  return mode === "expanded" ? "bar" : "hidden";
}

/**
 * Close eh direto: tanto `bar` quanto `expanded` vao para `hidden` sem passar
 * por estado transient. Alinhado com o codigo do AudioPlayerContext.close()
 * (ADR-188 — sem transient bar 0ms; UX comprovou que slide-down direto eh mais
 * previsivel que double-step expanded→bar→hidden).
 *
 * Mantemos o parametro `mode` no shape mesmo que nao seja lido hoje, porque:
 *   1. Documenta a transition como "qualquer mode → hidden" no call-site.
 *   2. Permite no-op tracking futuro (telemetria `from=mode,to=hidden`).
 *   3. Casa com a API das outras transition functions (`nextOnEsc`, etc).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function nextOnClose(mode: DisplayMode): DisplayMode {
  return "hidden";
}

export function nextOnPlayTrack(mode: DisplayMode): DisplayMode {
  return mode === "hidden" ? "bar" : mode;
}

export function nextOnFullscreenEnter(_mode: DisplayMode): DisplayMode {
  return "hidden";
}

export function nextOnFullscreenExit(
  modeBefore: DisplayMode,
  hasCurrent: boolean,
): DisplayMode {
  if (modeBefore === "hidden" || !hasCurrent) return "hidden";
  return "bar";
}
