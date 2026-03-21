/**
 * Late registration alert manager.
 * Handles alert detection, deduplication, and threshold resolution.
 */

interface SessionTournamentForAlert {
  id: string;
  name: string;
  time: string;
  lateRegMinutes: number | null;
  alertMinutesBefore: number | null;
  status: string;
  startTime: Date;
}

interface LateRegUserSettings {
  lateRegAlertMinutes: number;
  lateRegAlertEnabled: boolean;
  lateRegAlertSound: boolean;
}

export class LateRegAlertManager {
  private alertedIds: Set<string> = new Set();

  shouldAlert(tournament: SessionTournamentForAlert, settings: LateRegUserSettings): boolean {
    // Master switch
    if (!settings.lateRegAlertEnabled) return false;

    // Only upcoming tournaments
    if (tournament.status !== 'upcoming') return false;

    // Must have lateRegMinutes > 0
    if (!tournament.lateRegMinutes) return false;

    // Already alerted
    if (this.alertedIds.has(tournament.id)) return false;

    // Calculate deadline and minutes remaining
    const deadline = new Date(tournament.startTime.getTime() + tournament.lateRegMinutes * 60000);
    const now = new Date();
    const minutesRemaining = (deadline.getTime() - now.getTime()) / 60000;

    // Late reg already expired
    if (minutesRemaining <= 0) return false;

    // Resolve threshold
    const threshold = tournament.alertMinutesBefore !== null
      ? tournament.alertMinutesBefore
      : settings.lateRegAlertMinutes;

    return minutesRemaining <= threshold;
  }

  markAlerted(tournamentId: string): void {
    this.alertedIds.add(tournamentId);
  }

  resetAlerted(tournamentId: string): void {
    this.alertedIds.delete(tournamentId);
  }

  checkTournaments(
    tournaments: SessionTournamentForAlert[],
    settings: LateRegUserSettings,
  ): SessionTournamentForAlert[] {
    return tournaments.filter((t) => this.shouldAlert(t, settings));
  }

  reset(): void {
    this.alertedIds.clear();
  }
}
