import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: server/scoring/currencyNormalizer.ts (NAO existe ainda)
//
// Funcao pura que normaliza buyIn (em qualquer moeda) para USD usando
// user_settings.exchange_rates (jsonb com chaves tipo "BRL", "EUR", etc.).
//
// Decisoes Q2:
//   - Chave "BRL" no exchange_rates significa multiplier BRL->USD (ex: 0.20)
//   - Fallback DEFAULT_EXCHANGE_RATES quando user_settings nao tem a chave
//   - Historico TAMBEM e normalizado (validado em playerBundle test)
// =============================================================================

import {
  normalizeBuyInToUSD,
  normalizeBucketRange,
} from '../../../server/scoring/currencyNormalizer';
import { DEFAULT_EXCHANGE_RATES } from '../../../server/scoring/scoringConstants';

describe('normalizeBuyInToUSD - moedas conhecidas', () => {
  it('USD passa direto (no-op)', () => {
    expect(normalizeBuyInToUSD(22, 'USD', {})).toBe(22);
  });

  it('USD com exchange_rates vazio: ainda passa direto', () => {
    expect(normalizeBuyInToUSD(11, 'USD', {})).toBe(11);
  });

  it('BRL com taxa 0.25 do user: 100 BRL -> 25 USD', () => {
    expect(normalizeBuyInToUSD(100, 'BRL', { BRL: 0.25 })).toBe(25);
  });

  it('BRL com taxa 0.20 do user: 22 BRL -> 4.4 USD', () => {
    expect(normalizeBuyInToUSD(22, 'BRL', { BRL: 0.2 })).toBeCloseTo(4.4, 5);
  });

  it('EUR com taxa 1.10: 10 EUR -> 11 USD', () => {
    expect(normalizeBuyInToUSD(10, 'EUR', { EUR: 1.1 })).toBeCloseTo(11, 5);
  });
});

describe('normalizeBuyInToUSD - fallback (Q2)', () => {
  it('user nao tem chave BRL -> usa DEFAULT_EXCHANGE_RATES.BRL (0.20)', () => {
    expect(normalizeBuyInToUSD(100, 'BRL', {})).toBe(100 * DEFAULT_EXCHANGE_RATES.BRL);
  });

  it('user tem outras chaves mas nao BRL -> usa fallback', () => {
    expect(normalizeBuyInToUSD(100, 'BRL', { EUR: 1.1, USD: 1 })).toBe(100 * DEFAULT_EXCHANGE_RATES.BRL);
  });

  it('user_settings null/undefined -> usa fallback', () => {
    expect(normalizeBuyInToUSD(100, 'BRL', null as any)).toBe(100 * DEFAULT_EXCHANGE_RATES.BRL);
    expect(normalizeBuyInToUSD(100, 'BRL', undefined as any)).toBe(100 * DEFAULT_EXCHANGE_RATES.BRL);
  });
});

describe('normalizeBuyInToUSD - moedas desconhecidas', () => {
  it('moeda nao reconhecida e sem fallback -> retorna 0 ou throw (Implementer decide)', () => {
    // O contrato preferido e retornar 0 (resultado determinista, sem crash em runtime).
    // Implementer pode escolher throw — neste caso ajustar este teste.
    const result = normalizeBuyInToUSD(100, 'XYZ', {});
    expect(typeof result).toBe('number');
  });

  it('moeda undefined/null/empty -> trata como USD (no-op)', () => {
    expect(normalizeBuyInToUSD(22, '' as any, {})).toBe(22);
    expect(normalizeBuyInToUSD(22, null as any, {})).toBe(22);
    expect(normalizeBuyInToUSD(22, undefined as any, {})).toBe(22);
  });
});

describe('normalizeBuyInToUSD - edge cases', () => {
  it('buyIn = 0 sempre retorna 0', () => {
    expect(normalizeBuyInToUSD(0, 'BRL', { BRL: 0.2 })).toBe(0);
    expect(normalizeBuyInToUSD(0, 'USD', {})).toBe(0);
  });

  it('buyIn negativo (nao deveria ocorrer mas deve ser deterministico)', () => {
    const result = normalizeBuyInToUSD(-22, 'USD', {});
    expect(result).toBe(-22);
  });

  it('buyIn como string: deve aceitar number-only (Implementer decide se converte ou rejeita)', () => {
    // Aceita number nativo apenas; conversao de string fica para o caller.
    expect(typeof normalizeBuyInToUSD(22.5, 'USD', {})).toBe('number');
  });
});

// ===========================================================================
// normalizeBucketRange — bucketiza buyIn em USD para a faixa correta
// ===========================================================================

describe('normalizeBucketRange - integracao com BUYIN_BUCKETS', () => {
  it('22 USD -> bucket "$11-21.99" ou "$22-54.99" (boundary)', () => {
    // 22 USD esta no comeco da faixa "$22-54.99"
    const bucket = normalizeBucketRange(22);
    expect(bucket).toContain('22');
  });

  it('5 USD -> bucket "$5-10.99"', () => {
    const bucket = normalizeBucketRange(5);
    expect(bucket?.toLowerCase()).toContain('5');
  });

  it('1 USD -> bucket "$0-1.99"', () => {
    const bucket = normalizeBucketRange(1);
    expect(bucket?.toLowerCase()).toMatch(/0-1\.99|0\.00-1/);
  });

  it('300 USD -> bucket "$220+"', () => {
    const bucket = normalizeBucketRange(300);
    expect(bucket?.toLowerCase()).toContain('220');
  });

  it('100 USD -> bucket "$55-109.99" (limite superior)', () => {
    const bucket = normalizeBucketRange(100);
    expect(bucket).toBeDefined();
  });
});

// ===========================================================================
// Cenario Q2: BRL e USD coexistindo no historico
// ===========================================================================

describe('Q2 — historico misto BRL+USD normalizado', () => {
  it('22 BRL e 4.4 USD apos normalizacao com taxa 0.20 ficam no MESMO bucket', () => {
    const usdFromBRL = normalizeBuyInToUSD(22, 'BRL', { BRL: 0.2 });
    expect(usdFromBRL).toBeCloseTo(4.4, 5);
    const bucketBRL = normalizeBucketRange(usdFromBRL); // ~4.4 USD
    const bucketUSD = normalizeBucketRange(4.4);
    expect(bucketBRL).toBe(bucketUSD);
  });

  it('110 BRL com taxa 0.20 = 22 USD; mesmo bucket que 22 USD direto', () => {
    const usdFromBRL = normalizeBuyInToUSD(110, 'BRL', { BRL: 0.2 });
    expect(usdFromBRL).toBeCloseTo(22, 5);
    expect(normalizeBucketRange(usdFromBRL)).toBe(normalizeBucketRange(22));
  });
});
