/**
 * Tests for `computeBreakdowns` helper (NOVO arquivo).
 *
 * Sprint Grind-Cards-Reform v2 — CA-13/14/15 + §3.1 + §4.4.
 *
 * Espera-se que `client/src/components/grind-session/breakdownHelpers.ts`
 * exporte `computeBreakdowns(tournaments, usdConversionRates)` retornando
 * 3 arrays de buckets (types fixos, speeds fixos, platforms dinamicos).
 *
 * `BreakdownBucket` deve estar em `client/src/components/grind-session/types.ts`:
 *   { key, label, count, percentage, totalProfitUsd, totalInvestedUsd, roi, colorHex? }
 *
 * Convencoes:
 * - tournaments com `currency` USD nao requerem rate.
 * - tournaments BRL precisam de `usdConversionRates['BRL']` (USD->BRL rate).
 *   Ex: rate 5 -> R$50 = $10 USD.
 * - `speed = null/undefined/''` agrega em Normal (default fallback).
 * - `type` invalido (nao em TOURNAMENT_PRIMARY_TYPES) NAO agrega em nenhum
 *   bucket de tipo, mas conta no denominador do percentage.
 * - Site desconhecido cai em bucket 'Outras'.
 * - Empate em count em platforms => ordem alfabetica do network.
 * - ROI = profit / invested * 100; null quando invested=0.
 */

import { describe, it, expect } from 'vitest';
import { computeBreakdowns } from '../../../client/src/components/grind-session/breakdownHelpers';
import type { BreakdownBucket } from '../../../client/src/components/grind-session/types';

// Helpers --------------------------------------------------------------------

function tour(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    id: overrides.id ?? `t-${Math.random().toString(36).slice(2, 8)}`,
    type: 'Vanilla',
    speed: 'Normal',
    site: 'PokerStars',
    currency: 'USD',
    buyIn: 22,
    reentries: 0,
    profit: 0,
    ...overrides,
  };
}

const NO_RATES: Record<string, number> = {};
const BRL5: Record<string, number> = { BRL: 5 }; // 1 USD = 5 BRL

// =============================================================================
// types breakdown (5 fixed buckets)
// =============================================================================

