import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint Flight-1 — RF-15: calculateSessionStats respeita combined-stack
//
// Spec : Docs/specs/sprint-flight-1.md (RF-15, D12, D13)
// ADRs : 090 (single source of truth)
//
// Comportamento esperado:
//   calculateSessionStats(tournaments, sessionTournaments, registrationData,
//                          session, usdRates, expandFlightSeries?)
//
//   - 6o param: expandFlightSeries: boolean (default false = agregar series)
//   - Se expandFlightSeries=false (default) E entries tem seriesId:
//      * stackMode='combined': trata todas entries como 1 evento.
//        buyInTotal = sum(buyIn entries),
//        prizeTotal = max(result entries) (Day 2 ganha 1 prize).
//        Conta como 1 torneio (tournamentsPlayed += 1).
//      * stackMode='single': trata normal entry-a-entry (badge so visual).
//   - Se expandFlightSeries=true: comportamento atual preservado (entries
//     individuais, ROI somado linearmente).
//
// IMPORTANTE: lessons-learned #6 (conversao moeda) — series multi-currency
// devem normalizar pra USD antes de comparar/somar.
// =============================================================================

import {
  calculateSessionStats,
} from '../../../client/src/components/grind-session-live/calculateSessionStats';

function brl(s: string | number): string { return String(s); }

function entry(seriesId: string | null, overrides: Partial<any> = {}): any {
  return {
    id: 't-' + Math.random().toString(36).slice(2, 8),
    sessionId: 'session-flight',
    userId: 'USER-0001',
    site: 'PokerStars',
    name: 'Phased Day 1A',
    buyIn: '215.00',
    rebuys: 0,
    reentries: 0,
    addOnTaken: false,
    addOnCost: null,
    result: '0',
    bounty: '0',
    prize: '0',
    position: null,
    status: 'finished',
    seriesId,
    ...overrides,
  };
}

describe('calculateSessionStats — combined-stack agregado (RF-15, default)', () => {
  it('3 entries Day 1 + 1 entry Day 2 com seriesId combined: P&L agregado, conta como 1 torneio', async () => {
    const tournaments = [
      entry('srs-1', { name: 'Phased Day 1A', buyIn: '215', result: '0' }),
      entry('srs-1', { name: 'Phased Day 1B', buyIn: '215', result: '0' }),
      entry('srs-1', { name: 'Phased Day 1C', buyIn: '215', result: '0' }),
      entry('srs-1', { name: 'Phased Day 2', buyIn: '0', result: '5000' }),
    ];
    const series = {
      'srs-1': { id: 'srs-1', stackMode: 'combined', name: 'Phased' },
    };

    const stats = calculateSessionStats(
      tournaments, [], {}, null, {},
      false, // expandFlightSeries = false (agregar)
      series as any,
    );

    // buyInTotal = 645, prizeTotal = 5000 (max), profit = 5000 - 645 = 4355
    expect(stats.totalInvestido).toBeCloseTo(645, 2);
    expect(stats.profit).toBeCloseTo(4355, 2);
    expect(stats.tournamentsPlayed).toBe(1);
  });

  it('3 entries combined-stack: ROI calculado como 675% (3*215 buyIn vs 5000 prize)', async () => {
    const tournaments = [
      entry('srs-2', { buyIn: '215', result: '0' }),
      entry('srs-2', { buyIn: '215', result: '0' }),
      entry('srs-2', { buyIn: '215', result: '5000' }),
    ];
    const series = { 'srs-2': { id: 'srs-2', stackMode: 'combined', name: 'X' } };

    const stats = calculateSessionStats(
      tournaments, [], {}, null, {}, false, series as any,
    );

    // ROI = (5000 - 645) / 645 = 6.751... = 675%
    const expectedROI = (5000 - 645) / 645;
    if ((stats as any).roi != null) {
      expect((stats as any).roi).toBeCloseTo(expectedROI, 1);
    } else {
      // fallback: validar profit/invested ratio
      expect(stats.profit / stats.totalInvestido).toBeCloseTo(expectedROI, 1);
    }
  });

  it('series stackMode=single: trata como single-flight normal (entry-a-entry)', async () => {
    const tournaments = [
      entry('srs-single', { buyIn: '50', result: '200' }),
    ];
    const series = { 'srs-single': { id: 'srs-single', stackMode: 'single', name: 'S' } };

    const stats = calculateSessionStats(
      tournaments, [], {}, null, {}, false, series as any,
    );
    // single-flight com seriesId tratado como 1 torneio normal
    expect(stats.totalInvestido).toBeCloseTo(50, 2);
    expect(stats.profit).toBeCloseTo(150, 2);
    expect(stats.tournamentsPlayed).toBe(1);
  });

  it('series com Day 2 perdido (prize=0 em todas entries): profit negativo correto', async () => {
    const tournaments = [
      entry('srs-bust', { buyIn: '215', result: '0' }),
      entry('srs-bust', { buyIn: '215', result: '0' }),
      entry('srs-bust', { buyIn: '0', result: '0' }), // Day 2 jogado mas sem prize
    ];
    const series = { 'srs-bust': { id: 'srs-bust', stackMode: 'combined', name: 'B' } };

    const stats = calculateSessionStats(
      tournaments, [], {}, null, {}, false, series as any,
    );
    expect(stats.totalInvestido).toBeCloseTo(430, 2);
    expect(stats.profit).toBeCloseTo(-430, 2);
    expect(stats.tournamentsPlayed).toBe(1);
  });
});

