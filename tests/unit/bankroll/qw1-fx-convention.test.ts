import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: QW-1 RF-02 — DEFAULT_EXCHANGE_RATES na nova convencao
//
// Spec: Docs/specs/bankroll-v2-qw1-fix-exchange-rates.md (RF-02)
// ADR-033: rates[ccy] = quantas unidades de ccy equivalem a 1 USD
//
// VALORES NOVOS (referencia 2026-04-25):
//   USD: 1.0
//   BRL: 5.0
//   EUR: 0.92
//   GBP: 0.78
//   CNY: 7.20
//   USDT: 1.0
//   BTC: 0.000015 (~ 1 USD em BTC)
// =============================================================================

import { DEFAULT_EXCHANGE_RATES } from '../../../server/scoring/scoringConstants';

describe('QW-1 RF-02: DEFAULT_EXCHANGE_RATES na nova convencao (units per USD)', () => {
  it('USD = 1.0 (sempre)', () => {
    expect(DEFAULT_EXCHANGE_RATES.USD).toBe(1.0);
  });

  it('BRL = 5.0 (1 USD vale 5 BRL)', () => {
    expect(DEFAULT_EXCHANGE_RATES.BRL).toBe(5.0);
  });

  it('EUR = 0.92 (1 USD vale 0.92 EUR)', () => {
    expect(DEFAULT_EXCHANGE_RATES.EUR).toBe(0.92);
  });

  it('GBP = 0.78', () => {
    expect(DEFAULT_EXCHANGE_RATES.GBP).toBe(0.78);
  });

  it('CNY = 7.20', () => {
    expect(DEFAULT_EXCHANGE_RATES.CNY).toBe(7.20);
  });

  it('USDT = 1.0 (paridade stable assumida)', () => {
    expect(DEFAULT_EXCHANGE_RATES.USDT).toBe(1.0);
  });

  it('BTC esta presente (nova convencao: BTC < 1 USD significa fracao de BTC por USD)', () => {
    // BTC=0.000015 ~ "1 USD vale 0.000015 BTC". Implementer pode optar
    // por valor diferente, mas deve ser < 1 e > 0.
    expect(DEFAULT_EXCHANGE_RATES.BTC).toBeGreaterThan(0);
    expect(DEFAULT_EXCHANGE_RATES.BTC).toBeLessThan(1);
  });

  it('mantem >= 6 moedas suportadas (sem remocao)', () => {
    const keys = Object.keys(DEFAULT_EXCHANGE_RATES);
    expect(keys.length).toBeGreaterThanOrEqual(6);
  });

  it('NENHUMA moeda fiat major fica < 1 (deteccao de regressao da convencao antiga)', () => {
    // BRL=0.20, EUR=1.10 etc seriam convencao antiga. Apos QW-1, fiat majors
    // ja convertidas devem ser >= 0.5 (BRL/CNY/EUR/GBP). Cripto ainda fica <1.
    const fiatMajors = ['BRL', 'CNY', 'GBP'];
    for (const ccy of fiatMajors) {
      const rate = DEFAULT_EXCHANGE_RATES[ccy];
      if (rate != null) {
        expect(rate).toBeGreaterThanOrEqual(0.5);
      }
    }
  });
});

describe('QW-1 RF-02: comentario do arquivo referencia ADR-033', () => {
  it('scoringConstants.ts contem comentario sobre ADR-033 ou "ccy units per 1 USD"', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../server/scoring/scoringConstants.ts'),
      'utf8',
    );
    expect(source).toMatch(/ccy units per 1 USD|ADR-033|units per/i);
  });
});
