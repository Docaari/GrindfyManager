import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: server/scoring/currencyNormalizer.ts (NAO existe ainda)
//
// Funcao pura que normaliza buyIn (em qualquer moeda) para USD usando
// user_settings.exchange_rates (jsonb com chaves tipo "BRL", "EUR", etc.).
//
// Convencao oficial (ADR-033 — units per 1 USD):
//   - Chave "BRL" no exchange_rates = quantas unidades de BRL valem 1 USD (ex: 5.0)
//   - Conversao native -> USD: usd = native / rate
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

  it('BRL com taxa 4 do user (1 USD = 4 BRL): 100 BRL -> 25 USD', () => {
    expect(normalizeBuyInToUSD(100, 'BRL', { BRL: 4 })).toBe(25);
  });

  it('BRL com taxa 5 do user (1 USD = 5 BRL): 22 BRL -> 4.4 USD', () => {
    expect(normalizeBuyInToUSD(22, 'BRL', { BRL: 5 })).toBeCloseTo(4.4, 5);
  });

  it('EUR com taxa 1.10 (1 USD = 1.10 EUR): 11 EUR -> 10 USD', () => {
    expect(normalizeBuyInToUSD(11, 'EUR', { EUR: 1.1 })).toBeCloseTo(10, 5);
  });
});

describe('normalizeBuyInToUSD - fallback (ADR-033)', () => {
  it('user nao tem chave BRL -> usa DEFAULT_EXCHANGE_RATES.BRL (5.0)', () => {
    expect(normalizeBuyInToUSD(100, 'BRL', {})).toBe(100 / DEFAULT_EXCHANGE_RATES.BRL);
  });

  it('user tem outras chaves mas nao BRL -> usa fallback', () => {
    expect(normalizeBuyInToUSD(100, 'BRL', { EUR: 1.1, USD: 1 })).toBe(100 / DEFAULT_EXCHANGE_RATES.BRL);
  });

  it('user_settings null/undefined -> usa fallback', () => {
    expect(normalizeBuyInToUSD(100, 'BRL', null as any)).toBe(100 / DEFAULT_EXCHANGE_RATES.BRL);
    expect(normalizeBuyInToUSD(100, 'BRL', undefined as any)).toBe(100 / DEFAULT_EXCHANGE_RATES.BRL);
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
  it('22 USD -> bucket "$16-29"', () => {
    expect(normalizeBucketRange(22)).toBe('$16-29');
  });

  it('5 USD -> bucket "$1-6"', () => {
    expect(normalizeBucketRange(5)).toBe('$1-6');
  });

  it('1 USD -> bucket "$1-6"', () => {
    expect(normalizeBucketRange(1)).toBe('$1-6');
  });

  it('300 USD -> bucket "$251-350"', () => {
    expect(normalizeBucketRange(300)).toBe('$251-350');
  });

  it('100 USD -> bucket "$71-130"', () => {
    expect(normalizeBucketRange(100)).toBe('$71-130');
  });
});

// ===========================================================================
// Cenario Q2: BRL e USD coexistindo no historico
// ===========================================================================

describe('historico misto BRL+USD normalizado (ADR-033)', () => {
  it('22 BRL e 4.4 USD apos normalizacao com taxa 5 ficam no MESMO bucket', () => {
    const usdFromBRL = normalizeBuyInToUSD(22, 'BRL', { BRL: 5 });
    expect(usdFromBRL).toBeCloseTo(4.4, 5);
    const bucketBRL = normalizeBucketRange(usdFromBRL); // ~4.4 USD
    const bucketUSD = normalizeBucketRange(4.4);
    expect(bucketBRL).toBe(bucketUSD);
  });

  it('110 BRL com taxa 5 = 22 USD; mesmo bucket que 22 USD direto', () => {
    const usdFromBRL = normalizeBuyInToUSD(110, 'BRL', { BRL: 5 });
    expect(usdFromBRL).toBeCloseTo(22, 5);
    expect(normalizeBucketRange(usdFromBRL)).toBe(normalizeBucketRange(22));
  });
});
