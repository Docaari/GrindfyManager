import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD (red phase) — campo novo em user_settings:
//   break_auto_open_enabled BOOLEAN DEFAULT true NOT NULL
//
// Spec: Docs/specs/grind-live-break-auto-open.md (RF-06)
// ADR: Docs/architecture/decisions/124-break-auto-open-clock-aligned-brt.md
// Schema Drizzle: shared/schema.ts (apos linha 789, junto aos toggles)
//
// Padrao: mesmo de bankrollManagementEnabled, lateRegAlertEnabled etc.
// =============================================================================

import {
  userSettings,
  insertUserSettingsSchema,
} from '../../../shared/schema';

describe('userSettings - coluna break_auto_open_enabled (RF-06)', () => {
  it('coluna breakAutoOpenEnabled existe no schema Drizzle', () => {
    expect((userSettings as any).breakAutoOpenEnabled).toBeDefined();
  });

  it('breakAutoOpenEnabled mapeia para coluna SQL "break_auto_open_enabled"', () => {
    const col = (userSettings as any).breakAutoOpenEnabled;
    // Drizzle expoe nome da coluna em col.name (api estavel).
    expect(col?.name).toBe('break_auto_open_enabled');
  });

  it('breakAutoOpenEnabled tem default true (DEFAULT no DDL)', () => {
    const col = (userSettings as any).breakAutoOpenEnabled;
    // Default eh boolean true; checa via .default ou .hasDefault — formato
    // Drizzle expoe .default valor literal (boolean).
    const hasDefault = col?.hasDefault === true || col?.default === true;
    expect(hasDefault).toBe(true);
  });
});

describe('insertUserSettingsSchema - breakAutoOpenEnabled (Zod)', () => {
  it('aceita breakAutoOpenEnabled=true', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      breakAutoOpenEnabled: true,
    });
    expect(r.success).toBe(true);
  });

  it('aceita breakAutoOpenEnabled=false', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      breakAutoOpenEnabled: false,
    });
    expect(r.success).toBe(true);
  });

  it('aceita ausencia do campo (default kicks in via DB DEFAULT true)', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
    });
    expect(r.success).toBe(true);
  });

  it('preserva breakAutoOpenEnabled=true no parsed result (campo conhecido)', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      breakAutoOpenEnabled: true,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      // Quando o campo existe no schema, Zod preserva no .data.
      // Em red phase, drizzle-zod ignora campos desconhecidos -> data nao tem
      // breakAutoOpenEnabled, e este expect falha.
      expect(r.data.breakAutoOpenEnabled).toBe(true);
    }
  });

  it('preserva breakAutoOpenEnabled=false no parsed result', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      breakAutoOpenEnabled: false,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.breakAutoOpenEnabled).toBe(false);
    }
  });
});
