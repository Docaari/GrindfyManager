/**
 * Add-on + Re-entry name detector (ADR-014).
 *
 * Single convergence point for regex-based detection of Plus/ReA tournaments
 * from the tournament name. Used by:
 *   - server/csvParser.ts (CSV import)
 *   - shared/library-suprema-sync.ts (Suprema API integration)
 *   - server/scripts/backfill-addon-rea.ts (batch backfill)
 *
 * Keeping the logic in one place guarantees consistency across all sources.
 */

// Plus: word-boundary match; includes "+ add-on" / "+ addon" alternative pattern.
// Lookbehind/ahead prevent matches inside other words (ExpressPLUS, Surplus, PLUSone).
const PLUS_REGEX = /(?<![A-Za-z])plus(?![A-Za-z])|\+\s*add[- ]?on/i;

// ReA: variants "Re-Entry", "Re Entry", "Reentry", "Re-Entries", "ReA", "R/A".
// Case-insensitive; word boundaries prevent matches inside "Really", "Reality", "Area".
const REA_REGEX = /(?<![A-Za-z])(re[- ]?entry|re[- ]?entries|rea|r\/a|reentry)(?![A-Za-z])/i;

// Extra blocklist to kill false positives that slip through regex
// (defensive; should be empty if PLUS_REGEX is tight enough).
const PLUS_BLOCKLIST = /(ExpressPLUS|SurPlus|Surplus|APlus|PLUSone)/i;
const REA_BLOCKLIST = /(Really|Reality|Area)/i;

export interface DetectedFlags {
  allowsAddOn: boolean;
  allowsReentry: boolean;
}

/**
 * Detect Add-on (Plus) and Re-entry (ReA) flags from a tournament name.
 * Returns { allowsAddOn: false, allowsReentry: false } for empty/invalid names.
 */
export function detectAddonReaFromName(name: string | null | undefined): DetectedFlags {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return { allowsAddOn: false, allowsReentry: false };
  }

  let allowsAddOn = PLUS_REGEX.test(name);
  if (allowsAddOn && PLUS_BLOCKLIST.test(name)) {
    allowsAddOn = false;
  }

  let allowsReentry = REA_REGEX.test(name);
  if (allowsReentry && REA_BLOCKLIST.test(name)) {
    allowsReentry = false;
  }

  return { allowsAddOn, allowsReentry };
}

/**
 * Idempotency helper for the backfill script.
 *
 * Decision: backfill only flips `false -> true` (never the reverse). After
 * `db:push`, all existing rows carry the column default `false`, so this
 * function treats anything that isn't already `true` as eligible for update
 * when the name matches. A second run is idempotent because detection on
 * an already-`true` row still yields `true` (no net change).
 *
 * Trade-off (documented in Spec 1 §4.2): a user who explicitly un-ticks the
 * flag on a tournament whose name still matches the regex will see the flag
 * re-enabled if the backfill is re-run. In practice the backfill runs once,
 * post-deploy, and the Spec does not require preservation of explicit
 * false values.
 *
 * - shouldUpdateAddOn: true iff detection matches AND the field is NOT already true.
 * - shouldUpdateReentry: same for ReA.
 */
export function shouldBackfillRecord(existing: {
  allowsAddOn?: boolean | null;
  allowsReentry?: boolean | null;
  name: string;
}): { shouldUpdateAddOn: boolean; shouldUpdateReentry: boolean } {
  const detected = detectAddonReaFromName(existing.name);
  const shouldUpdateAddOn = detected.allowsAddOn && existing.allowsAddOn !== true;
  const shouldUpdateReentry = detected.allowsReentry && existing.allowsReentry !== true;
  return { shouldUpdateAddOn, shouldUpdateReentry };
}
