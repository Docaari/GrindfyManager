/**
 * Result Dialog Helpers (UX 2026-04-24 — GL-F)
 *
 * Adapta o formulario de "Registrar Resultado" ao tipo de torneio. PKO e
 * Mystery tem bounty; Vanilla nao — mostrar o campo em Vanilla e ruido
 * (campo sem semantica util), esconder reduz friccao.
 */

/**
 * Retorna true se o torneio deve exibir o campo de bounty no dialog
 * de resultado. Regra: 'PKO' e 'Mystery' usam bounty. Vanilla e outros
 * tipos nao. Comparacao case-insensitive + trim defensivo.
 */
export function shouldShowBountyField(
  tournamentType: string | null | undefined,
): boolean {
  if (!tournamentType) return false;
  const normalized = String(tournamentType).trim().toLowerCase();
  return normalized === 'pko' || normalized === 'mystery';
}
