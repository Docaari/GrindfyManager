// =============================================================================
// coachTimeUtils — helpers de formatacao de tempo para coach UI.
//
// Centraliza a logica de "tempo ate reset" usada em RateLimitBanner (RF-09)
// e LimitCounter no CoachAI (RF-08). Antes existiam duas implementacoes
// divergentes: uma mostrava "0h" para qualquer tempo < 1h (CoachAI), outra
// mostrava "em 45m" / "em instantes" (RateLimitBanner). MEDIUM-11 fix:
// unificar em um unico helper.
// =============================================================================

/**
 * Formata o tempo restante ate `resetAt` em pt-BR.
 *
 * Ex.:
 *  - resetAt 3h45m no futuro  → "3h 45m"
 *  - resetAt 45m no futuro    → "45m"
 *  - resetAt < 1m no futuro   → "em instantes"
 *  - resetAt no passado       → "em instantes"
 *  - resetAt invalido / null  → string vazia
 *
 * @param resetAt ISO string ou null/undefined.
 * @param withPrefix se true (default), prefixa "em " no resultado (exceto "em instantes").
 */
export function formatTimeUntilReset(
  resetAt: string | null | undefined,
  withPrefix: boolean = true,
): string {
  if (!resetAt) return '';
  let target: number;
  try {
    target = new Date(resetAt).getTime();
  } catch {
    return '';
  }
  if (Number.isNaN(target)) return '';
  const now = Date.now();
  const diffMs = target - now;
  if (diffMs <= 0) return 'em instantes';
  const totalMin = Math.max(1, Math.floor(diffMs / 60_000));
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  const prefix = withPrefix ? 'em ' : '';
  if (hours === 0) return `${prefix}${minutes}m`;
  if (minutes === 0) return `${prefix}${hours}h`;
  return `${prefix}${hours}h ${minutes}m`;
}

/**
 * Variante usada no LimitCounter / tooltip ("Reseta em ...").
 * Garante que tempos < 1h NAO mostrem "Reseta em 0h" (bug original).
 */
export function formatResetTooltip(resetAt: string | null | undefined): string {
  if (!resetAt) return '';
  const text = formatTimeUntilReset(resetAt, true);
  if (!text) return '';
  return `Reseta ${text}`;
}
