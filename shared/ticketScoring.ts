/**
 * Helpers de scoring sensiveis a ticket de satelite.
 *
 * Spec: docs/specs/satellite-tickets-management.md (RF-06)
 * ADR-036: effectiveBuyIn = 0 quando enteredViaSatellite=true OU consumedTicketId != null;
 *          ROI individual retorna null quando effectiveBuyIn === 0.
 *
 * Este modulo NAO refatora call sites existentes (Sprint 2 fara essa integracao).
 * Em Sprint 1 apenas exporta as primitivas para os novos consumidores.
 */

type ParseableNumber = string | number | null | undefined;

function parseNum(v: ParseableNumber): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export interface ScoringTournament {
  buyIn?: ParseableNumber;
  prize?: ParseableNumber;
  bounty?: ParseableNumber;
  type?: string;
  enteredViaSatellite?: boolean;
  consumedTicketId?: string | null;
}

/**
 * effectiveBuyIn = 0 quando enteredViaSatellite=true OU consumedTicketId esta preenchido.
 * Caso contrario retorna parseFloat(buyIn). Se buyIn ausente/invalido, retorna 0.
 */
export function getEffectiveBuyIn(t: ScoringTournament): number {
  if (t == null) return 0;
  if (t.enteredViaSatellite === true) return 0;
  if (t.consumedTicketId != null && t.consumedTicketId !== "") return 0;
  return parseNum(t.buyIn);
}

/**
 * profit = prize + bounty(so PKO/Mystery) - effectiveBuyIn.
 * Bounty e ignorado em Vanilla/Satellite/outros (nao aplicavel).
 */
export function getProfit(t: ScoringTournament): number {
  const prize = parseNum(t.prize);
  const eb = getEffectiveBuyIn(t);
  const type = (t.type ?? "Vanilla").toLowerCase();
  const usesBounty = type === "pko" || type === "mystery";
  const bounty = usesBounty ? parseNum(t.bounty) : 0;
  return prize + bounty - eb;
}

/**
 * ROI individual em %. Retorna null quando effectiveBuyIn === 0
 * (semantica matematica indefinida; UI mostra "—").
 */
export function getIndividualROI(t: ScoringTournament): number | null {
  const eb = getEffectiveBuyIn(t);
  if (eb === 0) return null;
  const profit = getProfit(t);
  return (profit / eb) * 100;
}
