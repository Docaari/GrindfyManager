/**
 * Library Dedup — deduplication functions for tournament library imports.
 *
 * Sprint biblioteca-administrar-dedup / Fatia 1 / RF-03 (ADR-200 Parte A):
 * a dedup por campos passa a usar a key canonica `libraryCanonicalKey`
 * (snap de buy-in, type na key, timeBin de `time`, dayOfWeek na key) em vez de
 * `(name.toLowerCase, site, buyIn)` exatos — que IGNORAVA `time`. O curto-circuito
 * por `externalId` (Suprema) e preservado.
 */

import { libraryCanonicalKey, type CanonicalKeyEntry } from "./library-canonical-key";

interface IncomingTournament extends CanonicalKeyEntry {
  name: string;
  site: string;
  buyIn: string;
  externalId: string | null;
  [key: string]: any;
}

interface ExistingLibraryItem extends CanonicalKeyEntry {
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
 * Checks if an incoming tournament is a duplicate by canonical key
 * (site, dayOfWeek, timeBin, canonicalBuyIn, typePrimary).
 * Checks against both active and trashed items (D5 — nao re-importa trashed).
 */
export function isDuplicateByFields(
  incoming: IncomingTournament,
  existing: ExistingLibraryItem[]
): boolean {
  const incomingKey = libraryCanonicalKey(incoming);
  return existing.some((item) => libraryCanonicalKey(item) === incomingKey);
}

/**
 * Filters an array of incoming tournaments, removing any that already exist.
 * Uses externalId match first (for suprema imports), then falls back to the
 * canonical key match (for manual/grind-live).
 */
export function filterNewTournaments(
  incoming: IncomingTournament[],
  existing: ExistingLibraryItem[]
): IncomingTournament[] {
  // Logica inlinada de proposito (nao chama isDuplicateBy* no loop) p/ pre-computar
  // os Sets UMA vez. isDuplicateByExternalId/isDuplicateByFields seguem exportadas
  // como API de checagem pontual (Fatia 3/5 + testes).
  // Pre-computa as chaves dos existentes UMA vez (evita O(incoming x existing)
  // recomputando libraryCanonicalKey de cada existente a cada incoming).
  const existingExternalIds = new Set(
    existing
      .map((i) => i.externalId)
      .filter((x): x is string => x != null),
  );
  const existingCanonicalKeys = new Set(
    existing.map((i) => libraryCanonicalKey(i)),
  );
  return incoming.filter((item) => {
    if (item.externalId != null && existingExternalIds.has(item.externalId)) {
      return false;
    }
    if (existingCanonicalKeys.has(libraryCanonicalKey(item))) {
      return false;
    }
    return true;
  });
}