describe('computeBreakdowns — types (5 fixed buckets)', () => {
  it('empty array -> 5 buckets all zero, ordem fixa, percentage=0, profit=0, invested=0, roi=null', () => {
    const result = computeBreakdowns([], NO_RATES);
    expect(result.types).toHaveLength(5);

    const expectedOrder = ['Vanilla', 'PKO', 'Mystery', 'Satellite', 'Add-on'];
    expect(result.types.map((b) => b.key)).toEqual(expectedOrder);

    for (const bucket of result.types) {
      expect(bucket.count).toBe(0);
      expect(bucket.percentage).toBe(0);
      expect(bucket.totalProfitUsd).toBe(0);
      expect(bucket.totalInvestedUsd).toBe(0);
      expect(bucket.roi).toBeNull();
    }
  });

  it('mix 4V + 2PKO + 1M + 1Sat + 2Add-on (10) USD-only -> percentages 40/20/10/10/20', () => {
    const tournaments = [
      ...Array.from({ length: 4 }, (_, i) => tour({ id: `v${i}`, type: 'Vanilla' })),
      ...Array.from({ length: 2 }, (_, i) => tour({ id: `p${i}`, type: 'PKO' })),
      tour({ id: 'm0', type: 'Mystery' }),
      tour({ id: 's0', type: 'Satellite' }),
      ...Array.from({ length: 2 }, (_, i) => tour({ id: `a${i}`, type: 'Add-on' })),
    ];
    const result = computeBreakdowns(tournaments, NO_RATES);

    const byKey = (k: string) => result.types.find((b) => b.key === k) as BreakdownBucket;
    expect(byKey('Vanilla').count).toBe(4);
    expect(byKey('Vanilla').percentage).toBeCloseTo(40, 1);
    expect(byKey('PKO').count).toBe(2);
    expect(byKey('PKO').percentage).toBeCloseTo(20, 1);
    expect(byKey('Mystery').count).toBe(1);
    expect(byKey('Mystery').percentage).toBeCloseTo(10, 1);
    expect(byKey('Satellite').count).toBe(1);
    expect(byKey('Satellite').percentage).toBeCloseTo(10, 1);
    expect(byKey('Add-on').count).toBe(2);
    expect(byKey('Add-on').percentage).toBeCloseTo(20, 1);
  });

  it('type invalido (Foo) nao agrega em nenhum bucket, mas conta no denominador', () => {
    const tournaments = [
      tour({ id: 'v', type: 'Vanilla' }),
      tour({ id: 'foo', type: 'Foo' }),
    ];
    const result = computeBreakdowns(tournaments, NO_RATES);

    const byKey = (k: string) => result.types.find((b) => b.key === k) as BreakdownBucket;
    expect(byKey('Vanilla').count).toBe(1);
    expect(byKey('Vanilla').percentage).toBeCloseTo(50, 1); // 1 / 2 total
    expect(byKey('PKO').count).toBe(0);
    expect(byKey('Mystery').count).toBe(0);
    expect(byKey('Satellite').count).toBe(0);
    expect(byKey('Add-on').count).toBe(0);
  });

  it('agrega totalProfitUsd corretamente (USD only)', () => {
    const tournaments = [
      tour({ id: 'a', type: 'Vanilla', profit: 10, buyIn: 22 }),
      tour({ id: 'b', type: 'Vanilla', profit: 10, buyIn: 22 }),
    ];
    const result = computeBreakdowns(tournaments, NO_RATES);
    const vanilla = result.types.find((b) => b.key === 'Vanilla') as BreakdownBucket;
    expect(vanilla.totalProfitUsd).toBeCloseTo(20, 2);
  });

  it('investedUsd = buyIn * (1 + reentries) — USD', () => {
    const tournaments = [
      tour({ id: 'a', type: 'Vanilla', buyIn: 22, reentries: 1, profit: 0 }),
    ];
    const result = computeBreakdowns(tournaments, NO_RATES);
    const vanilla = result.types.find((b) => b.key === 'Vanilla') as BreakdownBucket;
    expect(vanilla.totalInvestedUsd).toBeCloseTo(44, 2); // 22 * 2
  });

  it('FX BRL -> USD: site BRL com BI=R$110 + 1 reentry @ rate 5 -> $44 invested', () => {
    const tournaments = [
      tour({
        id: 'br',
        type: 'Vanilla',
        site: 'Suprema',
        currency: 'BRL',
        buyIn: 110,
        reentries: 1,
        profit: 0,
      }),
    ];
    const result = computeBreakdowns(tournaments, BRL5);
    const vanilla = result.types.find((b) => b.key === 'Vanilla') as BreakdownBucket;
    // R$110 * 2 = R$220 / 5 = $44
    expect(vanilla.totalInvestedUsd).toBeCloseTo(44, 2);
  });

  it('ROI = profit / invested * 100', () => {
    const tournaments = [
      tour({ id: 'a', type: 'Vanilla', buyIn: 100, reentries: 0, profit: 10 }),
    ];
    const result = computeBreakdowns(tournaments, NO_RATES);
    const vanilla = result.types.find((b) => b.key === 'Vanilla') as BreakdownBucket;
    // profit 10 / invested 100 * 100 = 10%
    expect(vanilla.roi).toBeCloseTo(10, 1);
  });

  it('ROI = null quando invested = 0 (e profit = 0)', () => {
    // Bucket sem nenhum torneio -> invested=0, profit=0, roi=null
    const result = computeBreakdowns([], NO_RATES);
    for (const bucket of result.types) {
      expect(bucket.roi).toBeNull();
    }
  });

  it('label PT-BR via TYPE_LABELS_PT_BR', () => {
    const result = computeBreakdowns([], NO_RATES);
    const pko = result.types.find((b) => b.key === 'PKO') as BreakdownBucket;
    const mystery = result.types.find((b) => b.key === 'Mystery') as BreakdownBucket;
    const satellite = result.types.find((b) => b.key === 'Satellite') as BreakdownBucket;
    expect(pko.label).toBe('PKO (Bounty)');
    expect(mystery.label).toBe('Mystery Bounty');
    expect(satellite.label).toBe('Satélite');
  });

  it('colorHex preenchido via TYPE_COLORS[key].hex', () => {
    const result = computeBreakdowns([], NO_RATES);
    const vanilla = result.types.find((b) => b.key === 'Vanilla') as BreakdownBucket;
    const pko = result.types.find((b) => b.key === 'PKO') as BreakdownBucket;
    expect(vanilla.colorHex).toBe('#71717a');
    expect(pko.colorHex).toBe('#a78bfa');
  });

  it('addOnTaken=true vence type=Vanilla -> bucket Add-on', () => {
    const tournaments = [
      tour({ id: 'a', type: 'Vanilla', addOnTaken: true }),
      tour({ id: 'b', type: 'Vanilla', addOnTaken: false }),
    ];
    const result = computeBreakdowns(tournaments, NO_RATES);
    const byKey = (k: string) => result.types.find((b) => b.key === k) as BreakdownBucket;
    expect(byKey('Add-on').count).toBe(1);
    expect(byKey('Vanilla').count).toBe(1);
  });

  it('addOnTaken=true vence type=PKO -> bucket Add-on (mutex)', () => {
    const tournaments = [
      tour({ id: 'a', type: 'PKO', addOnTaken: true }),
      tour({ id: 'b', type: 'PKO' }),
    ];
    const result = computeBreakdowns(tournaments, NO_RATES);
    const byKey = (k: string) => result.types.find((b) => b.key === k) as BreakdownBucket;
    expect(byKey('Add-on').count).toBe(1);
    expect(byKey('PKO').count).toBe(1);
  });
});

