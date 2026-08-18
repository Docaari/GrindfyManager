import { describe, it, expect } from 'vitest';

// =============================================================================
// Red phase — campo novo em user_settings:
//   manual_session_result_enabled BOOLEAN NOT NULL DEFAULT true
//
// Spec: Docs/specs/grind-live-manual-session-result.md (RF-01)
// ADR:  Docs/architecture/decisions/244-grind-live-manual-session-result.md (D3)
// Migration: migrations/0100_manual_session_result.sql
//
// Por que este arquivo importa mais do que parece: o PUT /api/user-settings
// (server/routes/misc.ts:136) faz `insertUserSettingsSchema.parse(merge)` sobre
// o registro INTEIRO. Campo presente no banco mas ausente no Zod nao quebra so
// este toggle — derruba QUALQUER PUT parcial de settings do app.
//
// Molde: tests/unit/schema/user-settings-break-auto-open.test.ts.
// =============================================================================

import {
  userSettings,
  insertUserSettingsSchema,
} from '../../../shared/schema';

describe('userSettings - coluna manual_session_result_enabled (RF-01)', () => {
  it('coluna manualSessionResultEnabled existe no schema Drizzle', () => {
    expect((userSettings as any).manualSessionResultEnabled).toBeDefined();
  });

  it('mapeia para a coluna SQL "manual_session_result_enabled"', () => {
    const col = (userSettings as any).manualSessionResultEnabled;
    expect(col?.name).toBe('manual_session_result_enabled');
  });

  it('tem default true (D3: usuario legado herda ON pelo DEFAULT do banco)', () => {
    const col = (userSettings as any).manualSessionResultEnabled;
    const hasDefault = col?.hasDefault === true || col?.default === true;
    expect(hasDefault).toBe(true);
  });

  it('e NOT NULL (paridade com breakAutoOpenEnabled)', () => {
    const col = (userSettings as any).manualSessionResultEnabled;
    expect(col?.notNull).toBe(true);
  });
});

describe('insertUserSettingsSchema - manualSessionResultEnabled (Zod)', () => {
  it('aceita manualSessionResultEnabled=true', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      manualSessionResultEnabled: true,
    });
    expect(r.success).toBe(true);
  });

  it('aceita manualSessionResultEnabled=false (jogador desliga o ajuste)', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      manualSessionResultEnabled: false,
    });
    expect(r.success).toBe(true);
  });

  it('aceita ausencia do campo (DB DEFAULT true assume)', () => {
    const r = insertUserSettingsSchema.safeParse({ userId: 'USER-0001' });
    expect(r.success).toBe(true);
  });

  it('preserva o valor true no parsed result (campo conhecido pelo schema)', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      manualSessionResultEnabled: true,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as any).manualSessionResultEnabled).toBe(true);
    }
  });

  it('preserva o valor false no parsed result', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      manualSessionResultEnabled: false,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as any).manualSessionResultEnabled).toBe(false);
    }
  });

  it('nao derruba o PUT parcial: merge com outros toggles continua valido', () => {
    // Reproduz o merge real do PUT (existingSafe + body). Se o campo novo nao
    // estiver no schema, este parse falha e o usuario perde a capacidade de
    // salvar QUALQUER preferencia.
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      bankrollManagementEnabled: true,
      breakAutoOpenEnabled: true,
      exchangeRates: { BRL: 5.4 },
      manualSessionResultEnabled: false,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as any).bankrollManagementEnabled).toBe(true);
      expect((r.data as any).exchangeRates).toEqual({ BRL: 5.4 });
      expect((r.data as any).manualSessionResultEnabled).toBe(false);
    }
  });
});
