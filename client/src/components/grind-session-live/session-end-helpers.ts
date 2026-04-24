/**
 * Session End Helpers (UX 2026-04-24 — GL-D)
 *
 * Helpers puros para calcular a lista de torneios que serao auto-encerrados
 * quando o usuario finaliza uma sessao. Usado pelo modal de confirmacao
 * para mostrar um aviso explicito antes de auto-fechar com resultado zero.
 */

export interface PendingTournamentSummary {
  id: string;
  site?: string | null;
  name?: string | null;
  time?: string | null;
  buyIn?: string | number | null;
}

export interface PendingTournamentInput {
  id?: string;
  status?: string | null;
  site?: string | null;
  name?: string | null;
  time?: string | null;
  buyIn?: string | number | null;
}

/**
 * Filtra a lista de torneios da sessao para aqueles em status 'registered'
 * (em andamento) que serao encerrados automaticamente no finalize.
 *
 * Nao inclui:
 *  - 'upcoming' (ainda nao foram iniciados; nao sao auto-fechados)
 *  - 'finished', 'deleted' (ja encerrados)
 *  - Registros sem id valido
 */
export function getPendingTournamentsForSessionEnd(
  sessionTournaments: PendingTournamentInput[] | null | undefined
): PendingTournamentSummary[] {
  if (!Array.isArray(sessionTournaments)) return [];
  const result: PendingTournamentSummary[] = [];
  for (const t of sessionTournaments) {
    if (!t || !t.id) continue;
    if ((t.status ?? '').toLowerCase() !== 'registered') continue;
    result.push({
      id: t.id,
      site: t.site ?? null,
      name: t.name ?? null,
      time: t.time ?? null,
      buyIn: t.buyIn ?? null,
    });
  }
  return result;
}

/**
 * Formata um torneio pendente em uma linha curta: "site - name (time)".
 * Usado no modal de confirmacao para listar os torneios que serao fechados.
 */
export function formatPendingTournamentLabel(t: PendingTournamentSummary): string {
  const site = t.site?.trim() || 'Torneio';
  const name = t.name?.trim() || 'Sem nome';
  const time = t.time?.trim();
  return time ? `${site} - ${name} (${time})` : `${site} - ${name}`;
}
