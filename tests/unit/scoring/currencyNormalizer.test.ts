import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: QW-1 — Fix Bug exchangeRates Inconsistente
//
// Spec: Docs/specs/bankroll-v2-qw1-fix-exchange-rates.md (RF-01)
// ADR-033: convencao FX `units per 1 USD` (rates[ccy] = N -> 1 USD vale N ccy)
//
// CONVENCAO NOVA:
//   - exchangeRates[ccy] = N significa "1 USD = N unidades de ccy"
//   - native -> USD:  usd = native / rate
//   - USD -> native:  native = usd * rate
//
// Esta suite SUBSTITUI tests/unit/scoring/normalizer.test.ts (legado, convencao
// antiga). O legado ainda existe enquanto o codigo nao e refatorado, mas estes
// novos testes definem o comportamento correto pos-QW-1.
// =============================================================================

import {
  normalizeBuyInToUSD,
  normalizeBucketRange,
  bucketizeBuyIn,
} from '../../../server/scoring/currencyNormalizer';
import { DEFAULT_EXCHANGE_RATES } from '../../../server/scoring/scoringConstants';

describe('QW-1 RF-01: normalizeBuyInToUSD - nova convencao (usd = native / rate)', () => {
  it('100 BRL com BRL=5.0 -> 20 USD', () => {
    expect(normalizeBuyInToUSD(100, 'BRL', { BRL: 5.0 })).toBeCloseTo(20, 5);
  });

  it('100 USD com qualquer rate -> 100 USD (no-op idempotente)', () => {
    expect(normalizeBuyInToUSD(100, 'USD', {})).toBe(100);
    expect(normalizeBuyInToUSD(100, 'USD', { USD: 1.0, BRL: 5.0 })).toBe(100);
  });

  it('100 USDT com USDT=1.0 -> 100 USD (paridade stable)', () => {
    expect(normalizeBuyInToUSD(100, 'USDT', { USDT: 1.0 })).toBe(100);
  });

  it('1 EUR com EUR=0.92 -> ~1.087 USD', () => {
    expect(normalizeBuyInToUSD(1, 'EUR', { EUR: 0.92 })).toBeCloseTo(1.087, 2);
  });

  it('100 BRL com user sem rate -> usa DEFAULT_EXCHANGE_RATES (BRL=5.0 nova convencao)', () => {
    // Apos QW-1, DEFAULT_EXCHANGE_RATES.BRL = 5.0 -> 100/5 = 20 USD
    expect(normalizeBuyInToUSD(100, 'BRL', {})).toBeCloseTo(20, 5);
    expect(normalizeBuyInToUSD(100, 'BRL', null as any)).toBeCloseTo(20, 5);
    expect(normalizeBuyInToUSD(100, 'BRL', undefined as any)).toBeCloseTo(20, 5);
  });

  it('rate user override beats default: 100 BRL com BRL=4.5 -> ~22.22 USD', () => {
    expect(normalizeBuyInToUSD(100, 'BRL', { BRL: 4.5 })).toBeCloseTo(22.22, 1);
  });
});

describe('QW-1 RF-01: edge cases — rates invalidos retornam 0 (sem crash)', () => {
  it('rate=0 nao causa divisao por zero -> retorna 0', () => {
    expect(normalizeBuyInToUSD(100, 'BRL', { BRL: 0 })).toBe(0);
  });

  it('rate negativo -> retorna 0', () => {
    expect(normalizeBuyInToUSD(100, 'BRL', { BRL: -1 })).toBe(0);
  });

  it('rate como string (NaN apos conversao) -> retorna 0', () => {
    expect(normalizeBuyInToUSD(100, 'BRL', { BRL: 'nao-numero' as any })).toBe(0);
  });

  it('rate NaN explicito -> retorna 0', () => {
    expect(normalizeBuyInToUSD(100, 'BRL', { BRL: Number.NaN })).toBe(0);
  });

  it('rate Infinity -> retorna 0 (defensive)', () => {
    expect(normalizeBuyInToUSD(100, 'BRL', { BRL: Number.POSITIVE_INFINITY })).toBe(0);
  });

  it('moeda completamente desconhecida (sem default) -> retorna 0', () => {
    expect(normalizeBuyInToUSD(100, 'ZZZ', {})).toBe(0);
  });

  it('currency vazio/null/undefined -> trata como USD (no-op)', () => {
    expect(normalizeBuyInToUSD(22, '' as any, {})).toBe(22);
    expect(normalizeBuyInToUSD(22, null as any, {})).toBe(22);
    expect(normalizeBuyInToUSD(22, undefined as any, {})).toBe(22);
  });
});

