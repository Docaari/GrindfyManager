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

describe('calculateSessionStats - iPoker EUR (site overrides legacy t.currency default)', () => {
  it('iPoker tournament com t.currency="USD" default ainda eh detectado como EUR', () => {
    // Schema legacy de tournament_library/planned_tournaments tem
    // currency.default('USD'). Antes do fix, isso sobrescrevia silenciosamente
    // o lookup de site iPoker (EUR), removendo EUR do breakdown.
    const tournaments = [
      {
        id: 't-ipoker-1',
        site: 'iPoker',
        currency: 'USD', // schema default — bug originador
        buyIn: '50.00',
        rebuys: 0,
        reentries: 0,
        result: '0',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        position: null,
        status: 'finished',
      },
    ];
    const rates = { EUR: 0.92 };
    const stats = calculateSessionStats(tournaments, [], {}, null, rates);

    expect(stats.breakdown.byCurrency).toHaveLength(1);
    expect(stats.breakdown.byCurrency[0].currency).toBe('EUR');
    expect(stats.breakdown.byCurrency[0].invested).toBeCloseTo(50, 2);
    // EUR -> USD: 50 / 0.92 ~= 54.35
    expect(stats.totalInvestidoUSD).toBeCloseTo(50 / 0.92, 4);
  });

  it('site alias case-insensitive: "ipoker" e "iPoker Network" ambos resolvem EUR', () => {
    const tournaments = [
      {
        id: 't-ipoker-low',
        site: 'ipoker',
        buyIn: '20.00',
        rebuys: 0,
        result: '0',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        status: 'finished',
      },
      {
        id: 't-ipoker-net',
        site: 'iPoker Network',
        buyIn: '30.00',
        rebuys: 0,
        result: '0',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        status: 'finished',
      },
    ];
    const rates = { EUR: 0.92 };
    const stats = calculateSessionStats(tournaments, [], {}, null, rates);

    expect(stats.breakdown.byCurrency).toHaveLength(1);
    expect(stats.breakdown.byCurrency[0].currency).toBe('EUR');
    expect(stats.breakdown.byCurrency[0].invested).toBeCloseTo(50, 2);
  });

  it('sessao tripla USD + BRL + EUR: breakdown lista 3 moedas', () => {
    const tournaments = [
      {
        id: 't-stars',
        site: 'PokerStars',
        buyIn: '22.00',
        rebuys: 0,
        result: '0',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        status: 'finished',
      },
      {
        id: 't-suprema',
        site: 'Suprema',
        buyIn: '50.00',
        rebuys: 0,
        result: '0',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        status: 'finished',
      },
      {
        id: 't-ipoker',
        site: 'iPoker',
        currency: 'USD', // schema default — nao deve afetar
        buyIn: '30.00',
        rebuys: 0,
        result: '0',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        status: 'finished',
      },
    ];
    const rates = { BRL: 5.0, EUR: 0.92 };
    const stats = calculateSessionStats(tournaments, [], {}, null, rates);

    const codes = stats.breakdown.byCurrency.map((c) => c.currency).sort();
    expect(codes).toEqual(['BRL', 'EUR', 'USD']);
    // USD: 22; BRL: 50/5=10; EUR: 30/0.92~=32.61. Total ~64.61
    expect(stats.totalInvestidoUSD).toBeCloseTo(22 + 10 + 30 / 0.92, 2);
  });
});

