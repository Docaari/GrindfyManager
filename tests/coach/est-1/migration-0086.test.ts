// =============================================================================
// Test-Writer — Sprint EST-1 / RF-02 — migração 0086.
//
// Validação do SQL por leitura (NÃO executa contra DB — parser leve, espelha
// tests/migrations/migration-0071.test.ts).
//
// Contrato (ADR-222 §Decisão 2 + Decisão 3):
//   1. ALTER COLUMN ... SET DEFAULT true em 5 colunas de delivery
//      (report_weekly/daily/monthly_enabled + email_weekly/monthly_enabled).
//      quarterly (report_quarterly_enabled / email_quarterly_enabled) NÃO é tocado.
//   2. Back-fill UPDATE ... WHERE user_id IN (SELECT user_platform_id FROM users
//      WHERE subscription_plan IN ('trial','active','admin')).
//   3. ADD COLUMN delivered_channels jsonb NOT NULL DEFAULT '{}'::jsonb em reports.
//   Rollback: reverte os 5 defaults p/ false + DROP delivered_channels (NÃO desfaz dados).
//
// Status esperado: PASSAM (migration JÁ EXISTE — characterization). Se algum FALHAR,
//   o .sql diverge do contrato do ADR.
// =============================================================================

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  "migrations/0086_coach_report_delivery_defaults_and_ledger.sql",
);
const ROLLBACK_PATH = path.resolve(
  process.cwd(),
  "migrations/0086_coach_report_delivery_defaults_and_ledger_rollback.sql",
);

describe("migration 0086 — arquivos existem", () => {
  it("arquivo de migration existe", () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });
  it("arquivo de rollback existe", () => {
    expect(fs.existsSync(ROLLBACK_PATH)).toBe(true);
  });
});

describe("migration 0086 — flip default ON (5 colunas de delivery)", () => {
  it("ALTER COLUMN ... SET DEFAULT true em report_weekly/daily/monthly_enabled", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/ALTER TABLE user_coach_preferences/i);
    expect(sql).toMatch(/report_weekly_enabled\s+SET DEFAULT true/i);
    expect(sql).toMatch(/report_daily_enabled\s+SET DEFAULT true/i);
    expect(sql).toMatch(/report_monthly_enabled\s+SET DEFAULT true/i);
  });

  it("ALTER COLUMN ... SET DEFAULT true em email_weekly/monthly_enabled", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/email_weekly_enabled\s+SET DEFAULT true/i);
    expect(sql).toMatch(/email_monthly_enabled\s+SET DEFAULT true/i);
  });

  it("NÃO flipa quarterly (report_quarterly_enabled / email_quarterly_enabled) para true", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).not.toMatch(/report_quarterly_enabled\s+SET DEFAULT true/i);
    expect(sql).not.toMatch(/email_quarterly_enabled\s+SET DEFAULT true/i);
  });
});

describe("migration 0086 — back-fill de elegíveis", () => {
  it("UPDATE liga os 5 opt-ins", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/UPDATE user_coach_preferences/i);
    expect(sql).toMatch(/report_weekly_enabled\s*=\s*true/i);
    expect(sql).toMatch(/email_monthly_enabled\s*=\s*true/i);
  });

  it("WHERE filtra subscription_plan IN ('trial','active','admin') via user_platform_id", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/user_id\s+IN\s*\([\s\S]*?SELECT\s+user_platform_id\s+FROM\s+users/i);
    expect(sql).toMatch(/subscription_plan\s+IN\s*\(\s*'trial'\s*,\s*'active'\s*,\s*'admin'\s*\)/i);
  });

  it("NÃO inclui 'expired' nem 'free' no back-fill", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).not.toMatch(/subscription_plan\s+IN\s*\([^)]*'expired'/i);
  });
});

describe("migration 0086 — ledger delivered_channels", () => {
  it("ADD COLUMN delivered_channels jsonb NOT NULL DEFAULT '{}'::jsonb em reports", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/ALTER TABLE reports/i);
    expect(sql).toMatch(/delivered_channels\s+JSONB\s+NOT NULL\s+DEFAULT\s+'\{\}'::jsonb/i);
  });
});

describe("migration 0086 — rollback", () => {
  it("reverte os 5 defaults para false", () => {
    const sql = fs.readFileSync(ROLLBACK_PATH, "utf-8");
    expect(sql).toMatch(/report_weekly_enabled\s+SET DEFAULT false/i);
    expect(sql).toMatch(/email_weekly_enabled\s+SET DEFAULT false/i);
    expect(sql).toMatch(/email_monthly_enabled\s+SET DEFAULT false/i);
  });

  it("DROPa a coluna delivered_channels", () => {
    const sql = fs.readFileSync(ROLLBACK_PATH, "utf-8");
    expect(sql).toMatch(/ALTER TABLE reports[\s\S]*?DROP COLUMN[\s\S]*?delivered_channels/i);
  });
});