// =============================================================================
// speed breakdown (3 fixed buckets)
// =============================================================================

describe('computeBreakdowns — speeds (3 fixed buckets)', () => {
  it('empty -> 3 buckets vazios na ordem Normal/Turbo/Hyper', () => {
    const result = computeBreakdowns([], NO_RATES);
    expect(result.speeds).toHaveLength(3);
    expect(result.speeds.map((b) => b.key)).toEqual(['Normal', 'Turbo', 'Hyper']);
    for (const bucket of result.speeds) {
      expect(bucket.count).toBe(0);
      expect(bucket.percentage).toBe(0);
      expect(bucket.roi).toBeNull();
    }
  });

  it('5 Normal + 3 Turbo + 2 Hyper -> 50/30/20', () => {
    const tournaments = [
      ...Array.from({ length: 5 }, (_, i) => tour({ id: `n${i}`, speed: 'Normal' })),
      ...Array.from({ length: 3 }, (_, i) => tour({ id: `t${i}`, speed: 'Turbo' })),
      ...Array.from({ length: 2 }, (_, i) => tour({ id: `h${i}`, speed: 'Hyper' })),
    ];
    const result = computeBreakdowns(tournaments, NO_RATES);
    const byKey = (k: string) => result.speeds.find((b) => b.key === k) as BreakdownBucket;
    expect(byKey('Normal').count).toBe(5);
    expect(byKey('Normal').percentage).toBeCloseTo(50, 1);
    expect(byKey('Turbo').count).toBe(3);
    expect(byKey('Turbo').percentage).toBeCloseTo(30, 1);
    expect(byKey('Hyper').count).toBe(2);
    expect(byKey('Hyper').percentage).toBeCloseTo(20, 1);
  });

  it('speed null OU "" agrega em Normal (default fallback)', () => {
    const tournaments = [
      tour({ id: 'a', speed: null }),
      tour({ id: 'b', speed: '' }),
      tour({ id: 'c', speed: 'Normal' }),
    ];
    const result = computeBreakdowns(tournaments, NO_RATES);
    const byKey = (k: string) => result.speeds.find((b) => b.key === k) as BreakdownBucket;
    expect(byKey('Normal').count).toBe(3);
    expect(byKey('Turbo').count).toBe(0);
    expect(byKey('Hyper').count).toBe(0);
  });

  it('FX-aware profit: site BRL com profit=R$50 + rate 5 -> $10 USD', () => {
    const tournaments = [
      tour({
        id: 'br',
        speed: 'Turbo',
        site: 'Suprema',
        currency: 'BRL',
        profit: 50,
        buyIn: 0,
      }),
    ];
    const result = computeBreakdowns(tournaments, BRL5);
    const turbo = result.speeds.find((b) => b.key === 'Turbo') as BreakdownBucket;
    expect(turbo.totalProfitUsd).toBeCloseTo(10, 2);
  });

  it('ROI Turbo = profit/invested * 100', () => {
    const tournaments = [
      tour({ id: 'a', speed: 'Turbo', buyIn: 50, reentries: 0, profit: 5 }),
    ];
    const result = computeBreakdowns(tournaments, NO_RATES);
    const turbo = result.speeds.find((b) => b.key === 'Turbo') as BreakdownBucket;
    expect(turbo.roi).toBeCloseTo(10, 1);
  });
});

