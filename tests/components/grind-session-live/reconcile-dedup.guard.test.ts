/**
 * Guard test (HIGH-1, reviewer 2026-05-29) — Sprint grind-live-detail-parity.
 *
 * Garante que o reconcile de alerta de Max Late NAO agenda 2 alertas para o
 * mesmo torneio efetivo quando um planned tem um shadow registrado.
 *
 * Antes do fix HIGH-1, GrindSessionLive montava a lista inline
 * `[...planned.map(planned-${id}), ...session]` (sem dedup), produzindo
 * planned-P1 (upcoming) + sess-1 (registered shadow) -> 2 alertas (ids distintos)
 * -> dupla narracao TTS. O fix usa combineTournaments (mesma fonte do render),
 * que colapsa planned+shadow numa unica row. Este teste compoe
 * combineTournaments + replaceMaxLateAlert (o que o useEffect de reconcile faz)
 * e exige exatamente 1 alerta tournament por torneio efetivo.
 *
 * Lessons: #14/#26 await import; now injetavel deterministico; #3 shape real do
 * SessionAlertManager (getActiveAlerts publico).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionAlertManager } from '../../../shared/generic-alerts';

const HELPERS = '../../../client/src/components/grind-session-live/helpers';

let manager: SessionAlertManager;
beforeEach(() => {
  manager = new SessionAlertManager();
});

const tournamentAlerts = () =>
  manager.getActiveAlerts().filter((a) => a.type === 'tournament');

// Espelha o loop de reconcile do GrindSessionLive (pos fix HIGH-1):
// combineTournaments -> para cada row upcoming/registered com registrationTime,
// replaceMaxLateAlert. combineTournaments e a fonte deduplicada (mesma do render).
async function runReconcile(session: any[], planned: any[], now: Date) {
  const { combineTournaments, replaceMaxLateAlert } = await import(HELPERS);
  const combined = combineTournaments(session, planned);
  for (const t of combined) {
    if (
      (t.status === 'upcoming' || t.status === 'registered') &&
      typeof t.registrationTime === 'string' &&
      t.registrationTime.trim() !== ''
    ) {
      replaceMaxLateAlert(manager, t, { now });
    }
  }
  return combined;
}

describe('reconcile dedup — planned + shadow registrado (HIGH-1)', () => {
  it('planned com shadow registrado agenda 1 alerta (nao 2)', async () => {
    const now = new Date(2026, 4, 29, 19, 0, 0, 0); // 19:00 local
    const planned = [
      {
        id: 'P1',
        name: 'Bounty Builder',
        site: 'PokerStars',
        buyIn: '109',
        time: '20:00',
        registrationTime: '20:30',
        status: 'upcoming',
      },
    ];
    // Shadow registrado do planned P1 (plannedTournamentId casa -> planned escondido).
    const session = [
      {
        id: 'sess-1',
        plannedTournamentId: 'P1',
        fromPlannedTournament: true,
        name: 'Bounty Builder',
        site: 'PokerStars',
        buyIn: '109',
        time: '20:00',
        registrationTime: '20:30',
        status: 'registered',
      },
    ];

    const combined = await runReconcile(session, planned, now);

    // combineTournaments colapsa planned+shadow numa unica row efetiva.
    expect(combined.filter((t: any) => t.registrationTime).length).toBe(1);
    // E o reconcile agenda exatamente 1 alerta tournament.
    expect(tournamentAlerts()).toHaveLength(1);
  });

  it('planned upcoming sozinho (sem shadow) agenda 1 alerta', async () => {
    const now = new Date(2026, 4, 29, 19, 0, 0, 0);
    const planned = [
      {
        id: 'P2',
        name: 'Big 22',
        site: 'PokerStars',
        buyIn: '22',
        time: '21:00',
        registrationTime: '21:30',
        status: 'upcoming',
      },
    ];

    await runReconcile([], planned, now);

    expect(tournamentAlerts()).toHaveLength(1);
  });

  it('dois torneios distintos com registrationTime agendam 2 alertas (1 cada)', async () => {
    const now = new Date(2026, 4, 29, 19, 0, 0, 0);
    const session = [
      {
        id: 'sess-A',
        name: 'Hot 11',
        site: 'PokerStars',
        buyIn: '11',
        time: '20:00',
        registrationTime: '20:30',
        status: 'registered',
      },
      {
        id: 'sess-B',
        name: 'Mini Main',
        site: 'GGPoker',
        buyIn: '55',
        time: '21:00',
        registrationTime: '21:45',
        status: 'upcoming',
      },
    ];

    await runReconcile(session, [], now);

    expect(tournamentAlerts()).toHaveLength(2);
  });
});
