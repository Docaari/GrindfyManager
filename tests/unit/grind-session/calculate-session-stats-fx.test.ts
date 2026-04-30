import { describe, it, expect } from 'vitest';

// =============================================================================
// FX bug fix: calculateSessionStats deve converter buy-in/result/bounty/addOn
// para USD com base no site (BRL p/ Suprema, EUR p/ iPoker, etc).
//
// Reportado: usuario inseriu R$53,00 em torneio Suprema; profit foi tratado
// como -266 USD em vez de converter via rate. Bug raiz: 5o argumento
// usdConversionRates era ignorado pela funcao (4-arity).
// =============================================================================

import {
  calculateSessionStats,
  calculateFinalSessionStats,
} from '../../../client/src/components/grind-session-live/calculateSessionStats';

function brlSupremaTournament(overrides: Partial<any> = {}): any {
  return {
    id: 't-suprema-' + Math.random().toString(36).slice(2, 8),
    sessionId: 'session-fx',
    userId: 'USER-0001',
    site: 'Suprema',
    name: 'Mini Bounty',
    buyIn: '20.00',
    rebuys: 0,
    reentries: 0,
    addOnTaken: false,
    addOnCost: null,
    result: '0',
    bounty: '0',
    prize: '0',
    position: null,
    status: 'finished',
    type: 'PKO',
    speed: 'Normal',
    ...overrides,
  };
}

describe('calculateSessionStats - FX conversion (BRL Suprema)', () => {
  it('converte buyIn + result BRL para USD usando rate (1 USD = 5.3 BRL)', () => {
    const tournaments = [
      brlSupremaTournament({
        buyIn: '50.00',
        result: '53.00',
        status: 'finished',
      }),
    ];
    const rates = { BRL: 5.3 };
    const stats = calculateSessionStats(tournaments, [], {}, null, rates);

    // Native: invested=50, profit=3 BRL.
    // USD: invested=50/5.3 ≈ 9.43; profit=3/5.3 ≈ 0.566.
    expect(stats.totalInvestidoUSD).toBeCloseTo(50 / 5.3, 4);
    expect(stats.profitUSD).toBeCloseTo(3 / 5.3, 4);
    // Native legacy ainda deve refletir BRL bruto.
    expect(stats.totalInvestido).toBeCloseTo(50, 2);
    expect(stats.profit).toBeCloseTo(3, 2);
  });

  it('breakdown.byCurrency captura BRL com investedUSD convertido', () => {
    const tournaments = [
      brlSupremaTournament({ buyIn: '20.00', result: '0', status: 'finished' }),
    ];
    const rates = { BRL: 5.0 };
    const stats = calculateSessionStats(tournaments, [], {}, null, rates);

    expect(stats.breakdown.byCurrency).toHaveLength(1);
    const brl = stats.breakdown.byCurrency[0];
    expect(brl.currency).toBe('BRL');
    expect(brl.invested).toBeCloseTo(20, 2);
    expect(brl.investedUSD).toBeCloseTo(4, 2);
    expect(brl.rateMissing).toBe(false);
  });

  it('marca rateMissing quando rate BRL ausente', () => {
    const tournaments = [
      brlSupremaTournament({ buyIn: '20.00', status: 'finished' }),
    ];
    const stats = calculateSessionStats(tournaments, [], {}, null, {});

    expect(stats.breakdown.hasMissingRate).toBe(true);
    expect(stats.totalInvestidoUSD).toBe(0);
    // Native legacy preservado.
    expect(stats.totalInvestido).toBeCloseTo(20, 2);
  });

  it('sessao mista USD + BRL agrega corretamente em USD', () => {
    const tournaments = [
      // PokerStars USD: buy-in 22, prize 100 -> invested 22 USD, profit 78 USD
      {
        id: 't-stars',
        site: 'PokerStars',
        buyIn: '22.00',
        rebuys: 0,
        reentries: 0,
        result: '100.00',
        bounty: '0',
        prize: '100.00',
        addOnTaken: false,
        addOnCost: null,
        position: 1,
        status: 'finished',
      },
      // Suprema BRL: buy-in 20, result 0 -> invested 20 BRL, profit -20 BRL
      brlSupremaTournament({ buyIn: '20.00', result: '0', status: 'finished' }),
    ];
    const rates = { BRL: 5.0 };
    const stats = calculateSessionStats(tournaments, [], {}, null, rates);

    // USD aggregation: 22 + (20/5) = 26 invested; 78 + (-20/5) = 74 profit
    expect(stats.totalInvestidoUSD).toBeCloseTo(26, 2);
    expect(stats.profitUSD).toBeCloseTo(74, 2);
    // ROI deve usar USD: 74/26 ~= 284.6%
    expect(stats.roi).toBeCloseTo((74 / 26) * 100, 1);

    // Breakdown deve ter 2 currencies
    expect(stats.breakdown.byCurrency).toHaveLength(2);
    expect(stats.breakdown.hasMissingRate).toBe(false);
  });

  it('regressao USD-only: USD totals == raw totals (rates vazias OK)', () => {
    const tournaments = [
      {
        id: 't-stars-2',
        site: 'PokerStars',
        buyIn: '11.00',
        rebuys: 1,
        reentries: 0,
        result: '0',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        position: null,
        status: 'finished',
      },
    ];
    const stats = calculateSessionStats(tournaments, [], {}, null, {});
    expect(stats.totalInvestido).toBeCloseTo(22, 2);
    expect(stats.totalInvestidoUSD).toBeCloseTo(22, 2);
    expect(stats.profit).toBeCloseTo(-22, 2);
    expect(stats.profitUSD).toBeCloseTo(-22, 2);
  });
});

describe('calculateFinalSessionStats - FX conversion', () => {
  it('summary final converte BRL para USD em profit/abiMed/totalInvested', () => {
    const tournaments = [
      brlSupremaTournament({
        buyIn: '50.00',
        result: '53.00',
        status: 'finished',
      }),
    ];
    const rates = { BRL: 5.3 };
    const final = calculateFinalSessionStats([], tournaments, rates);

    expect((final as any).totalInvestedUSD).toBeCloseTo(50 / 5.3, 4);
    expect((final as any).profitUSD).toBeCloseTo(3 / 5.3, 4);
    // Legacy raw mantido p/ tests existentes.
    expect(final.totalInvested).toBeCloseTo(50, 2);
    expect(final.profit).toBeCloseTo(3, 2);
  });

  it('rate ausente nao zera legacy mas zera USD', () => {
    const tournaments = [
      brlSupremaTournament({ buyIn: '50.00', status: 'finished' }),
    ];
    const final = calculateFinalSessionStats([], tournaments, {});
    expect(final.totalInvested).toBeCloseTo(50, 2);
    expect((final as any).totalInvestedUSD).toBe(0);
    expect((final as any).breakdown.hasMissingRate).toBe(true);
  });
});
