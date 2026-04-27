/**
 * telemetry — adapter simples client-side (RF-11).
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *
 * Funcao `track(event, payload)` exposta para os emit helpers em
 * `client/src/lib/session-end/telemetry.ts`.
 *
 * Em dev: console.log com prefixo. Em prod: best-effort POST a /api/telemetry
 * (silenciosamente ignora falhas — telemetria nao bloqueia UX).
 *
 * Sem PII: payloads esperam apenas IDs + flags.
 */

export function track(event: string, payload: Record<string, unknown>): void {
  // Dev visibility — ajuda debug.
  // eslint-disable-next-line no-console
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug("[telemetry]", event, payload);
  }

  // Best-effort POST (best effort, fire-and-forget; nao quebra UX em failure).
  if (typeof fetch !== "function") return;
  try {
    void fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, payload }),
      credentials: "include",
    }).catch(() => {
      // ignore network errors
    });
  } catch {
    // ignore
  }
}
