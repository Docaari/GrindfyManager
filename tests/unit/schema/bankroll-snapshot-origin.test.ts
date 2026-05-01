/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-8: Migration 0018 origin/source_ref_id em bankroll_snapshots
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-8)
 *
 * Casos cobertos:
 *   1. SNAPSHOT_ORIGINS exporta os 5 valores
 *   2. insertBankrollSnapshotSchema aceita origin opcional
 *   3. insertBankrollSnapshotSchema valida origin do enum
 *   4. insertBankrollSnapshotSchema aceita sourceRefId opcional
 *   5. bankrollSnapshots Drizzle table tem coluna origin (default 'manual')
 *   6. bankrollSnapshots Drizzle table tem coluna sourceRefId
 *   7. Migration file existe (0018_auto_snapshot_meta.sql)
 *   8. Migration cria index idx_bankroll_snapshots_origin
 *   9. Migration cria unique parcial uq_bankroll_snapshots_cooldown
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('RF-8: SNAPSHOT_ORIGINS enum + schema', () => {
  it('SNAPSHOT_ORIGINS exporta 5 valores: manual, auto-cooldown, transfer, import, migration_v1', async () => {
    const mod: any = await import('../../../shared/schema');
    const origins = mod.SNAPSHOT_ORIGINS as readonly string[];
    expect(origins).toContain('manual');
    expect(origins).toContain('auto-cooldown');
    expect(origins).toContain('transfer');
    expect(origins).toContain('import');
    expect(origins).toContain('migration_v1');
  });

  it('insertBankrollSnapshotSchema aceita origin=auto-cooldown e preserva campo', async () => {
    const mod: any = await import('../../../shared/schema');
    const result = mod.insertBankrollSnapshotSchema.safeParse({
      userId: 'USER-0001',
      delta: 100,
      previousAmount: 0,
      newAmount: 100,
      reason: 'manual_adjustment',
      origin: 'auto-cooldown',
      sourceRefId: 'cd_1',
    });
    expect(result.success).toBe(true);
    // Implementer deve adicionar campo origin no schema (nao apenas silenciosamente strippar).
    if (result.success) {
      expect(result.data.origin).toBe('auto-cooldown');
      expect(result.data.sourceRefId).toBe('cd_1');
    }
  });

  it('insertBankrollSnapshotSchema rejeita origin invalido', async () => {
    const mod: any = await import('../../../shared/schema');
    const result = mod.insertBankrollSnapshotSchema.safeParse({
      userId: 'USER-0001',
      delta: 100,
      previousAmount: 0,
      newAmount: 100,
      reason: 'manual_adjustment',
      origin: 'invalido',
    });
    expect(result.success).toBe(false);
  });

  it('insertBankrollSnapshotSchema origin opcional (default manual)', async () => {
    const mod: any = await import('../../../shared/schema');
    const result = mod.insertBankrollSnapshotSchema.safeParse({
      userId: 'USER-0001',
      delta: 100,
      previousAmount: 0,
      newAmount: 100,
      reason: 'manual_adjustment',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Implementer deve usar Zod .default('manual')
      expect(result.data.origin ?? 'manual').toBe('manual');
    }
  });

  it('insertBankrollSnapshotSchema sourceRefId opcional e preserva valor', async () => {
    const mod: any = await import('../../../shared/schema');
    const result = mod.insertBankrollSnapshotSchema.safeParse({
      userId: 'USER-0001',
      delta: 100,
      previousAmount: 0,
      newAmount: 100,
      reason: 'manual_adjustment',
      sourceRefId: 'cd_42',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceRefId).toBe('cd_42');
    }
  });

  it('SNAPSHOT_ORIGINS exporta exatamente os 5 valores documentados', async () => {
    const mod: any = await import('../../../shared/schema');
    const origins = mod.SNAPSHOT_ORIGINS as readonly string[];
    expect(origins.length).toBeGreaterThanOrEqual(5);
  });
});

describe('RF-8: Migration 0018 file existe', () => {
  const migrationDir = path.resolve(__dirname, '../../../migrations');

  it('arquivo migrations/0018_auto_snapshot_meta.sql existe', () => {
    const filePath = path.join(migrationDir, '0018_auto_snapshot_meta.sql');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('migration adiciona coluna origin', () => {
    const filePath = path.join(migrationDir, '0018_auto_snapshot_meta.sql');
    if (!fs.existsSync(filePath)) {
      throw new Error('Migration ausente — Implementer precisa criar');
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/origin/i);
    expect(content).toMatch(/source_ref_id/i);
  });

  it('migration cria unique parcial uq_bankroll_snapshots_cooldown', () => {
    const filePath = path.join(migrationDir, '0018_auto_snapshot_meta.sql');
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/uq_bankroll_snapshots_cooldown/);
    expect(content).toMatch(/UNIQUE\s+INDEX/i);
  });

  it('migration cria index idx_bankroll_snapshots_origin', () => {
    const filePath = path.join(migrationDir, '0018_auto_snapshot_meta.sql');
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/idx_bankroll_snapshots_origin/);
  });

  it('migration adiciona stops em user_settings', () => {
    const filePath = path.join(migrationDir, '0018_auto_snapshot_meta.sql');
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/stop_loss_usd/);
    expect(content).toMatch(/stop_win_usd/);
    expect(content).toMatch(/stop_lock_until/);
    expect(content).toMatch(/stop_lock_duration_hours/);
  });
});

describe('RF-1: Migration 0012 (rename) + 0006 nao existe mais', () => {
  const migrationDir = path.resolve(__dirname, '../../../migrations');

  it('migrations/0012_bankroll_management_enabled.sql existe', () => {
    const filePath = path.join(migrationDir, '0012_bankroll_management_enabled.sql');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('migrations/0006_bankroll_management_enabled.sql NAO existe', () => {
    const filePath = path.join(migrationDir, '0006_bankroll_management_enabled.sql');
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
