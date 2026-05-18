/**
 * Backfill tournament_library a partir de planned_tournaments existentes que
 * nao tem libraryTemplateId. Idempotente — pode rodar varias vezes. Delega ao
 * helper compartilhado (mesma regra do auto-populate de runtime).
 *
 * Uso: tsx --env-file=.env scripts/backfill-library-from-grade.ts
 */
import { isNull } from "drizzle-orm";
import { db } from "../server/db";
import { plannedTournaments } from "@shared/schema";
import { ensureLibraryEntryForPlanned } from "../server/services/libraryAutoPopulate";

async function main() {
  const planned = await db
    .select()
    .from(plannedTournaments)
    .where(isNull(plannedTournaments.libraryTemplateId));

  console.log(`planned sem libraryTemplateId: ${planned.length}`);

  let processed = 0;
  let skipped = 0;

  for (const p of planned) {
    const templateId = await ensureLibraryEntryForPlanned(p as any);
    if (templateId) processed++;
    else skipped++;
  }

  console.log(`linkados/criados=${processed} skipped=${skipped}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
