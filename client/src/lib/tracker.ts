// =============================================================================
// Sprint F4 W0 — Frontend tracker shim
//
// ADR-055: mesmo contrato emit(event, payload) que server/utils/tracker.ts.
// Stub via console.log enquanto plataforma real de analytics nao chega.
//
// TODO(2026-08-23): cleanup day_zoom_* events apos analise adocao (Sprint
// day-detail-zoom-1 §RF-05 cap delete; ADR-210 §6). Se telemetria
// `coach.day_zoom.opened` >0 em >=95% das sessoes WAU em 14d consecutivos,
// remover DayDetailDrawer + flag rollback + branch `useDayZoomState.mode`.
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
