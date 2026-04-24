import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: shared/schema.ts — colunas novas em user_settings (Q8)
//
// Sprint 1 reserva os 2 campos que Sprint 2 (Bankroll Module) vai usar:
//   bankroll_amount  decimal nullable
//   bankroll_rule    varchar default '1pct'
//
// Quando bankroll_amount esta NULL, o filtro `bankrollFilter` no selector e
// desabilitado (response.bankrollConfigured: false) e o chip de UI fica disabled.
// =============================================================================

import {
  userSettings,
  insertUserSettingsSchema,
} from '../../../shared/schema';

describe('userSettings - novas colunas (Q8)', () => {
  it('coluna bankroll_amount existe no schema', () => {
    expect((userSettings as any).bankrollAmount).toBeDefined();
  });

  it('coluna bankroll_rule existe no schema', () => {
    expect((userSettings as any).bankrollRule).toBeDefined();
  });
});

describe('insertUserSettingsSchema - bankroll fields', () => {
  it('aceita bankrollAmount como string decimal', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      bankrollAmount: '1000.00',
    });
    expect(r.success).toBe(true);
  });

  it('aceita bankrollAmount como number', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      bankrollAmount: 1000,
    });
    expect(r.success).toBe(true);
  });

  it('aceita bankrollAmount=null (campo nullable)', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      bankrollAmount: null,
    });
    expect(r.success).toBe(true);
  });

  it('aceita ausencia de bankrollAmount (default null)', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
    });
    expect(r.success).toBe(true);
  });

  it('aceita bankrollRule="1pct" (default)', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      bankrollRule: '1pct',
    });
    expect(r.success).toBe(true);
  });

  it('aceita bankrollRule="2pct" (variante futura)', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      bankrollRule: '2pct',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita bankrollAmount negativo', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      bankrollAmount: '-100',
    });
    expect(r.success).toBe(false);
  });

  it('aceita bankrollAmount=0 (zero literal — caso bankroll esgotou)', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      bankrollAmount: '0',
    });
    expect(r.success).toBe(true);
  });
});
