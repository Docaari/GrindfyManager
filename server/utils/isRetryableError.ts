// =============================================================================
// server/utils/isRetryableError — Sprint AI-3.2 / RF-A4 (ADR-203)
//
// Extrai helper inline de `server/coach/anthropicClient.ts` para uso futuro
// (FX adapters, Stripe, Mux).
//
// API:
//   - RETRYABLE_STATUS = [429, 500, 529] as const
//   - isRetryableError(err: unknown): boolean
//     true se status ∈ RETRYABLE_STATUS OR message inclui
//     ECONNRESET/ETIMEDOUT/network/fetch failed (case-insensitive).
//
// Notes:
//   - 429 (rate limit), 500 (server error), 529 (Anthropic overloaded).
//   - Tolera err sem `.status` (lê .statusCode também) + códigos `.code`.
// =============================================================================

export const RETRYABLE_STATUS = [429, 500, 529] as const;

const NETWORK_PATTERNS = [
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ECONNREFUSED/i,
  /network/i,
  /fetch failed/i,
];

export function isRetryableError(err: unknown): boolean {
  // Errors são objects — não precisamos aceitar `function`. Lesson nova:
  // includ `typeof err !== "function"` no guard era redundante.
  if (err == null || typeof err !== "object") return false;
  const anyErr = err as any;
  const status = Number(anyErr?.status ?? anyErr?.statusCode ?? 0);
  if (status === 429 || status === 529) return true;
  if (status >= 500 && status < 600) return true;
  const code = String(anyErr?.code ?? "").toUpperCase();
  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNREFUSED") return true;
  const message = String(anyErr?.message ?? "");
  if (NETWORK_PATTERNS.some((rx) => rx.test(message))) return true;
  return false;
}