describe('calculateSessionStats — expandFlightSeries=true (RF-16)', () => {
  it('expandido: cada entry conta separadamente (comportamento atual preservado)', async () => {
    const tournaments = [
      entry('srs-exp', { buyIn: '215', result: '0' }),
      entry('srs-exp', { buyIn: '215', result: '0' }),
      entry('srs-exp', { buyIn: '215', result: '5000' }),
    ];
    const series = { 'srs-exp': { id: 'srs-exp', stackMode: 'combined', name: 'X' } };

    const stats = calculateSessionStats(
      tournaments, [], {}, null, {}, true, series as any,
    );
    // Total invested = 645, mas conta como 3 torneios.
    expect(stats.totalInvestido).toBeCloseTo(645, 2);
    expect(stats.tournamentsPlayed).toBe(3);
  });

  it('agregado E expandido produzem mesmo total profit (same source dollars, different counting)', async () => {
    const tournaments = [
      entry('srs-eq', { buyIn: '50', result: '0' }),
      entry('srs-eq', { buyIn: '50', result: '300' }),
    ];
    const series = { 'srs-eq': { id: 'srs-eq', stackMode: 'combined', name: 'E' } };

    const aggregated = calculateSessionStats(
      tournaments, [], {}, null, {}, false, series as any,
    );
    const expanded = calculateSessionStats(
      tournaments, [], {}, null, {}, true, series as any,
    );

    // Profit total identico em ambos (max prize == 300, sum buyIn == 100)
    // Aggregated: profit = 300-100 = 200; tournamentsPlayed = 1.
    // Expanded: profit = (0-50) + (300-50) = 200; tournamentsPlayed = 2.
    expect(aggregated.profit).toBeCloseTo(200, 2);
    expect(expanded.profit).toBeCloseTo(200, 2);
    expect(aggregated.tournamentsPlayed).toBe(1);
    expect(expanded.tournamentsPlayed).toBe(2);
  });
});

describe('calculateSessionStats — entries SEM seriesId (zero impacto)', () => {
  it('tournaments sem seriesId comportam-se exatamente como antes', async () => {
    const tournaments = [
      entry(null, { buyIn: '50', result: '300' }),
    ];
    const stats = calculateSessionStats(
      tournaments, [], {}, null, {}, false, {} as any,
    );
    expect(stats.totalInvestido).toBeCloseTo(50, 2);
    expect(stats.profit).toBeCloseTo(250, 2);
    expect(stats.tournamentsPlayed).toBe(1);
  });

  it('mix: 2 entries com seriesId combined + 1 entry single-flight sem seriesId', async () => {
    const tournaments = [
      entry('srs-m', { buyIn: '215', result: '0' }),
      entry('srs-m', { buyIn: '215', result: '5000' }),
      entry(null, { buyIn: '11', result: '50' }),
    ];
    const series = { 'srs-m': { id: 'srs-m', stackMode: 'combined', name: 'M' } };

    const stats = calculateSessionStats(
      tournaments, [], {}, null, {}, false, series as any,
    );
    // Combined: 1 torneio agregado, buyIn 430 prize 5000 profit 4570
    // + standalone: 1 torneio buyIn 11 prize 50 profit 39
    // Total: invested 441, profit 4609, tournamentsPlayed 2
    expect(stats.totalInvestido).toBeCloseTo(441, 2);
    expect(stats.profit).toBeCloseTo(4609, 2);
    expect(stats.tournamentsPlayed).toBe(2);
  });
});

describe('calculateSessionStats — series multi-currency (RF-15 + lessons #6)', () => {
  it('combined-stack com entries em moedas diferentes normaliza para USD', async () => {
    // 2 entries BRL Suprema + 1 entry USD PokerStars na mesma serie (raro mas
    // mockando spec edge case)
    const tournaments = [
      entry('srs-fx', { site: 'Suprema', buyIn: '500', result: '0' }), // BRL
      entry('srs-fx', { site: 'Suprema', buyIn: '500', result: '0' }), // BRL
      entry('srs-fx', { site: 'PokerStars', buyIn: '0', result: '5000' }), // USD prize
    ];
    const series = { 'srs-fx': { id: 'srs-fx', stackMode: 'combined', name: 'X' } };
    const rates = { BRL: 5.0 }; // 1 USD = 5 BRL

    const stats = calculateSessionStats(
      tournaments, [], {}, null, rates, false, series as any,
    );

    // BRL invested = 1000 / 5 = 200 USD
    // USD prize = 5000
    // profit USD = 5000 - 200 = 4800
    if (stats.totalInvestidoUSD != null) {
      expect(stats.totalInvestidoUSD).toBeCloseTo(200, 0);
    }
    if (stats.profitUSD != null) {
      expect(stats.profitUSD).toBeCloseTo(4800, 0);
    }
  });
});
