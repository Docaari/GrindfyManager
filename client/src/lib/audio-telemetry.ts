// =============================================================================
// Sprint MP-VALIDATION / RF-01 — alias DEPRECATED 90d.
//
// Esse modulo foi consolidado em `client/src/lib/activity-telemetry.ts` (ADR-207
// generaliza ADR-191 para 4 dominios: audio/lesson/coach/library).
//
// Imports legacy `@/lib/audio-telemetry` continuam funcionando — re-export do
// `emitAudioEvent` + helpers. Sera removido apos 90d (~2026-08-22).
// =============================================================================

import {
  emitAudioEvent as _emitAudioEvent,
  flushBacklog as _flushBacklog,
  _resetForTests as _reset,
} from "./activity-telemetry";

let _warnedOnce = false;
function warnDeprecation() {
  if (_warnedOnce) return;
  _warnedOnce = true;
  try {
    if (
      typeof process !== "undefined" &&
      process.env?.NODE_ENV === "development"
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        "[audio-telemetry] DEPRECATED — migrate to @/lib/activity-telemetry (removal: ~2026-08-22)",
      );
    }
  } catch {
    // ignore
  }
}

export function emitAudioEvent(
  action: string,
  payload: Record<string, unknown>,
  options?: Parameters<typeof _emitAudioEvent>[2],
): Promise<void> {
  warnDeprecation();
  return _emitAudioEvent(action, payload, options);
}

export const flushBacklog = _flushBacklog;
export const _resetForTests = _reset;