// =============================================================================
// platforms breakdown (dynamic N buckets)
// =============================================================================

describe('computeBreakdowns — platforms (dynamic N buckets)', () => {
  it('empty -> array vazio', () => {
    const result = computeBreakdowns([], NO_RATES);
    expect(result.platforms).toEqual([]);
  });

  it('3 ACR + 2 GGPoker + 1 PokerStars -> ordem descending por count', () => {
    const tournaments = [
      ...Array.from({ length: 3 }, (_, i) => tour({ id: `a${i}`, site: 'ACR' })),
      ...Array.from({ length: 2 }, (_, i) => tour({ id: `g${i}`, site: 'GGPoker' })),
      tour({ id: 'p0', site: 'PokerStars' }),
    ];
    const result = computeBreakdowns(tournaments, NO_RATES);
    expect(result.platforms.map((b) => b.key)).toEqual(['WPN', 'GGNetwork', 'PokerStars']);
    expect(result.platforms[0].count).toBe(3);
    expect(result.platforms[1].count).toBe(2);
    expect(result.platforms[2].count).toBe(1);
  });

  it('empate em count -> ordem alfabetica do network', () => {
    const tournaments = [
      ...Array.from({ length: 2 }, (_, i) => tour({ id: `a${i}`, site: 'ACR' })),
      ...Array.from({ length: 2 }, (_, i) => tour({ id: `g${i}`, site: 'GGPoker' })),
    ];
    const result = computeBreakdowns(tournaments, NO_RATES);
    // GGNetwork < WPN alfabeticamente
    expect(result.platforms.map((b) => b.key)).toEqual(['GGNetwork', 'WPN']);
  });

  it('site desconhecido SuperPoker -> bucket Outras', () => {
    const tournaments = [tour({ id: 'x', site: 'SuperPoker' })];
    const result = computeBreakdowns(tournaments, NO_RATES);
    expect(result.platforms.map((b) => b.key)).toEqual(['Outras']);
    expect(result.platforms[0].count).toBe(1);
  });

  it('FX-aware profit: 1 site BRL + profit=R$50 + rate 5 -> totalProfitUsd=10', () => {
    const tournaments = [
      tour({
        id: 'br',
        site: 'Suprema',
        currency: 'BRL',
        profit: 50,
        buyIn: 0,
      }),
    ];
    const result = computeBreakdowns(tournaments, BRL5);
    const suprema = result.platforms.find((b) => b.key === 'Suprema') as BreakdownBucket;
    expect(suprema).toBeDefined();
    expect(suprema.totalProfitUsd).toBeCloseTo(10, 2);
  });

  it('soma das percentages = 100% (tolerancia 0.5)', () => {
    const tournaments = [
      ...Array.from({ length: 3 }, (_, i) => tour({ id: `a${i}`, site: 'ACR' })),
      ...Array.from({ length: 2 }, (_, i) => tour({ id: `g${i}`, site: 'GGPoker' })),
      tour({ id: 'p', site: 'PokerStars' }),
    ];
    const result = computeBreakdowns(tournaments, NO_RATES);
    const sum = result.platforms.reduce((acc, b) => acc + b.percentage, 0);
    expect(sum).toBeGreaterThanOrEqual(99.5);
    expect(sum).toBeLessThanOrEqual(100.5);
  });

  it('label da plataforma reflete a chave do network', () => {
    const tournaments = [tour({ id: 'a', site: 'ACR' })];
    const result = computeBreakdowns(tournaments, NO_RATES);
    expect(result.platforms[0].label).toBe('WPN');
  });
});
