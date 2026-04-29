// =============================================================================
// Sprint F4 W0 — tracker.ts (telemetria stub via console.log)
//
// ADR-055: stub via console.log; interface estavel emit(event, payload).
// Quando uma plataforma real de telemetria entrar (PostHog/Mixpanel/etc),
// trocamos so a implementacao desta funcao mantendo o contrato.
//
// Telemetria nunca quebra fluxo: try/catch silencia erros internos.
// =============================================================================

export function emit(
  event: string,
  payload: Record<string, unknown> = {},
): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(payload ?? {});
  } catch {
    // Circular refs ou estruturas exoticas — fallback string
    serialized = "null";
  }
  try {
    console.log("[track]", event, serialized);
  } catch {
    // ignore — telemetry never breaks app flow
  }
}