describe('calculateSessionStats - ABI (avg buy-in USD) e Media Participantes', () => {
  it('ABI: media de buy-in em USD para sessao single-currency USD', () => {
    const tournaments = [
      {
        id: 't-1',
        site: 'PokerStars',
        buyIn: '22.00',
        rebuys: 0,
        result: '0',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        status: 'finished',
      },
      {
        id: 't-2',
        site: 'PokerStars',
        buyIn: '55.00',
        rebuys: 0,
        result: '0',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        status: 'finished',
      },
    ];
    const stats = calculateSessionStats(tournaments, [], {}, null, {});
    // (22 + 55) / 2 = 38.5
    expect(stats.abi).toBeCloseTo(38.5, 2);
  });

  it('ABI: converte BRL para USD antes de mediar', () => {
    const tournaments = [
      {
        id: 't-stars',
        site: 'PokerStars',
        buyIn: '20.00',
        rebuys: 0,
        result: '0',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        status: 'finished',
      },
      {
        id: 't-suprema',
        site: 'Suprema',
        buyIn: '50.00',
        rebuys: 0,
        result: '0',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        status: 'finished',
      },
    ];
    const rates = { BRL: 5.0 };
    const stats = calculateSessionStats(tournaments, [], {}, null, rates);
    // USD 20 + (BRL 50 / 5 = USD 10) = 30 / 2 = 15
    expect(stats.abi).toBeCloseTo(15, 2);
  });

  it('Media Participantes: Gtd / BI quando sem add-on', () => {
    const tournaments = [
      {
        id: 't-1',
        site: 'PokerStars',
        buyIn: '22.00',
        guaranteed: '4400.00',
        rebuys: 0,
        result: '0',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        status: 'finished',
      },
      {
        id: 't-2',
        site: 'PokerStars',
        buyIn: '11.00',
        guaranteed: '1100.00',
        rebuys: 0,
        result: '0',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        status: 'finished',
      },
    ];
    const stats = calculateSessionStats(tournaments, [], {}, null, {});
    // 4400/22 = 200; 1100/11 = 100; media = 150
    expect(stats.avgParticipants).toBeCloseTo(150, 2);
  });

  it('Media Participantes: Gtd / (BI + AddOn) quando add-on pago', () => {
    const tournaments = [
      {
        id: 't-addon',
        site: 'PokerStars',
        buyIn: '22.00',
        guaranteed: '4400.00',
        rebuys: 0,
        result: '0',
        bounty: '0',
        addOnTaken: true,
        addOnCost: '22.00',
        allowsAddOn: true,
        status: 'finished',
      },
    ];
    const stats = calculateSessionStats(tournaments, [], {}, null, {});
    // 4400 / (22 + 22) = 100
    expect(stats.avgParticipants).toBeCloseTo(100, 2);
  });

  it('Media Participantes: ignora torneios sem guaranteed', () => {
    const tournaments = [
      {
        id: 't-with',
        site: 'PokerStars',
        buyIn: '22.00',
        guaranteed: '4400.00',
        rebuys: 0,
        result: '0',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        status: 'finished',
      },
      {
        id: 't-without',
        site: 'PokerStars',
        buyIn: '22.00',
        guaranteed: '0',
        rebuys: 0,
        result: '0',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        status: 'finished',
      },
    ];
    const stats = calculateSessionStats(tournaments, [], {}, null, {});
    // So conta o primeiro: 4400/22 = 200
    expect(stats.avgParticipants).toBeCloseTo(200, 2);
  });

  it('Media Participantes: zero quando nenhum torneio elegivel', () => {
    const tournaments = [
      {
        id: 't-no-gtd',
        site: 'PokerStars',
        buyIn: '22.00',
        rebuys: 0,
        result: '0',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        status: 'finished',
      },
    ];
    const stats = calculateSessionStats(tournaments, [], {}, null, {});
    expect(stats.avgParticipants).toBe(0);
  });
});

