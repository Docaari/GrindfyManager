import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: shared/schema.ts -> user_settings v2 (RF-06 + RF-08 flag migration)
//
// Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md (RF-06)
// 3 colunas adicionais: bankrollAggregationMode, bankrollDisplayCurrency,
//   bankrollV2Migrated, lastBankrollPageVisitV2
// =============================================================================

import {
  userSettings,
  insertUserSettingsSchema,
} from '../../../shared/schema';

describe('user_settings v2: novas colunas', () => {
  it('coluna bankrollAggregationMode existe (default global)', () => {
    expect((userSettings as any).bankrollAggregationMode).toBeDefined();
  });

  it('coluna bankrollDisplayCurrency existe (default USD)', () => {
    expect((userSettings as any).bankrollDisplayCurrency).toBeDefined();
  });

  it('coluna bankrollV2Migrated existe (default false)', () => {
    expect((userSettings as any).bankrollV2Migrated).toBeDefined();
  });

  it('coluna lastBankrollPageVisitV2 existe (nullable, p/ onboarding tooltip)', () => {
    expect((userSettings as any).lastBankrollPageVisitV2).toBeDefined();
  });
});

describe('insertUserSettingsSchema: novos campos validados', () => {
  it('aceita bankrollAggregationMode = "global"', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      bankrollAggregationMode: 'global',
    });
    expect(r.success).toBe(true);
  });

  it('aceita bankrollAggregationMode = "per_wallet"', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      bankrollAggregationMode: 'per_wallet',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita bankrollAggregationMode invalido', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      bankrollAggregationMode: 'random',
    });
    expect(r.success).toBe(false);
  });

  it('aceita bankrollDisplayCurrency em USD/BRL/EUR/etc', () => {
    for (const ccy of ['USD', 'BRL', 'EUR', 'GBP', 'CNY', 'USDT', 'BTC']) {
      const r = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        bankrollDisplayCurrency: ccy,
      });
      expect(r.success, `ccy=${ccy}`).toBe(true);
    }
  });

  it('rejeita bankrollDisplayCurrency invalido', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      bankrollDisplayCurrency: 'JPY',
    });
    expect(r.success).toBe(false);
  });

  it('bankrollV2Migrated aceita boolean', () => {
    expect(insertUserSettingsSchema.safeParse({
      userId: 'USER-0001', bankrollV2Migrated: false,
    }).success).toBe(true);
    expect(insertUserSettingsSchema.safeParse({
      userId: 'USER-0001', bankrollV2Migrated: true,
    }).success).toBe(true);
  });

  it('todos os 4 novos campos sao OPCIONAIS no insert (cobertos por defaults)', () => {
    const r = insertUserSettingsSchema.safeParse({ userId: 'USER-0001' });
    expect(r.success).toBe(true);
  });
});

describe('user_settings v2: bankroll_snapshots tambem ganha 4 colunas', () => {
  it('bankroll_snapshots tem walletId nullable', async () => {
    const mod = await import('../../../shared/schema');
    expect((mod.bankrollSnapshots as any).walletId).toBeDefined();
  });

  it('bankroll_snapshots tem nativeAmount, nativeCurrency, fxRateUSDPerNative nullable', async () => {
    const mod = await import('../../../shared/schema');
    expect((mod.bankrollSnapshots as any).nativeAmount).toBeDefined();
    expect((mod.bankrollSnapshots as any).nativeCurrency).toBeDefined();
    expect((mod.bankrollSnapshots as any).fxRateUSDPerNative).toBeDefined();
  });
});
