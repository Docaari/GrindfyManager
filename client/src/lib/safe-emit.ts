// =============================================================================
// safeEmit — wrapper fire-and-forget para `emitCoachEvent`.
//
// Garante:
//   - NUNCA throws (try/catch em torno do emit sincrono).
//   - Promise rejeitada nao vira unhandled rejection (`.catch(() => {})`).
//
// Use em componentes que disparam telemetria do Coach durante render/handlers
// onde uma falha em telemetria nao deve impactar o fluxo do usuario.
// =============================================================================

import { emitCoachEvent } from "@/lib/activity-telemetry";

export function safeEmit(action: string, payload: Record<string, unknown>): void {
  try {
    const r = emitCoachEvent(action, payload);
    if (r && typeof (r as any).then === "function") {
      (r as Promise<void>).catch(() => {});
    }
  } catch {
    // fire-and-forget.
  }
}

export default safeEmit;
