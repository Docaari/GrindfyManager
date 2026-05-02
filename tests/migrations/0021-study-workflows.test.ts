/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-08: Migration 0021 (study_theme_spot_links + streak)
 *
 * Spec:    Docs/specs/sprint-studies-reform.md (RF-08, secao 8.1)
 * Tabelas: study_theme_spot_links + colunas users.study_streak_days, users.last_study_activity_at
 *
 * NOTA: Estes testes validam o ARQUIVO SQL e o Drizzle schema. Execucao real
 * em DB e feita via db:push manualmente. Aqui validamos shape + presenca.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../..');
const migrationPath = path.join(repoRoot, 'migrations', '0021_studies_reform.sql');
const rollbackPath = path.join(repoRoot, 'migrations', '0021_studies_reform_rollback.sql');
const schemaPath = path.join(repoRoot, 'shared', 'schema.ts');

describe('RF-08 Migration 0021', () => {
  it('arquivo migrations/0021_studies_reform.sql existe', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('arquivo migrations/0021_studies_reform_rollback.sql existe', () => {
    expect(fs.existsSync(rollbackPath)).toBe(true);
  });

  it('SQL cria tabela study_theme_spot_links', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    expect(sql).toMatch(/CREATE TABLE\s+IF NOT EXISTS\s+study_theme_spot_links/i);
  });

  it('SQL cria UNIQUE (theme_id, spot_id) para idempotencia', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    expect(sql).toMatch(/UNIQUE\s*\(\s*theme_id\s*,\s*spot_id\s*\)/i);
  });

  it('SQL cria indices em theme_id e spot_id', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    expect(sql).toMatch(/idx_study_theme_spot_links_theme/i);
    expect(sql).toMatch(/idx_study_theme_spot_links_spot/i);
  });

  it('SQL adiciona users.study_streak_days INTEGER DEFAULT 0', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    expect(sql).toMatch(/ALTER TABLE\s+users[\s\S]+study_streak_days[\s\S]+(?:INT|INTEGER)/i);
  });

  it('Drizzle schema declara studyThemeSpotLinks', () => {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    expect(schema).toMatch(/studyThemeSpotLinks/);
    expect(schema).toMatch(/['"]study_theme_spot_links['"]/);
  });
});
