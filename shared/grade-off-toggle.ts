interface PlannedTournament {
  id: string;
  dayOfWeek: number;
  isActive: boolean;
  [key: string]: any;
}

interface OffToggleWarning {
  needsWarning: boolean;
  tournamentCount: number;
}

export function checkOffToggleWarning(
  dayOfWeek: number,
  tournaments: PlannedTournament[],
): OffToggleWarning {
  const activeTournaments = tournaments.filter(
    (t) => t.dayOfWeek === dayOfWeek && t.isActive,
  );

  return {
    needsWarning: activeTournaments.length > 0,
    tournamentCount: activeTournaments.length,
  };
}

export function isProfileSwitchToOff(targetProfile: string): boolean {
  return targetProfile === 'OFF';
}

export function getAffectedTournaments(
  dayOfWeek: number,
  tournaments: PlannedTournament[],
): PlannedTournament[] {
  return tournaments.filter(
    (t) => t.dayOfWeek === dayOfWeek && t.isActive,
  );
}

export function shouldShowOffDialog(
  targetProfile: string,
  dayOfWeek: number,
  tournaments: PlannedTournament[],
): boolean {
  if (!isProfileSwitchToOff(targetProfile)) return false;
  return getAffectedTournaments(dayOfWeek, tournaments).length > 0;
}
