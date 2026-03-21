/**
 * Library Dedup — deduplication functions for tournament library imports
 */

interface IncomingTournament {
  name: string;
  site: string;
  buyIn: string;
  externalId: string | null;
  [key: string]: any;
}

interface ExistingLibraryItem {
  name: string;
  site: string;
  buyIn: string;
  externalId: string | null;
  deletedAt: Date | null;
  [key: string]: any;
}

/**
 * Checks if an incoming tournament is a duplicate by externalId.
 * Returns false if either externalId is null (manual tournaments don't dedup by id).
 */
export function isDuplicateByExternalId(
  incoming: IncomingTournament,
  existing: ExistingLibraryItem[]
): boolean {
  if (incoming.externalId == null) {
    return false;
  }
  return existing.some(
    (item) => item.externalId != null && item.externalId === incoming.externalId
  );
}

/**
 * Checks if an incoming tournament is a duplicate by name + site + buyIn.
 * Name comparison is case-insensitive.
 * Checks against both active and trashed items.
 */
export function isDuplicateByFields(
  incoming: IncomingTournament,
  existing: ExistingLibraryItem[]
): boolean {
  const incomingNameLower = incoming.name.toLowerCase();
  return existing.some(
    (item) =>
      item.name.toLowerCase() === incomingNameLower &&
      item.site === incoming.site &&
      item.buyIn === incoming.buyIn
  );
}

/**
 * Filters an array of incoming tournaments, removing any that already exist.
 * Uses externalId match first (for suprema imports), then falls back to
 * name + site + buyIn match (for manual/grind-live).
 */
export function filterNewTournaments(
  incoming: IncomingTournament[],
  existing: ExistingLibraryItem[]
): IncomingTournament[] {
  return incoming.filter((item) => {
    if (isDuplicateByExternalId(item, existing)) {
      return false;
    }
    if (isDuplicateByFields(item, existing)) {
      return false;
    }
    return true;
  });
}
