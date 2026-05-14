/**
 * Backfill tournament_library a partir de planned_tournaments existentes que
 * nao tem libraryTemplateId. Dedup por (userId, name, site, buyIn, time)
 * contra active+trashed. Pode rodar varias vezes — idempotente.
 *
 * Uso: tsx --env-file=.env scripts/backfill-library-from-grade.ts
 */
import { nanoid } from "nanoid";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../server/db";
import { plannedTournaments, tournamentLibrary } from "@shared/schema";

async function main() {
  const planned = await db
    .select()
    .from(plannedTournaments)
    .where(isNull(plannedTournaments.libraryTemplateId));

  console.log(`planned sem libraryTemplateId: ${planned.length}`);

  let inserted = 0;
  let linkedExisting = 0;
  let skipped = 0;

  for (const p of planned) {
    if (!p.name || !p.site) {
      skipped++;
      continue;
    }
    const buyInStr = String(p.buyIn ?? "0");
    const timeStr = p.time ?? null;

    const matches = await db
      .select()
      .from(tournamentLibrary)
      .where(
        and(
          eq(tournamentLibrary.userId, p.userId),
          eq(tournamentLibrary.name, p.name),
          eq(tournamentLibrary.site, p.site),
          eq(tournamentLibrary.buyIn, buyInStr),
        ),
      );
    const exact = matches.find((row) => (row.time ?? null) === timeStr);

    if (exact) {
      if (!exact.deletedAt) {
        await db
          .update(plannedTournaments)
          .set({ libraryTemplateId: exact.id })
          .where(eq(plannedTournaments.id, p.id));
        linkedExisting++;
      } else {
        skipped++;
      }
      continue;
    }

    const templateId = nanoid();
    await db.insert(tournamentLibrary).values({
      id: templateId,
      userId: p.userId,
      name: p.name,
      site: p.site,
      buyIn: buyInStr,
      guaranteed: p.guaranteed != null ? String(p.guaranteed) : null,
      time: timeStr,
      type: p.type ?? null,
      speed: p.speed ?? null,
      source: "manual",
      dayOfWeek: typeof p.dayOfWeek === "number" ? p.dayOfWeek : null,
      currency: "USD",
      allowsAddOn: p.allowsAddOn ?? false,
      addOnCost: p.addOnCost != null ? String(p.addOnCost) : null,
      allowsReentry: p.allowsReentry ?? false,
      maxReentries: p.maxReentries ?? null,
      lateRegMinutes: p.lateRegMinutes ?? null,
      registrationTime: p.registrationTime ?? null,
    });
    await db
      .update(plannedTournaments)
      .set({ libraryTemplateId: templateId })
      .where(eq(plannedTournaments.id, p.id));
    inserted++;
  }

  console.log(`inserted=${inserted} linkedExisting=${linkedExisting} skipped=${skipped}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
