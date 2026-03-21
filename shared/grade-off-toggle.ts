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
