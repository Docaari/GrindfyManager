/**
 * Backfill script for Add-on + Re-entry flags (ADR-014 / Spec 1 §4.2).
 *
 * Populates the newly-added `allows_addon`, `addon_cost`, `allows_reentry`
 * and `max_reentries` columns in 4 tables based on regex detection from the
 * tournament name.
 *
 * Idempotent: rerunning does not overwrite explicit true/false values
 * already set in previous runs (only touches undefined/null).
 *
 * Usage:
 *   npx tsx server/scripts/backfill-addon-rea.ts            # live run
 *   npx tsx server/scripts/backfill-addon-rea.ts --audit    # dry run (report only)
 */

import { sql } from 'drizzle-orm';
import { db } from '../db';
import {
  tournaments,
  tournamentLibrary,
  plannedTournaments,
  sessionTournaments,
} from '@shared/schema';
import { detectAddonReaFromName, shouldBackfillRecord } from '../../shared/addon-rea-detector';

type TableWithName = 'tournaments' | 'tournament_library' | 'planned_tournaments' | 'session_tournaments';

interface BackfillReport {
  table: TableWithName;
  scanned: number;
  addonUpdated: number;
  reentryUpdated: number;
  skipped: number;
}

const AUDIT = process.argv.includes('--audit');

async function backfillTable<TRow extends { id: string; name: string | null; allowsAddOn?: boolean | null; allowsReentry?: boolean | null; buyIn?: string; addOnCost?: string | null }>(
  table: TableWithName,
  rows: TRow[],
  applyUpdate: (id: string, patch: Record<string, any>) => Promise<void>
): Promise<BackfillReport> {
  const report: BackfillReport = {
    table,
    scanned: rows.length,
    addonUpdated: 0,
    reentryUpdated: 0,
    skipped: 0,
  };

  for (const row of rows) {
    const name = row.name ?? '';
    if (!name.trim()) {
      report.skipped += 1;
      continue;
    }
    const { shouldUpdateAddOn, shouldUpdateReentry } = shouldBackfillRecord({
      name,
      allowsAddOn: row.allowsAddOn === null ? undefined : row.allowsAddOn,
      allowsReentry: row.allowsReentry === null ? undefined : row.allowsReentry,
    });

    const patch: Record<string, any> = {};
    if (shouldUpdateAddOn) {
      patch.allowsAddOn = true;
      // default addOnCost = buyIn when detected and previously null
      if ((row.addOnCost == null || row.addOnCost === '') && row.buyIn) {
        patch.addOnCost = String(row.buyIn);
      }
      report.addonUpdated += 1;
    }
    if (shouldUpdateReentry) {
      patch.allowsReentry = true;
      report.reentryUpdated += 1;
    }

    if (Object.keys(patch).length === 0) {
      report.skipped += 1;
      continue;
    }

    if (!AUDIT) {
      await applyUpdate(row.id, patch);
    }
  }

  return report;
}

async function main() {
  console.log(`[backfill-addon-rea] mode=${AUDIT ? 'AUDIT (dry-run)' : 'LIVE'}`);

  // 1. tournaments
  const tournamentsRows: any[] = await db.select().from(tournaments);
  const r1 = await backfillTable<any>('tournaments', tournamentsRows, async (id, patch) => {
    await db.update(tournaments).set(patch).where(sql`${tournaments.id} = ${id}`);
  });

  // 2. tournament_library
  const libraryRows: any[] = await db.select().from(tournamentLibrary);
  const r2 = await backfillTable<any>('tournament_library', libraryRows, async (id, patch) => {
    await db.update(tournamentLibrary).set(patch).where(sql`${tournamentLibrary.id} = ${id}`);
  });

  // 3. planned_tournaments
  const plannedRows: any[] = await db.select().from(plannedTournaments);
  const r3 = await backfillTable<any>('planned_tournaments', plannedRows, async (id, patch) => {
    await db.update(plannedTournaments).set(patch).where(sql`${plannedTournaments.id} = ${id}`);
  });

  // 4. session_tournaments
  const sessionRows: any[] = await db.select().from(sessionTournaments);
  const r4 = await backfillTable<any>('session_tournaments', sessionRows, async (id, patch) => {
    await db.update(sessionTournaments).set(patch).where(sql`${sessionTournaments.id} = ${id}`);
  });

  for (const r of [r1, r2, r3, r4]) {
    console.log(
      `[backfill-addon-rea] ${r.table.padEnd(22)} scanned=${r.scanned} addon+=${r.addonUpdated} reentry+=${r.reentryUpdated} skipped=${r.skipped}`
    );
  }

  console.log('[backfill-addon-rea] done');
  process.exit(0);
}

main().catch((err) => {
  console.error('[backfill-addon-rea] fatal', err);
  process.exit(1);
});
