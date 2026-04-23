/**
 * Library Suprema Sync — process Suprema API tournaments for library import
 */

import { detectAddonReaFromName } from './addon-rea-detector';

interface SupremaTournament {
  id: number;
  name: string;
  buyin: number;
  guaranteed: number;
  date: string; // "YYYY-MM-DD HH:mm:ss"
  isKO: number; // 0 = Vanilla, 1 = PKO
  temponivelmMeta: number;
  reentry?: boolean;
  maxReentries?: number;
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
  // Add-on + Re-entry (ADR-014)
  allowsAddOn: boolean;
  addOnCost: string | null;
  allowsReentry: boolean;
  maxReentries: number | null;
}

function mapSpeed(temponivelmMeta: number): string {
  if (temponivelmMeta <= 6) return 'Hyper';
  if (temponivelmMeta <= 10) return 'Turbo';
  return 'Normal';
}

function extractTime(dateStr: string): string {
  // ISO 8601 UTC (e.g. "2026-04-23T22:00:00.000Z") -> convert to America/Sao_Paulo
  if (dateStr.includes('T')) {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toLocaleTimeString('en-GB', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
  }
  // Legacy "YYYY-MM-DD HH:mm:ss" (no timezone info, keep as-is)
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

    // Add-on + Re-entry detection (ADR-014)
    const detected = detectAddonReaFromName(st.name);
    // Re-entry: API flag `reentry` takes precedence over name regex.
    // - If `reentry` is explicitly provided (true or false), use it.
    // - Otherwise, fall back to regex detection.
    const reentryField = (st as any).reentry;
    const allowsReentry = reentryField === undefined
      ? detected.allowsReentry
      : Boolean(reentryField);
    const maxRe = (st as any).maxReentries;
    const maxReentries: number | null =
      typeof maxRe === 'number' && !isNaN(maxRe) ? maxRe : null;

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
      allowsAddOn: detected.allowsAddOn,
      addOnCost: detected.allowsAddOn ? String(st.buyin) : null,
      allowsReentry,
      maxReentries,
    });
  }

  return mapped;
}
