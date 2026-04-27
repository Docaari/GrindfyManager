/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *  - RF-02: conversao via exchangeRates
 *  - ADR-033: convencao "1 USD vale N native units"
 *  - native -> USD: usd = native / rate
 *  - USD -> native: native = usd * rate
 *
 * Helper que sera exportado pelo implementer (NAO existe ainda):
 *   client/src/lib/session-end/convertToNativeCurrency.ts
 *     - convertToNativeCurrency(
 *         amount: number,
 *         fromCurrency: string,
 *         toCurrency: string,
 *         exchangeRates: Record<string, number>
 *       ): number
 *
 * Comportamento:
 *  - same currency -> identidade
 *  - rate ausente / invalido (NaN/Inf/<=0) -> 0 deterministico
 */

import { describe, it, expect } from 'vitest';
import { convertToNativeCurrency } from '../convertToNativeCurrency';

describe('convertToNativeCurrency — same currency identity (RF-02)', () => {
  it('USD -> USD -> identidade', () => {
    expect(convertToNativeCurrency(100, 'USD', 'USD', {})).toBeCloseTo(100, 6);
  });

  it('BRL -> BRL -> identidade', () => {
    expect(convertToNativeCurrency(250, 'BRL', 'BRL', {})).toBeCloseTo(250, 6);
  });
});

describe('convertToNativeCurrency — USD -> outras moedas (ADR-033)', () => {
  it('USD -> BRL com rate=5 -> 100 USD = 500 BRL (1 USD vale 5 BRL)', () => {
    expect(convertToNativeCurrency(100, 'USD', 'BRL', { BRL: 5.0 })).toBeCloseTo(500, 2);
  });

  it('USD -> EUR com rate=0.92 -> 100 USD = 92 EUR', () => {
    expect(convertToNativeCurrency(100, 'USD', 'EUR', { EUR: 0.92 })).toBeCloseTo(92, 2);
  });

  it('USD -> CNY com rate=7.25 -> 10 USD = 72.5 CNY', () => {
    expect(convertToNativeCurrency(10, 'USD', 'CNY', { CNY: 7.25 })).toBeCloseTo(72.5, 2);
  });
});

describe('convertToNativeCurrency — outras -> USD (inversao ADR-033)', () => {
  it('BRL -> USD com rate=5 -> 500 BRL = 100 USD (native / rate)', () => {
    expect(convertToNativeCurrency(500, 'BRL', 'USD', { BRL: 5.0 })).toBeCloseTo(100, 2);
  });

  it('EUR -> USD com rate=0.92 -> 92 EUR = 100 USD', () => {
    expect(convertToNativeCurrency(92, 'EUR', 'USD', { EUR: 0.92 })).toBeCloseTo(100, 2);
  });
});

describe('convertToNativeCurrency — fallback rate ausente -> 0 (ADR-033)', () => {
  it('rate ausente para fromCurrency -> 0', () => {
    expect(convertToNativeCurrency(100, 'XYZ', 'USD', {})).toBe(0);
  });

  it('rate ausente para toCurrency (nao USD) -> 0', () => {
    expect(convertToNativeCurrency(100, 'USD', 'XYZ', {})).toBe(0);
  });
});

describe('convertToNativeCurrency — rates invalidos -> 0 deterministico', () => {
  it('rate=NaN -> 0', () => {
    expect(convertToNativeCurrency(100, 'USD', 'BRL', { BRL: NaN })).toBe(0);
  });

  it('rate=Infinity -> 0', () => {
    expect(convertToNativeCurrency(100, 'USD', 'BRL', { BRL: Infinity })).toBe(0);
  });

  it('rate=0 -> 0 (evita divisao por zero quando inversao)', () => {
    expect(convertToNativeCurrency(100, 'BRL', 'USD', { BRL: 0 })).toBe(0);
  });

  it('rate negativo -> 0', () => {
    expect(convertToNativeCurrency(100, 'USD', 'BRL', { BRL: -5 })).toBe(0);
  });
});

describe('convertToNativeCurrency — currency desconhecida e amount=0', () => {
  it('amount=0 -> 0 sem importar moedas', () => {
    expect(convertToNativeCurrency(0, 'USD', 'BRL', { BRL: 5 })).toBe(0);
  });

  it('amount negativo (saida) -> resultado negativo proporcional', () => {
    expect(convertToNativeCurrency(-50, 'USD', 'BRL', { BRL: 5 })).toBeCloseTo(-250, 2);
  });
});

describe('convertToNativeCurrency — non-USD -> non-USD (cross conversion)', () => {
  it('BRL -> EUR via USD: 500 BRL @ rate 5 = 100 USD; 100 USD @ rate EUR=0.92 = 92 EUR', () => {
    expect(
      convertToNativeCurrency(500, 'BRL', 'EUR', { BRL: 5.0, EUR: 0.92 }),
    ).toBeCloseTo(92, 2);
  });
});
