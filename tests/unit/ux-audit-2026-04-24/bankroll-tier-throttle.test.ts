import { describe, it, expect } from 'vitest';
import {
  BANKROLL_WARNING_TIERS,
  getCurrentBankrollTier,
  shouldWarnForTier,
} from '../../../client/src/lib/bankrollGrindHelpers';

// =============================================================================
// UX Audit 2026-04-24 — GL-E: Bankroll toast throttle por tiers
// =============================================================================

describe('BANKROLL_WARNING_TIERS', () => {
  it('define os 4 tiers esperados', () => {
    expect(BANKROLL_WARNING_TIERS).toEqual([10, 15, 25, 50]);
  });
});

describe('getCurrentBankrollTier', () => {
  it('retorna 0 para 0% ou negativo', () => {
    expect(getCurrentBankrollTier(0)).toBe(0);
    expect(getCurrentBankrollTier(-0.1)).toBe(0);
    expect(getCurrentBankrollTier(0.05)).toBe(0); // abaixo de 10%
  });

  it('retorna 10 quando cruza 10%', () => {
    expect(getCurrentBankrollTier(0.1)).toBe(10);
    expect(getCurrentBankrollTier(0.12)).toBe(10);
    expect(getCurrentBankrollTier(0.149)).toBe(10);
  });

  it('retorna 15 quando cruza 15%', () => {
    expect(getCurrentBankrollTier(0.15)).toBe(15);
    expect(getCurrentBankrollTier(0.20)).toBe(15);
    expect(getCurrentBankrollTier(0.249)).toBe(15);
  });

  it('retorna 25 quando cruza 25%', () => {
    expect(getCurrentBankrollTier(0.25)).toBe(25);
    expect(getCurrentBankrollTier(0.40)).toBe(25);
    expect(getCurrentBankrollTier(0.499)).toBe(25);
  });

  it('retorna 50 quando cruza 50%', () => {
    expect(getCurrentBankrollTier(0.50)).toBe(50);
    expect(getCurrentBankrollTier(0.99)).toBe(50);
    expect(getCurrentBankrollTier(1.5)).toBe(50);
  });

  it('retorna 0 para input invalido (NaN/Infinity)', () => {
    expect(getCurrentBankrollTier(NaN)).toBe(0);
    expect(getCurrentBankrollTier(Infinity)).toBe(0); // Number.isFinite rejeita
    expect(getCurrentBankrollTier(-Infinity)).toBe(0);
  });
});

describe('shouldWarnForTier', () => {
  it('avisa quando cruza primeiro tier (lastAlertedTier=0)', () => {
    const result = shouldWarnForTier(0.12, 0);
    expect(result.shouldWarn).toBe(true);
    expect(result.newTier).toBe(10);
  });

  it('NAO avisa quando pctExposed ainda no mesmo tier', () => {
    // Ja alertamos em 10%; agora esta em 12% (mesmo tier 10)
    const result = shouldWarnForTier(0.12, 10);
    expect(result.shouldWarn).toBe(false);
    expect(result.newTier).toBe(10);
  });

  it('avisa quando sobe para proximo tier', () => {
    // Ja alertamos em 10%; agora esta em 16% (tier 15)
    const result = shouldWarnForTier(0.16, 10);
    expect(result.shouldWarn).toBe(true);
    expect(result.newTier).toBe(15);
  });

  it('avisa ao pular tiers (10% -> 30%)', () => {
    const result = shouldWarnForTier(0.30, 10);
    expect(result.shouldWarn).toBe(true);
    expect(result.newTier).toBe(25);
  });

  it('NAO avisa quando abaixo de 10%', () => {
    const result = shouldWarnForTier(0.08, 0);
    expect(result.shouldWarn).toBe(false);
    expect(result.newTier).toBe(0);
  });

  it('integration — simula sessao de 20 torneios em 1% incrementos', () => {
    let last = 0;
    let warnCount = 0;
    // Simula acumulacao de 1% em 1% ate 60%
    for (let pct = 0.01; pct <= 0.6; pct += 0.01) {
      const { shouldWarn, newTier } = shouldWarnForTier(pct, last);
      if (shouldWarn) {
        warnCount++;
        last = newTier;
      }
    }
    // Espera-se exatamente 4 avisos (10%, 15%, 25%, 50%)
    expect(warnCount).toBe(4);
  });
});
