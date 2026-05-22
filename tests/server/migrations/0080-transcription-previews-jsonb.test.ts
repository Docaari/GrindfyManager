// Sprint Mini Player 3.2 / Wave A / W-A4 — Migration 0080 transcription_previews JSONB.
// ADR-201. RED PHASE — migration ainda nao existe.
//
// Cobre:
// - SQL file existe + rollback file existe
// - ADD COLUMN transcription_previews JSONB (aditiva)
// - Backfill copia varchar -> {pt: varchar} quando varchar NOT NULL
// - Index GIN criado
// - Rollback dropa coluna + index (idempotente)
// - Migration idempotente (rodar 2x = no-op no 2o)

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../migrations");
const UP_FILE = path.join(MIGRATIONS_DIR, "0080_transcription_previews_jsonb.sql");
const DOWN_FILE = path.join(
  MIGRATIONS_DIR,
  "0080_transcription_previews_jsonb_rollback.sql",
);

describe("Migration 0080 transcription_previews JSONB (W-A4)", () => {
  it("arquivo up existe", () => {
    expect(fs.existsSync(UP_FILE)).toBe(true);
  });

  it("arquivo rollback existe", () => {
    expect(fs.existsSync(DOWN_FILE)).toBe(true);
  });

  it("up contem ADD COLUMN transcription_previews JSONB", () => {
    const sql = fs.readFileSync(UP_FILE, "utf8");
    expect(sql).toMatch(/ADD COLUMN.*transcription_previews.*JSONB/i);
  });

  it("up tem ADD COLUMN IF NOT EXISTS (idempotente)", () => {
    const sql = fs.readFileSync(UP_FILE, "utf8");
    expect(sql).toMatch(/ADD COLUMN\s+IF NOT EXISTS/i);
  });

  it("up faz backfill de varchar -> jsonb_build_object('pt', ...)", () => {
    const sql = fs.readFileSync(UP_FILE, "utf8");
    expect(sql).toMatch(/jsonb_build_object\s*\(\s*'pt'/i);
    expect(sql).toMatch(/transcription_preview\s+IS NOT NULL/i);
  });

  it("backfill so atualiza quando transcription_previews IS NULL (idempotente)", () => {
    const sql = fs.readFileSync(UP_FILE, "utf8");
    expect(sql).toMatch(/transcription_previews\s+IS NULL/i);
  });

  it("up cria index GIN para queries", () => {
    const sql = fs.readFileSync(UP_FILE, "utf8");
    expect(sql).toMatch(/CREATE INDEX\s+IF NOT EXISTS.*USING\s+GIN/i);
    expect(sql).toMatch(/transcription_previews/i);
  });

  it("up NAO dropa coluna varchar legacy (aditiva)", () => {
    const sql = fs.readFileSync(UP_FILE, "utf8");
    expect(sql).not.toMatch(/DROP COLUMN\s+transcription_preview\b/i);
  });

  it("rollback dropa coluna nova + index", () => {
    const sql = fs.readFileSync(DOWN_FILE, "utf8");
    expect(sql).toMatch(/DROP INDEX\s+IF EXISTS/i);
    expect(sql).toMatch(/DROP COLUMN\s+IF EXISTS\s+transcription_previews/i);
  });

  it("rollback NAO dropa varchar legacy (mantem)", () => {
    const sql = fs.readFileSync(DOWN_FILE, "utf8");
    expect(sql).not.toMatch(/DROP COLUMN.*transcription_preview\b(?!s)/i);
  });
});

describe("Drizzle schema reflete transcriptionPreviews (W-A4)", () => {
  it("libraryLessons tem campo transcriptionPreviews JSONB", async () => {
    const schema: any = await import("@shared/schema");
    expect(schema.libraryLessons).toBeDefined();
    // Drizzle expoe colunas em diferentes formas dependendo da versao.
    // Verificamos pelo menos a presenca via toString OR symbol getter.
    const keys = Object.keys(schema.libraryLessons);
    const found =
      keys.includes("transcriptionPreviews") ||
      String(schema.libraryLessons).includes("transcription_previews");
    expect(found).toBe(true);
  });
});
