/**
 * Library Suprema Sync — process Suprema API tournaments for library import
 */

interface SupremaTournament {
  id: number;
  name: string;
  buyin: number;
  guaranteed: number;
  date: string; // "YYYY-MM-DD HH:mm:ss"
  isKO: number; // 0 = Vanilla, 1 = PKO
  temponivelmMeta: number;
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

interface SyncedTournament {
  name: string;
  site: string;
  buyIn: string;
  guaranteed: string;
  time: string;
  type: string;
  speed: string;
  source: 'suprema';
  externalId: string;
}

function mapSpeed(temponivelmMeta: number): string {
  if (temponivelmMeta <= 6) return 'Hyper';
  if (temponivelmMeta <= 10) return 'Turbo';
  return 'Normal';
}

function extractTime(dateStr: string): string {
  // "YYYY-MM-DD HH:mm:ss" -> "HH:mm"
  const parts = dateStr.split(' ');
  if (parts.length >= 2) {
    const timeParts = parts[1].split(':');
    return `${timeParts[0]}:${timeParts[1]}`;
  }
  return '00:00';
}

/**
 * Processes Suprema API tournaments for library import.
 * - Maps Suprema fields to tournament_library format
 * - Deduplicates by externalId against existing library (active + trashed)
 * - Returns array of new tournaments ready for insertion
 */
export function processSupremaSync(
  supremaTournaments: SupremaTournament[],
  existingLibrary: ExistingLibraryItem[]
): SyncedTournament[] {
  const existingExternalIds = new Set(
    existingLibrary
      .filter((item) => item.externalId != null)
      .map((item) => item.externalId!)
  );

  const mapped: SyncedTournament[] = [];

  for (const st of supremaTournaments) {
    const externalId = `suprema-${st.id}`;

    if (existingExternalIds.has(externalId)) {
      continue;
    }

    mapped.push({
      name: st.name,
      site: 'Suprema',
      buyIn: String(st.buyin),
      guaranteed: String(st.guaranteed),
      time: extractTime(st.date),
      type: st.isKO === 1 ? 'PKO' : 'Vanilla',
      speed: mapSpeed(st.temponivelmMeta),
      source: 'suprema' as const,
      externalId,
    });
  }

  return mapped;
}
