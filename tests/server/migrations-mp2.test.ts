/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — smoke test das migrations 0076 + 0077.
 *
 * NAO conecta no DB real. Valida apenas:
 *  - arquivos .sql existem
 *  - SQL forward inclui CREATE TABLE / ALTER TABLE esperado
 *  - rollback inverso existe
 *
 * Aplicacao real (db:push manual ou via psql) eh responsabilidade founder/CI.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

describe('Migration 0076 — user_coach_preferences.audio_sleep_timer_minutes (RF-NEW.2)', () => {
  it('arquivo forward existe', () => {
    const candidates = [
      '0076_user_coach_preferences_sleep_timer.sql',
      '0076_audio_sleep_timer.sql',
    ];
    const found = candidates.some((c) => fs.existsSync(path.join(MIGRATIONS_DIR, c)));
    expect(found).toBe(true);
  });

  it('forward inclui ALTER TABLE user_coach_preferences ADD COLUMN audio_sleep_timer_minutes', () => {
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.startsWith('0076') && !f.includes('rollback'));
    expect(files.length).toBeGreaterThan(0);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), 'utf8');
    expect(sql).toMatch(/ALTER TABLE\s+user_coach_preferences/i);
    expect(sql).toMatch(/audio_sleep_timer_minutes/i);
    expect(sql).toMatch(/integer/i);
  });

  it('CHECK constraint enum [15,30,45,60,90,NULL]', () => {
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.startsWith('0076') && !f.includes('rollback'));
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), 'utf8');
    for (const n of [15, 30, 45, 60, 90]) {
      expect(sql).toMatch(new RegExp(`\\b${n}\\b`));
    }
    expect(sql.toUpperCase()).toContain('CHECK');
  });

  it('rollback existe + DROP COLUMN', () => {
    const rollbacks = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.startsWith('0076') && f.includes('rollback'));
    expect(rollbacks.length).toBeGreaterThan(0);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, rollbacks[0]), 'utf8');
    expect(sql).toMatch(/DROP\s+COLUMN\s+IF\s+EXISTS\s+audio_sleep_timer_minutes/i);
  });
});

describe('Migration 0077 — spotify_tokens (ADR-190)', () => {
  it('forward existe', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) =>
      f.startsWith('0077') && !f.includes('rollback'),
    );
    expect(files.length).toBeGreaterThan(0);
  });

  it('CREATE TABLE spotify_tokens com colunas obrigatorias', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) =>
      f.startsWith('0077') && !f.includes('rollback'),
    );
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), 'utf8');
    expect(sql).toMatch(/CREATE TABLE\s+spotify_tokens/i);
    for (const col of [
      'user_id',
      'refresh_token_encrypted',
      'refresh_token_iv',
      'refresh_token_auth_tag',
      'expires_at',
      'scopes',
      'display_name',
      'spotify_user_id',
      'connected_at',
      'disconnected_at',
      'refresh_failure_count',
    ]) {
      expect(sql.toLowerCase()).toContain(col);
    }
  });

  it('index parcial idx_spotify_tokens_connected', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) =>
      f.startsWith('0077') && !f.includes('rollback'),
    );
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), 'utf8');
    expect(sql).toMatch(/CREATE INDEX.*idx_spotify_tokens_connected/i);
    expect(sql.toUpperCase()).toContain('WHERE DISCONNECTED_AT IS NULL');
  });

  it('rollback DROP TABLE', () => {
    const rollbacks = fs.readdirSync(MIGRATIONS_DIR).filter((f) =>
      f.startsWith('0077') && f.includes('rollback'),
    );
    expect(rollbacks.length).toBeGreaterThan(0);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, rollbacks[0]), 'utf8');
    expect(sql).toMatch(/DROP TABLE\s+IF EXISTS\s+spotify_tokens/i);
  });
});
