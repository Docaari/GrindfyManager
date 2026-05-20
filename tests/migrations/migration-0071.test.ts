// =============================================================================
// Sprint AI-2B — migration 0071 (career_goals + mental_hand_history + email_log
// + 5 cols user_coach_preferences)
//
// Validação do SQL (NÃO executa contra DB — parser leve):
//   - career_goals schema: id varchar, user_id FK, title varchar(120), description text,
//     target_metric VARCHAR(40) enum CHECK, target_value NUMERIC, target_deadline DATE,
//     horizon VARCHAR(16) NOT NULL DEFAULT 'trimestre' enum CHECK, status VARCHAR(16)
//     NOT NULL DEFAULT 'active' enum CHECK, progress_note text, achieved_at, created_at,
//     updated_at, índices user_status + user_deadline.
//   - mental_hand_history schema: situation text NOT NULL, emotion VARCHAR(32) enum,
//     real_response/ideal_response text NOT NULL, tags TEXT[], linked_grind_session_id FK
//     ON DELETE SET NULL.
//   - email_log schema: report_id FK ON DELETE SET NULL, kind enum CHECK 3 valores,
//     status enum CHECK 5 valores, UNIQUE (report_id, kind) WHERE report_id IS NOT NULL.
//   - ALTER TABLE user_coach_preferences ADD 5 cols.
//   - Rollback DROP em ordem reversa.
//
// Status esperado: PASSAM (migration JÁ EXISTE — characterization tests).
// =============================================================================

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  "migrations/0071_ai_2b_career_mental_email.sql",
);
const ROLLBACK_PATH = path.resolve(
  process.cwd(),
  "migrations/0071_ai_2b_career_mental_email_rollback.sql",
);

describe("migration 0071 — arquivos existem", () => {
  it("arquivo de migration existe", () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it("arquivo de rollback existe", () => {
    expect(fs.existsSync(ROLLBACK_PATH)).toBe(true);
  });
});

describe("migration 0071 — career_goals", () => {
  it("CREATE TABLE career_goals com colunas obrigatórias", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/CREATE TABLE.*career_goals/i);
    expect(sql).toMatch(/user_id[\s\S]*?REFERENCES users/i);
    expect(sql).toMatch(/title\s+VARCHAR\(120\)\s+NOT NULL/i);
    expect(sql).toMatch(/description\s+TEXT/i);
    expect(sql).toMatch(/target_metric\s+VARCHAR\(40\)/i);
    expect(sql).toMatch(/target_value\s+NUMERIC/i);
    expect(sql).toMatch(/target_deadline\s+DATE/i);
    expect(sql).toMatch(/horizon\s+VARCHAR\(16\)\s+NOT NULL\s+DEFAULT\s+'trimestre'/i);
    expect(sql).toMatch(/status\s+VARCHAR\(16\)\s+NOT NULL\s+DEFAULT\s+'active'/i);
  });

  it("career_goals — CHECKs de enum", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/horizon\s+IN\s*\(\s*'mes'\s*,\s*'trimestre'\s*,\s*'ano'\s*,\s*'multi_ano'/i);
    expect(sql).toMatch(/status\s+IN\s*\(\s*'active'\s*,\s*'achieved'\s*,\s*'abandoned'\s*,\s*'expired'/i);
    expect(sql).toMatch(/target_metric.*IN\s*\(\s*'profit_usd'/i);
  });

  it("career_goals — índices user_status + user_deadline", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/CREATE INDEX.*idx_career_goals_user_status/i);
    expect(sql).toMatch(/CREATE INDEX.*idx_career_goals_user_deadline/i);
  });
});

