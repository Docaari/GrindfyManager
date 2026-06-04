/**
 * Library Import — extract importable tournaments from grind-live sessions
 */

import { filterNewTournaments } from './library-dedup';
import { libraryCanonicalKey } from './library-canonical-key';

interface SessionTournament {
  id: string;
  sessionId: string;
  userId: string;
  name: string | null;
  site: string;
  buyIn: string;
  guaranteed: string | null;
  time: string | null;
  type: string | null;
  speed: string | null;
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

interface ImportableTournament {
  name: string;
  site: string;
  buyIn: string;
  guaranteed: string | null;
  time: string | null;
  type: string | null;
  speed: string | null;
  source: 'grind-live';
  externalId: null;
}

/**
 * Extracts importable tournaments from grind-live session tournaments.
 * - Maps relevant fields
 * - Deduplicates against existing library (active + trashed)
 * - Deduplicates internally (same tournament across sessions)
 * - Uses fallback name when name is null or empty
 */
export function extractImportableTournaments(
  sessionTournaments: SessionTournament[],
  existingLibrary: ExistingLibraryItem[]
): ImportableTournament[] {
  // Map session tournaments to importable format
  const mapped: ImportableTournament[] = sessionTournaments.map((st) => {
    const name = st.name && st.name.trim() !== ''
      ? st.name
      : `Torneio $${st.buyIn} ${st.site}`;

    return {
      name,
      site: st.site,
      buyIn: st.buyIn,
      guaranteed: st.guaranteed,
      time: st.time,
      type: st.type,
      speed: st.speed,
      source: 'grind-live' as const,
      externalId: null,
    };
  });

  // Internal deduplication (same tournament across sessions) — usa a MESMA key
  // canonica do resto do dedup (ADR-200 Parte A), nao a antiga (name|site|buyIn)
  // que ignorava time/type/snap e podia self-duplicar o batch.
  const seen = new Set<string>();
  const unique = mapped.filter((t) => {
    const key = libraryCanonicalKey(t);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Deduplicate against existing library
  return filterNewTournaments(unique, existingLibrary) as ImportableTournament[];
}
