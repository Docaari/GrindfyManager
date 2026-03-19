/**
 * Filters out incoming Suprema tournaments that already exist in planned tournaments.
 * Comparison is done by externalId.
 */

interface IncomingTournament {
  externalId: string;
  [key: string]: any;
}

interface ExistingTournament {
  externalId: string | null;
  [key: string]: any;
}

export function filterDuplicateSupremaTournaments(
  incoming: IncomingTournament[],
  existing: ExistingTournament[],
): IncomingTournament[] {
  const existingIds = new Set(
    existing
      .map((t) => t.externalId)
      .filter((id): id is string => id != null),
  );

  return incoming.filter((t) => !existingIds.has(t.externalId));
}
