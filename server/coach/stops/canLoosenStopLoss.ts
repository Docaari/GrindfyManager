/**
 * Fase D #5 — Stop-loss cold-commit (RF-04, ADR-235 D-1).
 *
 * Helper PURO: decide se uma edição de stopLossUsd é permitida.
 *
 * Regra (ADR-235 D-1):
 *   - hasActiveSession === false  -> SEMPRE allowed (a frio: sobe, desce, null).
 *   - next === current (ou ambos null) -> allowed (no-op).
 *   - current == null && next != null  -> allowed (criar proteção é sempre OK).
 *   - current != null && next == null  -> blocked (remover stop quente = afrouxar ao máximo).
 *   - current != null && next != null && next > current -> blocked (aumentar = afrouxar).
 *   - next < current -> allowed (apertar é sempre OK).
 */

export type CanLoosenResult =
  | { allowed: true }
  | { allowed: false; code: "STOP_LOOSEN_BLOCKED" };

export function canLoosenStopLoss(
  current: number | null,
  next: number | null,
  hasActiveSession: boolean,
): CanLoosenResult {
  // A frio: edição sempre livre.
  if (!hasActiveSession) return { allowed: true };

  // No-op (inclui ambos null).
  if (next === current) return { allowed: true };

  // Criar proteção (null -> valor) é sempre OK.
  if (current == null) return { allowed: true };

  // Remover stop quente (valor -> null) = afrouxar ao máximo.
  if (next == null) return { allowed: false, code: "STOP_LOOSEN_BLOCKED" };

  // Afrouxar (aumentar) = bloqueado; apertar (diminuir) = permitido.
  if (next > current) return { allowed: false, code: "STOP_LOOSEN_BLOCKED" };

  return { allowed: true };
}