describe('QW-1 RF-01: cross-validation round-trip (native -> USD -> native)', () => {
  // Para cada moeda nas defaults: round-trip deve fechar com erro relativo <= 0.001.
  it.each([
    ['BRL', 100, 5.0],
    ['EUR', 100, 0.92],
    ['GBP', 100, 0.78],
    ['CNY', 100, 7.20],
    ['USDT', 100, 1.0],
  ])('%s round-trip: 100 native -> USD -> native fecha em <=0.001 erro relativo', (ccy, amount, rate) => {
    const usd = normalizeBuyInToUSD(amount, ccy, { [ccy]: rate });
    // USD -> native: native = usd * rate
    const back = usd * rate;
    const relErr = Math.abs(back - amount) / amount;
    expect(relErr).toBeLessThanOrEqual(0.001);
  });

  it('BRL 22 -> USD com BRL=5.0 -> 4.4 USD; multiplicar por 5 volta para 22', () => {
    const usd = normalizeBuyInToUSD(22, 'BRL', { BRL: 5.0 });
    expect(usd).toBeCloseTo(4.4, 5);
    const back = usd * 5.0;
    expect(back).toBeCloseTo(22, 5);
  });
});

describe('QW-1 RF-01: comentario JSDoc na convencao (validacao soft via runtime check)', () => {
  it('arquivo currencyNormalizer.ts contem comentario "ccy units per 1 USD"', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../server/scoring/currencyNormalizer.ts'),
      'utf8',
    );
    expect(source).toMatch(/ccy units per 1 USD|ADR-033/);
  });
});

// ===========================================================================
// normalizeBucketRange — alinhado com BUYIN_BUCKETS (sem mudanca pos-QW-1)
// ===========================================================================

describe('QW-1: normalizeBucketRange continua alinhado com BUYIN_BUCKETS', () => {
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
});

// ===========================================================================
// bucketizeBuyIn — usado internamente pelo Tournament Selector
// ===========================================================================

describe('QW-1: bucketizeBuyIn usa nova convencao internamente', () => {
  it('110 BRL com BRL=5.0 -> 22 USD -> bucket "$16-29"', () => {
    const r = bucketizeBuyIn(110, 'BRL', { BRL: 5.0 });
    expect(r.usd).toBeCloseTo(22, 5);
    expect(r.bucket).toBe('$16-29');
  });

  it('22 BRL com BRL=5.0 -> 4.4 USD -> bucket "$1-6"', () => {
    const r = bucketizeBuyIn(22, 'BRL', { BRL: 5.0 });
    expect(r.usd).toBeCloseTo(4.4, 5);
    expect(r.bucket).toBe('$1-6');
  });

  it('aceita amount como string', () => {
    const r = bucketizeBuyIn('110' as any, 'BRL', { BRL: 5.0 });
    expect(r.usd).toBeCloseTo(22, 5);
  });
});

// ===========================================================================
// Cenario Q2 atualizado: BRL e USD coexistindo no historico, NOVA convencao
// ===========================================================================

describe('QW-1 historico misto BRL+USD na nova convencao', () => {
  it('22 BRL (BRL=5.0) -> 4.4 USD; mesmo bucket que 4.4 USD direto', () => {
    const usdFromBRL = normalizeBuyInToUSD(22, 'BRL', { BRL: 5.0 });
    expect(usdFromBRL).toBeCloseTo(4.4, 5);
    expect(normalizeBucketRange(usdFromBRL)).toBe(normalizeBucketRange(4.4));
  });

  it('110 BRL (BRL=5.0) = 22 USD; mesmo bucket que 22 USD direto', () => {
    const usdFromBRL = normalizeBuyInToUSD(110, 'BRL', { BRL: 5.0 });
    expect(usdFromBRL).toBeCloseTo(22, 5);
    expect(normalizeBucketRange(usdFromBRL)).toBe(normalizeBucketRange(22));
  });
});
