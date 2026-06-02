/**
 * Backfill de speed (Hyper) + type (Satellite) em tournaments.
 *
 * Sprint torneios-library-grouping. A Biblioteca de Torneios ja corrige a
 * EXIBICAO read-side (libraryGrouping re-deriva do nome), entao este script e
 * OPCIONAL — serve para PERSISTIR a correcao no DB de modo que o dashboard /
 * analytics / filtros que consultam a coluna gravada (tournaments.speed /
 * tournaments.type|category) tambem reflitam:
 *   - Hyper sub-detectado: imports antigos so viravam Hyper com "SUPER TURBO".
 *     Agora classifySpeed cobre Hyper/Hyper-Turbo/Hyperturbo/Ultra-Turbo/3-Speed.
 *   - Satellites caidos em Vanilla: regex ampliada (Mega/Sats/Seats/Sat...).
 *
 * SEGURANCA: dry-run por padrao (so imprime o que mudaria). Passe --apply para
 * gravar. Idempotente: re-rodar nao tem efeito (UPDATE so quando muda).
 *
 * Run (dry):   npx tsx --env-file=.env scripts/backfill-speed-type-2026-06-02.ts
 * Run (apply): npx tsx --env-file=.env scripts/backfill-speed-type-2026-06-02.ts --apply
 */

import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { tournaments } from "../shared/schema";
import { enrichTournamentTypeFields } from "../shared/tournament-type-detector";
import { classifySpeed, fastestSpeed } from "../shared/speed-detector";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL nao definida");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzlePg(pool) as any;

  const rows: Array<{
    id: string;
    name: string | null;
    type: string | null;
    category: string | null;
    speed: string | null;
  }> = await db.select().from(tournaments);

  console.log(`tournaments: ${rows.length} rows · modo=${APPLY ? "APPLY" : "DRY-RUN"}`);

  let speedChanged = 0;
  let typeChanged = 0;
  let updates = 0;

  for (const row of rows) {
    const setPayload: any = {};

    // Paridade com o read-side (libraryGrouping.normalizeSpeed): fastestSpeed
    // entre gravado e derivado-do-nome (nunca rebaixa).
    const newSpeed = fastestSpeed(row.speed ?? "", classifySpeed(row.name ?? ""));
    if (newSpeed !== (row.speed ?? "").trim()) {
      setPayload.speed = newSpeed;
      speedChanged++;
    }

    // Paridade com o read-side (libraryGrouping.typePrimary): type primeiro.
    const enriched = enrichTournamentTypeFields({
      name: row.name ?? "",
      category: row.type ?? row.category ?? "",
    });
    if (row.type !== enriched.type) {
      setPayload.type = enriched.type;
      setPayload.category = enriched.type;
      typeChanged++;
    }

    if (Object.keys(setPayload).length === 0) continue;
    updates++;
    if (!APPLY) {
      console.log(
        `  [${row.id}] "${(row.name ?? "").slice(0, 50)}" ${JSON.stringify(setPayload)}`,
      );
      continue;
    }
    await db.update(tournaments).set(setPayload).where(eq(tournaments.id, row.id));
  }

  console.log(
    `${APPLY ? "aplicado" : "dry-run"}: ${updates} rows (${speedChanged} speed, ${typeChanged} type)`,
  );
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
