/**
 * Backfill starting_stack_bb + deep_stack em tournaments a partir do NOME ja
 * salvo (nao precisa re-import — diferente da duracao, que so vem em novo
 * upload). Sprint library-evolution Fase 3.
 *
 * Idempotente: so atualiza quando o resultado muda (deepStack passa a true OU
 * startingStackBb sai de null). Nunca derruba deep_stack ja true.
 *
 * Requer Migration 0081 aplicada (colunas duration/stack/etc).
 *
 * Run: npx tsx --env-file=.env scripts/backfill-stack-depth-2026-05-29.ts
 */

import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { eq, and, isNull, sql } from "drizzle-orm";
import { tournaments } from "../shared/schema";
import { detectStackDepthFromName } from "../shared/tournament-type-detector";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL nao definida");
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzlePg(pool) as any;

  console.log("[backfill-stack-depth] carregando torneios...");
  const rows: Array<{ id: string; name: string | null; deepStack: boolean | null; startingStackBb: number | null }> =
    await db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        deepStack: tournaments.deepStack,
        startingStackBb: tournaments.startingStackBb,
      })
      .from(tournaments);

  console.log(`[backfill-stack-depth] ${rows.length} torneios. Calculando...`);

  let updated = 0;
  for (const r of rows) {
    const { startingStackBb, deepStack } = detectStackDepthFromName(r.name);
    // So atualiza se muda algo (deepStack vira true ou stack sai de null).
    const stackChanges = startingStackBb != null && r.startingStackBb == null;
    const deepChanges = deepStack && !r.deepStack;
    if (!stackChanges && !deepChanges) continue;

    await db
      .update(tournaments)
      .set({
        startingStackBb: sql`COALESCE(${tournaments.startingStackBb}, ${startingStackBb ?? null})`,
        deepStack: sql`(${tournaments.deepStack} OR ${deepStack})`,
      })
      .where(eq(tournaments.id, r.id));
    updated++;
  }

  console.log(`[backfill-stack-depth] concluido. ${updated} linhas atualizadas.`);
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill-stack-depth] falhou:", err);
  process.exit(1);
});
