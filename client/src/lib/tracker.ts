// =============================================================================
// Sprint F4 W0 — Frontend tracker shim
//
// ADR-055: mesmo contrato emit(event, payload) que server/utils/tracker.ts.
// Stub via console.log enquanto plataforma real de analytics nao chega.
// =============================================================================

export function emit(
  event: string,
  payload: Record<string, unknown> = {},
): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(payload ?? {});
  } catch {
    serialized = "null";
  }
  try {
    // eslint-disable-next-line no-console
    console.log("[track]", event, serialized);
  } catch {
    // ignore
  }
}
