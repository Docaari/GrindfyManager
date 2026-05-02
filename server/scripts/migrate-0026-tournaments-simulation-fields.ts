/**
 * Sprint F4 W0 Migration 0014 — tournaments simulation fields
 *
 * Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (Modelos de Dados D.2)
 * ADR-054: PrimeDope external provider
 *
 * Adiciona 3 colunas em `tournaments` para alimentar PrimeDope simulation:
 *   - players_avg integer NULL CHECK 10..50000
 *   - places_paid_avg integer NULL CHECK 1..10000
 *   - rake_pct decimal(5,2) NULL CHECK 0..30
 *
 * Backfill cascade:
 *   1. tournament_templates.avgFieldSize (>= 10)
 *   2. tournaments.fieldSize (>= 10)
 *   3. constant 1000
 *   places_paid_avg = ROUND(players_avg * 0.15)
 *   rake_pct heuristica per network (NETWORK_DEFAULTS_RAKE).
 *
 * Idempotente (IF NOT EXISTS + skip rows ja preenchidas).
 *
 * Uso:
 *   tsx server/scripts/migrate-0026-tournaments-simulation-fields.ts
 *   F4_DRY_RUN=true tsx server/scripts/migrate-0026-tournaments-simulation-fields.ts
 *
 * REVIEWER FIX (HIGH #3): script anterior chamava metodos `tx.*` que nao
 * existem no txWrapper de storage.ts. Reescrito usando db.execute(sql) +
 * raw SQL com IF NOT EXISTS para idempotencia. Tests atualizados para
 * mockar `db.execute` em vez de inventar API ficticia.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import { NETWORK_DEFAULTS_RAKE } from "../../shared/primedopeDefaults";

export interface Migration0014Options {
  dryRun?: boolean;
}

export interface Migration0014Result {
  dryRun: boolean;
  columnsAdded: number;
  playersAvgFromTemplate: number;
  playersAvgFromFieldSize: number;
  playersAvgFromDefault: number;
  placesPaidAvgUpdated: number;
  rakePctUpdated: number;
}

/**
 * Helper: lê `count` (ou rowCount) do retorno do db.execute.
 * Drizzle retorna objeto com formato variavel entre drivers (pg, neon).
 */
function rowsAffected(result: any): number {
  if (!result) return 0;
  if (typeof result.rowCount === "number") return result.rowCount;
  if (typeof result.count === "number") return result.count;
  if (Array.isArray(result.rows)) return result.rows.length;
  if (Array.isArray(result)) return result.length;
  return 0;
}

export async function runMigration0014(
  opts: Migration0014Options = {},
): Promise<Migration0014Result> {
  const dryRun = opts.dryRun ?? process.env.F4_DRY_RUN === "true";

  const result: Migration0014Result = {
    dryRun,
    columnsAdded: 0,
    playersAvgFromTemplate: 0,
    playersAvgFromFieldSize: 0,
    playersAvgFromDefault: 0,
    placesPaidAvgUpdated: 0,
    rakePctUpdated: 0,
  };

  if (dryRun) {
    console.info(
      "[migrate-0014] dryRun — would add columns players_avg, places_paid_avg, rake_pct + backfill cascade.",
    );
    return result;
  }

  // -------------------------------------------------------------------------
  // 1. Schema delta — ADD COLUMN IF NOT EXISTS + CHECK constraints
  // -------------------------------------------------------------------------
  await db.execute(sql`
    ALTER TABLE "tournaments"
      ADD COLUMN IF NOT EXISTS "players_avg" integer
  `);
  await db.execute(sql`
    ALTER TABLE "tournaments"
      ADD COLUMN IF NOT EXISTS "places_paid_avg" integer
  `);
  await db.execute(sql`
    ALTER TABLE "tournaments"
      ADD COLUMN IF NOT EXISTS "rake_pct" decimal(5,2)
  `);

  // CHECK constraints sao adicionados em DO $$ block para idempotencia
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tournaments_players_avg_check'
      ) THEN
        ALTER TABLE "tournaments"
          ADD CONSTRAINT "tournaments_players_avg_check"
          CHECK ("players_avg" IS NULL OR ("players_avg" BETWEEN 10 AND 50000));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tournaments_places_paid_avg_check'
      ) THEN
        ALTER TABLE "tournaments"
          ADD CONSTRAINT "tournaments_places_paid_avg_check"
          CHECK ("places_paid_avg" IS NULL OR ("places_paid_avg" BETWEEN 1 AND 10000));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tournaments_rake_pct_check'
      ) THEN
        ALTER TABLE "tournaments"
          ADD CONSTRAINT "tournaments_rake_pct_check"
          CHECK ("rake_pct" IS NULL OR ("rake_pct" BETWEEN 0 AND 30));
      END IF;
    END$$;
  `);

  result.columnsAdded = 3;

  // -------------------------------------------------------------------------
  // 2. Backfill cascade — players_avg
  //    Priority 1: tournament_templates.avg_field_size (>= 10)
  // -------------------------------------------------------------------------
  const r1 = await db.execute(sql`
    UPDATE "tournaments" t
    SET "players_avg" = tt.avg_field_size
    FROM "tournament_templates" tt
    WHERE t.template_id = tt.id
      AND t."players_avg" IS NULL
      AND tt.avg_field_size IS NOT NULL
      AND tt.avg_field_size >= 10
      AND tt.avg_field_size <= 50000
  `);
  result.playersAvgFromTemplate = rowsAffected(r1);

  // Priority 2: tournaments.field_size (>= 10)
  const r2 = await db.execute(sql`
    UPDATE "tournaments"
    SET "players_avg" = "field_size"
    WHERE "players_avg" IS NULL
      AND "field_size" IS NOT NULL
      AND "field_size" >= 10
      AND "field_size" <= 50000
  `);
  result.playersAvgFromFieldSize = rowsAffected(r2);

  // Priority 3: constant 1000
  const r3 = await db.execute(sql`
    UPDATE "tournaments"
    SET "players_avg" = 1000
    WHERE "players_avg" IS NULL
  `);
  result.playersAvgFromDefault = rowsAffected(r3);

  // -------------------------------------------------------------------------
  // 3. places_paid_avg = ROUND(players_avg * 0.15)
  // -------------------------------------------------------------------------
  const r4 = await db.execute(sql`
    UPDATE "tournaments"
    SET "places_paid_avg" = GREATEST(1, LEAST(10000, ROUND("players_avg" * 0.15)::integer))
    WHERE "places_paid_avg" IS NULL
      AND "players_avg" IS NOT NULL
  `);
  result.placesPaidAvgUpdated = rowsAffected(r4);

  // -------------------------------------------------------------------------
  // 4. rake_pct via NETWORK_DEFAULTS_RAKE (per-site CASE) + fallback 8
  // -------------------------------------------------------------------------
  const caseClauses = Object.entries(NETWORK_DEFAULTS_RAKE)
    .map(
      ([site, pct]) =>
        `WHEN LOWER(site) = LOWER('${site.replace(/'/g, "''")}') THEN ${pct}`,
    )
    .join("\n        ");

  const r5 = await db.execute(
    sql.raw(`
      UPDATE "tournaments"
      SET "rake_pct" = CASE
          ${caseClauses}
          ELSE 8
        END
      WHERE "rake_pct" IS NULL
    `),
  );
  result.rakePctUpdated = rowsAffected(r5);

  return result;
}

if (
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module
) {
  runMigration0014()
    .then((r) => {
      console.info("[migrate-0014] done", r);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[migrate-0014] failed", err);
      process.exit(1);
    });
}