describe('calculateSessionStats - parseDecimal robusto + fallback chain', () => {
  it('aceita formato BR "190,00" no result', () => {
    const tournaments = [
      {
        id: 't-br',
        site: 'Suprema',
        buyIn: '50,00',
        rebuys: 0,
        result: '190,00',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        status: 'finished',
      },
    ];
    const rates = { BRL: 5.0 };
    const stats = calculateSessionStats(tournaments, [], {}, null, rates);
    // BRL: profit = 190 - 50 = 140
    expect(stats.profit).toBeCloseTo(140, 2);
    // USD: 140 / 5 = 28
    expect(stats.profitUSD).toBeCloseTo(28, 2);
  });

  it('t.result > 0 vence sobre registrationData.prize="0" stale', () => {
    const tournaments = [
      {
        id: 't-fix',
        site: 'Suprema',
        buyIn: '50.00',
        rebuys: 0,
        result: '190.00',
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        status: 'finished',
      },
    ];
    const registrationData = { 't-fix': { prize: '0', bounty: '0', position: '' } };
    const rates = { BRL: 5.0 };
    const stats = calculateSessionStats(tournaments, [], registrationData, null, rates);
    // Sem fix anterior, registrationData.prize='0' anulava t.result=190.
    // Profit deveria ser 140 (190-50), nao -50.
    expect(stats.profit).toBeCloseTo(140, 2);
  });

  it('fallback t.prize legacy quando t.result=0', () => {
    const tournaments = [
      {
        id: 't-prize',
        site: 'PokerStars',
        buyIn: '22.00',
        rebuys: 0,
        result: '0',
        prize: '88.00', // schema legacy field
        bounty: '0',
        addOnTaken: false,
        addOnCost: null,
        status: 'finished',
      },
    ];
    const stats = calculateSessionStats(tournaments, [], {}, null, {});
    // profit = 88 - 22 = 66
    expect(stats.profit).toBeCloseTo(66, 2);
  });
});

describe('calculateSessionStats - addOnsPaid currency-aware', () => {
  it('add-on USD: count + totalUSD nativo', () => {
    const tournaments = [
      {
        id: 't-1',
        site: 'PokerStars',
        buyIn: '22.00',
        addOnCost: '22.00',
        addOnTaken: true,
        allowsAddOn: true,
        status: 'finished',
      },
    ];
    const stats = calculateSessionStats(tournaments, [], {}, null, {});
    expect(stats.addOnsPaid.count).toBe(1);
    expect(stats.addOnsPaid.totalUSD).toBeCloseTo(22, 2);
    expect(stats.addOnsPaid.byCurrency).toHaveLength(1);
    expect(stats.addOnsPaid.byCurrency[0].currency).toBe('USD');
  });

  it('add-on misto BRL+USD: totalUSD converte BRL via rate', () => {
    const tournaments = [
      {
        id: 't-stars',
        site: 'PokerStars',
        buyIn: '22.00',
        addOnCost: '22.00',
        addOnTaken: true,
        allowsAddOn: true,
        status: 'finished',
      },
      {
        id: 't-suprema',
        site: 'Suprema',
        buyIn: '50.00',
        addOnCost: '50.00',
        addOnTaken: true,
        allowsAddOn: true,
        status: 'finished',
      },
    ];
    const rates = { BRL: 5.0 };
    const stats = calculateSessionStats(tournaments, [], {}, null, rates);
    expect(stats.addOnsPaid.count).toBe(2);
    // USD: 22 + (50/5)=10 = 32
    expect(stats.addOnsPaid.totalUSD).toBeCloseTo(32, 2);
    expect(stats.addOnsPaid.byCurrency).toHaveLength(2);
    const codes = stats.addOnsPaid.byCurrency.map((c) => c.currency).sort();
    expect(codes).toEqual(['BRL', 'USD']);
  });

  it('add-on com rate ausente marca hasMissingRate', () => {
    const tournaments = [
      {
        id: 't-eur',
        site: 'iPoker',
        buyIn: '50.00',
        addOnCost: '50.00',
        addOnTaken: true,
        allowsAddOn: true,
        status: 'finished',
      },
    ];
    const stats = calculateSessionStats(tournaments, [], {}, null, {});
    expect(stats.addOnsPaid.count).toBe(1);
    expect(stats.addOnsPaid.totalUSD).toBe(0);
    expect(stats.addOnsPaid.hasMissingRate).toBe(true);
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
