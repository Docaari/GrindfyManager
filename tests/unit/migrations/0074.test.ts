/**
 * Sprint Backend Tech-Debt Sweep — Migration 0074
 *
 * Spec: Docs/specs/sprint-backend-sweep.md (RF-02 / Modelos de Dados)
 * ADR-181 §2.2:
 *   ALTER TABLE upload_history
 *     ADD COLUMN processed_count integer NOT NULL DEFAULT 0;
 *   CREATE INDEX idx_upload_history_status ON upload_history(status);
 *
 * Convenção do projeto: migrations ficam em `migrations/0074_*.sql`.
 * Rollback (se presente): `migrations/0074_*_rollback.sql`.
 *
 * Os testes lêem o conteúdo do(s) arquivo(s) SQL diretamente e fazem grep dos
 * comandos esperados. Não dependem de DB real.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../migrations');

function findMigrationFile(prefix: string): string | null {
  const files = fs.readdirSync(MIGRATIONS_DIR);
  const match = files.find(f => f.startsWith(prefix) && f.endsWith('.sql') && !f.includes('rollback'));
  return match ? path.join(MIGRATIONS_DIR, match) : null;
}

function findRollbackFile(prefix: string): string | null {
  const files = fs.readdirSync(MIGRATIONS_DIR);
  const match = files.find(f => f.startsWith(prefix) && f.endsWith('.sql') && f.includes('rollback'));
  return match ? path.join(MIGRATIONS_DIR, match) : null;
}

describe('Migration 0074 — upload_history.processed_count + idx status', () => {
  it('arquivo migrations/0074_*.sql existe', () => {
    const file = findMigrationFile('0074_');
    expect(file).not.toBeNull();
  });

  it('ALTER TABLE upload_history ADD COLUMN processed_count integer', () => {
    const file = findMigrationFile('0074_');
    expect(file).not.toBeNull();
    const sql = fs.readFileSync(file!, 'utf-8');
    expect(sql).toMatch(/ALTER\s+TABLE\s+upload_history/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?processed_count\s+integer/i);
  });

  it('processed_count NOT NULL DEFAULT 0', () => {
    const file = findMigrationFile('0074_');
    const sql = fs.readFileSync(file!, 'utf-8');
    // Pode estar tudo na mesma linha do ADD COLUMN ou separado — basta ambos presentes
    expect(sql).toMatch(/processed_count[\s\S]*NOT\s+NULL/i);
    expect(sql).toMatch(/processed_count[\s\S]*DEFAULT\s+0/i);
  });

  it('CREATE INDEX idx_upload_history_status ON upload_history(status)', () => {
    const file = findMigrationFile('0074_');
    const sql = fs.readFileSync(file!, 'utf-8');
    expect(sql).toMatch(/CREATE\s+INDEX\s+(IF\s+NOT\s+EXISTS\s+)?idx_upload_history_status/i);
    expect(sql).toMatch(/ON\s+upload_history\s*\(\s*status\s*\)/i);
  });

  it('arquivo de rollback 0074_*_rollback.sql existe', () => {
    const file = findRollbackFile('0074_');
    expect(file).not.toBeNull();
  });

  it('rollback DROP COLUMN processed_count', () => {
    const file = findRollbackFile('0074_');
    if (!file) {
      // Falha explícita já coberta por o teste anterior; aqui só pulamos para
      // evitar throw inesperado.
      expect(file).not.toBeNull();
      return;
    }
    const sql = fs.readFileSync(file, 'utf-8');
    expect(sql).toMatch(/ALTER\s+TABLE\s+upload_history/i);
    expect(sql).toMatch(/DROP\s+COLUMN\s+(IF\s+EXISTS\s+)?processed_count/i);
  });

  it('rollback DROP INDEX idx_upload_history_status', () => {
    const file = findRollbackFile('0074_');
    if (!file) {
      expect(file).not.toBeNull();
      return;
    }
    const sql = fs.readFileSync(file, 'utf-8');
    expect(sql).toMatch(/DROP\s+INDEX\s+(IF\s+EXISTS\s+)?idx_upload_history_status/i);
  });
});

describe('Migration 0074 — idempotência', () => {
  it('uso de "IF NOT EXISTS" no ADD COLUMN ou no INDEX (re-run safety)', () => {
    const file = findMigrationFile('0074_');
    if (!file) {
      expect(file).not.toBeNull();
      return;
    }
    const sql = fs.readFileSync(file, 'utf-8');
    // Pelo menos um dos dois deve ser idempotente
    const safeColumn = /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+processed_count/i.test(sql);
    const safeIndex = /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_upload_history_status/i.test(sql);
    expect(safeColumn || safeIndex).toBe(true);
  });
});
