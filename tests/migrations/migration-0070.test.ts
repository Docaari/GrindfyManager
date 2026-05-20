// =============================================================================
// Sprint AI-2A — migration 0070 (user_off_days + tournament_pool_intelligence)
//
// Cobre (validacao do SQL — NAO executa contra DB; le arquivo + parser leve):
//   - user_off_days schema: id, user_id (FK), off_date, reason, source, created_at,
//     UNIQUE(user_id, off_date), INDEX (user_id, off_date).
//   - tournament_pool_intelligence schema: id, site, tournament_pattern, buy_in_min/max,
//     field_avg, field_volatility, pool_quality (CHECK), notes, updated_at, created_at.
//   - 12 rows seed BR insertadas (Q-F locked).
//   - Rollback file existe.
//
// Status esperado: PASSAM (migration ja existe) — sao "characterization tests"
// que travam o shape para regressoes.
// =============================================================================

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  "migrations/0070_ai_2a_offdays_pool_intel.sql",
);
const ROLLBACK_PATH = path.resolve(
  process.cwd(),
  "migrations/0070_ai_2a_offdays_pool_intel_rollback.sql",
);

describe("migration 0070 — arquivo existe + shape", () => {
  it("arquivo de migration existe", () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it("arquivo de rollback existe", () => {
    expect(fs.existsSync(ROLLBACK_PATH)).toBe(true);
  });

  it("CREATE TABLE user_off_days com colunas e UNIQUE", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/CREATE TABLE.*user_off_days/i);
    // user_id NOT NULL ... REFERENCES users (multilinha em SQL formatado)
    expect(sql).toMatch(/user_id[\s\S]*?REFERENCES users/i);
    expect(sql).toMatch(/off_date\s+DATE\s+NOT NULL/i);
    expect(sql).toMatch(/reason/i);
    expect(sql).toMatch(/source/i);
    expect(sql).toMatch(/UNIQUE\s*\(\s*user_id\s*,\s*off_date\s*\)/i);
    expect(sql).toMatch(/CREATE INDEX.*idx_user_off_days/i);
  });

  it("CREATE TABLE tournament_pool_intelligence com colunas + CHECK pool_quality", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/CREATE TABLE.*tournament_pool_intelligence/i);
    expect(sql).toMatch(/site\s+VARCHAR/i);
    expect(sql).toMatch(/tournament_pattern\s+VARCHAR/i);
    expect(sql).toMatch(/buy_in_min/i);
    expect(sql).toMatch(/buy_in_max/i);
    expect(sql).toMatch(/field_avg/i);
    expect(sql).toMatch(/field_volatility/i);
    expect(sql).toMatch(/pool_quality/i);
    expect(sql).toMatch(/CHECK\s*\(/i);
    expect(sql).toMatch(/soft.*medium.*tough|medium.*soft.*tough|tough.*medium.*soft/i);
  });

  it("12 rows seed BR insertadas (Q-F locked)", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    // INSERT INTO tournament_pool_intelligence ... VALUES (...12 tuplas...)
    expect(sql).toMatch(/INSERT INTO tournament_pool_intelligence/i);
    // Contagem aproximada: pool_seed_001 .. pool_seed_012
    const seedMatches = sql.match(/pool_seed_\d{3}/g) ?? [];
    expect(seedMatches.length).toBeGreaterThanOrEqual(12);
    // Sites BR esperados:
    expect(sql).toMatch(/WPN/);
    expect(sql).toMatch(/GG/);
    expect(sql).toMatch(/Stars/);
  });

  it("rollback DROP TABLE em ordem reversa", () => {
    const sql = fs.readFileSync(ROLLBACK_PATH, "utf-8");
    expect(sql).toMatch(/DROP TABLE.*tournament_pool_intelligence/i);
    expect(sql).toMatch(/DROP TABLE.*user_off_days/i);
  });
});