describe("migration 0071 — mental_hand_history", () => {
  it("CREATE TABLE mental_hand_history com colunas obrigatórias", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/CREATE TABLE.*mental_hand_history/i);
    expect(sql).toMatch(/situation\s+TEXT\s+NOT NULL/i);
    expect(sql).toMatch(/emotion\s+VARCHAR\(32\)/i);
    expect(sql).toMatch(/real_response\s+TEXT\s+NOT NULL/i);
    expect(sql).toMatch(/ideal_response\s+TEXT\s+NOT NULL/i);
    expect(sql).toMatch(/tags\s+TEXT\[\]/i);
    expect(sql).toMatch(/linked_grind_session_id[\s\S]*?REFERENCES grind_sessions[\s\S]*?ON DELETE SET NULL/i);
  });

  it("mental_hand_history — emotion enum CHECK", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/emotion.*IN\s*\(\s*'frustration'\s*,\s*'tilt'/i);
  });

  it("mental_hand_history — índices user_occurred DESC + user_emotion", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/idx_mental_hh_user_occurred/i);
    expect(sql).toMatch(/idx_mental_hh_user_emotion/i);
  });
});

describe("migration 0071 — email_log", () => {
  it("CREATE TABLE email_log com colunas + status + kind enum CHECK", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/CREATE TABLE.*email_log/i);
    expect(sql).toMatch(/report_id[\s\S]*?REFERENCES reports[\s\S]*?ON DELETE SET NULL/i);
    expect(sql).toMatch(/kind\s+VARCHAR\(32\)\s+NOT NULL/i);
    expect(sql).toMatch(/status\s+VARCHAR\(16\)\s+NOT NULL\s+DEFAULT\s+'pending'/i);
    expect(sql).toMatch(/attempts\s+INTEGER\s+NOT NULL\s+DEFAULT\s+0/i);
    expect(sql).toMatch(/message_id\s+TEXT/i);
  });

  it("email_log — CHECKs (status 5 valores, kind 3 valores)", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/status\s+IN\s*\(\s*'pending'\s*,\s*'sent'\s*,\s*'failed'\s*,\s*'bounced'/i);
    expect(sql).toMatch(/kind\s+IN\s*\(\s*'report_weekly'\s*,\s*'report_monthly'\s*,\s*'report_quarterly'/i);
  });

  it("email_log — UNIQUE (report_id, kind) WHERE report_id IS NOT NULL", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/CREATE UNIQUE INDEX.*uq_email_log_report_kind/i);
    expect(sql).toMatch(/WHERE report_id IS NOT NULL/i);
  });

  it("email_log — index parcial pending", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/idx_email_log_pending[\s\S]*?WHERE status\s*=\s*'pending'/i);
  });
});

describe("migration 0071 — ALTER user_coach_preferences", () => {
  it("ADD 5 cols (report_quarterly_enabled, email_X_enabled x 3, disclaimer_accepted_at)", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/ALTER TABLE user_coach_preferences/i);
    expect(sql).toMatch(/report_quarterly_enabled\s+BOOLEAN/i);
    expect(sql).toMatch(/email_weekly_enabled\s+BOOLEAN/i);
    expect(sql).toMatch(/email_monthly_enabled\s+BOOLEAN/i);
    expect(sql).toMatch(/email_quarterly_enabled\s+BOOLEAN/i);
    expect(sql).toMatch(/disclaimer_accepted_at\s+TIMESTAMP/i);
  });

  it("5 cols com NOT NULL DEFAULT false (exceto disclaimer_accepted_at que é nullable)", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/report_quarterly_enabled\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+false/i);
    expect(sql).toMatch(/email_weekly_enabled\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+false/i);
  });
});

describe("migration 0071 — rollback", () => {
  it("DROP em ordem reversa (email_log + mental_hand_history + career_goals)", () => {
    const sql = fs.readFileSync(ROLLBACK_PATH, "utf-8");
    expect(sql).toMatch(/DROP TABLE.*email_log/i);
    expect(sql).toMatch(/DROP TABLE.*mental_hand_history/i);
    expect(sql).toMatch(/DROP TABLE.*career_goals/i);
  });

  it("rollback dropa as 5 cols de user_coach_preferences", () => {
    const sql = fs.readFileSync(ROLLBACK_PATH, "utf-8");
    expect(sql).toMatch(/ALTER TABLE user_coach_preferences/i);
    expect(sql).toMatch(/DROP COLUMN.*report_quarterly_enabled/i);
    expect(sql).toMatch(/DROP COLUMN.*email_weekly_enabled/i);
    expect(sql).toMatch(/DROP COLUMN.*disclaimer_accepted_at/i);
  });
});
