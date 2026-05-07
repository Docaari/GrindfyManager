/**
 * Backfill type/isFlight/allowsAddOn/satellite em tournaments + planned_tournaments.
 *
 * Sprint 2026-05-07 audit — corrige rows herdadas onde:
 *   1. type='Vanilla' mas category!='Vanilla' (parser CSV antigo nao espelhava
 *      type<->category por causa do bug em createTournamentsBatch).
 *   2. type='Vanilla' e category='Vanilla' mas o nome bate Satellite/Plus
 *      (parser nao detectava Satellite ate 2026-05-07; Add-on so a partir
 *      de 2026-05-06).
 *
 * Idempotente: roda multiplas vezes sem efeito colateral (UPDATE so quando
 * resultado real muda).
 *
 * Reversibilidade: log SQL impressao no console pra rodar UPDATE inverso
 * caso necessario.
 *
 * Run: npx tsx --env-file=.env scripts/backfill-tournament-types-2026-05-07.ts
 */

import { Pool } from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { tournaments, plannedTournaments } from '../shared/schema';
import { enrichTournamentTypeFields } from '../shared/tournament-type-detector';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL nao definida');
  process.exit(1);
}

async function getDb() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  return drizzlePg(pool) as any;
}

interface BackfillRow {
  id: string;
  name: string | null;
  type: string | null;
  category: string | null;
  isFlight?: boolean | null;
  allowsAddOn?: boolean | null;
  addOnCost?: string | null;
  buyIn?: string | null;
}

async function backfillTable(
  db: any,
  table: typeof tournaments | typeof plannedTournaments,
  label: string,
) {
  const rows: BackfillRow[] = await db.select().from(table);
  console.log(`${label}: ${rows.length} rows`);

  let updates = 0;
  let typeChanged = 0;
  let flightChanged = 0;
  let addOnChanged = 0;

  for (const row of rows) {
    const enriched = enrichTournamentTypeFields({
      name: row.name ?? '',
      category: row.category ?? row.type ?? '',
    });

    const setPayload: any = {};

    if (row.type !== enriched.type) {
      setPayload.type = enriched.type;
      setPayload.category = enriched.type;
      typeChanged++;
    } else if (row.category !== row.type) {
      // Paridade type<->category mesmo sem mudanca de tipo
      setPayload.category = row.type;
    }

    // Apenas atualiza isFlight se row tinha false explicito e enriched.isFlight=true
    if (row.isFlight === false && enriched.isFlight === true) {
      setPayload.isFlight = true;
      flightChanged++;
    }

    // Coerencia: row com type mudando para Add-on (ou ja Add-on com allowsAddOn=false)
    // recebe allowsAddOn=true + addOnCost=buyIn (se buyIn presente)
    if (enriched.allowsAddOn && row.allowsAddOn === false) {
      setPayload.allowsAddOn = true;
      if (!row.addOnCost && row.buyIn) {
        setPayload.addOnCost = String(row.buyIn);
      }
      addOnChanged++;
    }

    if (Object.keys(setPayload).length === 0) continue;

    await db.update(table).set(setPayload).where(eq((table as any).id, row.id));
    updates++;
  }

  console.log(
    `${label}: ${updates} updates (${typeChanged} type changes, ${flightChanged} isFlight=true, ${addOnChanged} allowsAddOn=true)`,
  );
}

async function main() {
  const db = await getDb();
  await backfillTable(db, tournaments as any, 'tournaments');
  await backfillTable(db, plannedTournaments as any, 'planned_tournaments');
  console.log('done');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
