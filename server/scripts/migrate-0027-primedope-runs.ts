/**
 * Sprint F4 W0 Migration 0015 — primedope_runs (NOVA tabela)
 *
 * Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (Modelos de Dados D.3)
 * ADR-054: cache + audit trail.
 *
 * Schema:
 *   id varchar(21) PK (nanoid)
 *   user_id varchar FK users(user_platform_id) ON DELETE CASCADE
 *   profile_letter char(1) CHECK in (A,B,C)
 *   day_of_week integer CHECK 0..6
 *   multiplier integer CHECK in (1,4,12,52)
 *   input_hash char(64) NOT NULL  (sha256)
 *   input_json jsonb NOT NULL
 *   result_json jsonb NOT NULL
 *   histogram_path text
 *   random_runs_path text
 *   latency_ms integer
 *   source varchar(20) CHECK in ('primedope','cache','fallback-stale')
 *   pinned boolean DEFAULT false
 *   created_at timestamp DEFAULT NOW
 *   expires_at timestamp NULL
 *
 * Idempotente. Index composto + index input_hash.
 *
 * Uso:
 *   tsx server/scripts/migrate-0027-primedope-runs.ts
 *   F4_DRY_RUN=true tsx server/scripts/migrate-0027-primedope-runs.ts
 *
 * REVIEWER FIX (HIGH #3): script anterior chamava `tx.createTableIfNotExists`
 * etc. (helpers que nao existem). Reescrito com `db.execute(sql)` direto +
 * raw SQL idempotente. FK aponta para users.user_platform_id (HIGH #5).
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

export interface Migration0015Options {
  dryRun?: boolean;
}

export interface Migration0015Result {
  dryRun: boolean;
  tableCreated: boolean;
  indicesCreated: number;
}

async function tableExists(name: string): Promise<boolean> {
  const r: any = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = ${name}
    ) AS "exists"
  `);
  const rows: any[] = r.rows ?? r;
  const first = rows?.[0];
  if (!first) return false;
  return first.exists === true || first.exists === "t";
}

async function indexExists(name: string): Promise<boolean> {
  const r: any = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = ${name}
    ) AS "exists"
  `);
  const rows: any[] = r.rows ?? r;
  const first = rows?.[0];
  if (!first) return false;
  return first.exists === true || first.exists === "t";
}

export async function runMigration0015(
  opts: Migration0015Options = {},
): Promise<Migration0015Result> {
  const dryRun = opts.dryRun ?? process.env.F4_DRY_RUN === "true";

  const result: Migration0015Result = {
    dryRun,
    tableCreated: false,
    indicesCreated: 0,
  };

  if (dryRun) {
    console.info(
      "[migrate-0015] dryRun — would create primedope_runs table + indices.",
    );
    return result;
  }

  // -------------------------------------------------------------------------
  // 1. Tabela (idempotente via CREATE TABLE IF NOT EXISTS).
  //    HIGH #5: FK aponta para users.user_platform_id (padrao do projeto).
  // -------------------------------------------------------------------------
  const existedBefore = await tableExists("primedope_runs");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "primedope_runs" (
      "id" varchar(21) PRIMARY KEY NOT NULL,
      "user_id" varchar NOT NULL REFERENCES "users"("user_platform_id") ON DELETE CASCADE,
      "profile_letter" char(1) NOT NULL,
      "day_of_week" integer NOT NULL,
      "multiplier" integer NOT NULL,
      "input_hash" char(64) NOT NULL,
      "input_json" jsonb NOT NULL,
      "result_json" jsonb NOT NULL,
      "histogram_path" text,
      "random_runs_path" text,
      "latency_ms" integer,
      "source" varchar(20) NOT NULL,
      "pinned" boolean NOT NULL DEFAULT FALSE,
      "created_at" timestamp NOT NULL DEFAULT NOW(),
      "expires_at" timestamp
    )
  `);

  result.tableCreated = !existedBefore;

  // -------------------------------------------------------------------------
  // 2. CHECK constraints — DO $$ block para idempotencia
  // -------------------------------------------------------------------------
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'primedope_runs_profile_letter_check'
      ) THEN
        ALTER TABLE "primedope_runs"
          ADD CONSTRAINT "primedope_runs_profile_letter_check"
          CHECK ("profile_letter" IN ('A','B','C'));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'primedope_runs_day_of_week_check'
      ) THEN
        ALTER TABLE "primedope_runs"
          ADD CONSTRAINT "primedope_runs_day_of_week_check"
          CHECK ("day_of_week" BETWEEN 0 AND 6);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'primedope_runs_multiplier_check'
      ) THEN
        ALTER TABLE "primedope_runs"
          ADD CONSTRAINT "primedope_runs_multiplier_check"
          CHECK ("multiplier" IN (1,4,12,52));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'primedope_runs_source_check'
      ) THEN
        ALTER TABLE "primedope_runs"
          ADD CONSTRAINT "primedope_runs_source_check"
          CHECK ("source" IN ('primedope','cache','fallback-stale'));
      END IF;
    END$$;
  `);

  // -------------------------------------------------------------------------
  // 3. Indices (CREATE INDEX IF NOT EXISTS)
  // -------------------------------------------------------------------------
  const idx1Existed = await indexExists(
    "primedope_runs_user_profile_day_created_idx",
  );
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "primedope_runs_user_profile_day_created_idx"
      ON "primedope_runs" ("user_id", "profile_letter", "day_of_week", "created_at" DESC)
  `);
  if (!idx1Existed) result.indicesCreated++;

  const idx2Existed = await indexExists("primedope_runs_input_hash_idx");
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "primedope_runs_input_hash_idx"
      ON "primedope_runs" ("input_hash")
  `);
  if (!idx2Existed) result.indicesCreated++;

  return result;
}

if (
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module
) {
  runMigration0015()
    .then((r) => {
      console.info("[migrate-0015] done", r);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[migrate-0015] failed", err);
      process.exit(1);
    });
}
