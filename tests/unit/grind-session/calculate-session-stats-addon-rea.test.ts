import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Formula nova de totalInvestido (ADR-014 / Spec 1)
//
// Substituir em 2 lugares de calculateSessionStats.ts:
//   - calculateSessionStats (linha 122-127)
//   - calculateFinalSessionStats (linha 269-274)
//
// Formula antiga:
//   totalInvestido = buyIn * (1 + rebuys)
//
// Formula nova (Spec 1 §4.5):
//   totalInvestido = buyIn * (1 + rebuys + reentries) + (addOnTaken ? addOnCost : 0)
//
// Invariantes:
//   - Torneios sem flags Plus/ReA (zeros/false) => resultado bit-a-bit
//     identico ao calculo antigo (regressao zero)
//   - addOnCost e string (decimal), rebuys/reentries sao number ou string coagidos
//
// Modo: TDD - o implementer modifica calculateSessionStats.ts para passar os
//             testes novos. Os testes existentes de caracterizacao continuarao
//             passando porque o caminho sem flags e identico.
// =============================================================================

import {
  calculateSessionStats,
  calculateFinalSessionStats,
} from '../../../client/src/components/grind-session-live/calculateSessionStats';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeTournament(overrides: Partial<any> = {}): any {
  return {
    id: 't-' + Math.random().toString(36).slice(2, 8),
    sessionId: 'session-001',
    userId: 'USER-0001',
    site: 'PokerStars',
    name: 'Big $22',
    buyIn: '22.00',
    rebuys: 0,
    reentries: 0,
    allowsAddOn: false,
    addOnCost: null,
    addOnTaken: false,
    allowsReentry: false,
    maxReentries: null,
    result: '0',
    bounty: '0',
    prize: '0',
    position: null,
    status: 'finished',
    type: 'Vanilla',
    speed: 'Normal',
    ...overrides,
  };
}

const emptyRegistrationData = {};

// ===========================================================================
// calculateSessionStats: formula nova com add-on
// ===========================================================================

describe('calculateSessionStats - add-on incluido em totalInvestido', () => {
  it('deve adicionar addOnCost quando addOnTaken=true', () => {
    const tournaments = [
      makeTournament({
        buyIn: '22.00',
        rebuys: 0,
        reentries: 0,
        allowsAddOn: true,
        addOnCost: '10.50',
        addOnTaken: true,
        status: 'finished',
      }),
    ];

    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    // 22 + 10.50 = 32.50
    expect(stats.totalInvestido).toBeCloseTo(32.5, 2);
  });

  it('NAO deve adicionar addOnCost quando addOnTaken=false', () => {
    const tournaments = [
      makeTournament({
        buyIn: '22.00',
        rebuys: 0,
        reentries: 0,
        allowsAddOn: true,
        addOnCost: '22.00',
        addOnTaken: false,
        status: 'finished',
      }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    expect(stats.totalInvestido).toBeCloseTo(22, 2);
  });

  it('deve tratar addOnCost null como 0 mesmo com addOnTaken=true', () => {
    const tournaments = [
      makeTournament({
        buyIn: '22.00',
        allowsAddOn: true,
        addOnCost: null,
        addOnTaken: true,
        status: 'finished',
      }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    // buyIn * 1 + 0 = 22. addOnCost null e tratado como 0 (defensivo).
    expect(stats.totalInvestido).toBeCloseTo(22, 2);
  });

  it('deve somar multiplos add-ons pagos na sessao', () => {
    const tournaments = [
      makeTournament({
        buyIn: '22.00',
        addOnCost: '22.00',
        addOnTaken: true,
        allowsAddOn: true,
        status: 'finished',
      }),
      makeTournament({
        buyIn: '55.00',
        addOnCost: '55.00',
        addOnTaken: true,
        allowsAddOn: true,
        status: 'finished',
      }),
      makeTournament({
        buyIn: '11.00',
        addOnCost: null,
        addOnTaken: false,
        allowsAddOn: false,
        status: 'finished',
      }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    // (22+22) + (55+55) + 11 = 165
    expect(stats.totalInvestido).toBeCloseTo(165, 2);
  });

  it('deve aceitar addOnCost > buyIn (mega add-on)', () => {
    const tournaments = [
      makeTournament({
        buyIn: '22.00',
        addOnCost: '100.00',
        addOnTaken: true,
        allowsAddOn: true,
        status: 'finished',
      }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    expect(stats.totalInvestido).toBeCloseTo(122, 2);
  });
});

// ===========================================================================
// calculateSessionStats: formula nova com reentries
// ===========================================================================

describe('calculateSessionStats - reentries incluido em totalInvestido', () => {
  it('deve somar buyIn * reentries quando reentries > 0', () => {
    const tournaments = [
      makeTournament({
        buyIn: '5.50',
        rebuys: 0,
        reentries: 2,
        allowsReentry: true,
        status: 'finished',
      }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    // 5.50 * (1 + 0 + 2) = 16.50
    expect(stats.totalInvestido).toBeCloseTo(16.5, 2);
  });

  it('deve somar rebuys + reentries de forma independente', () => {
    const tournaments = [
      makeTournament({
        buyIn: '10.00',
        rebuys: 2,
        reentries: 1,
        allowsReentry: true,
        status: 'finished',
      }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    // 10 * (1 + 2 + 1) = 40
    expect(stats.totalInvestido).toBeCloseTo(40, 2);
  });

  it('deve somar reentries em multiplos torneios', () => {
    const tournaments = [
      makeTournament({
        buyIn: '22.00',
        reentries: 2,
        allowsReentry: true,
        status: 'finished',
      }),
      makeTournament({
        buyIn: '22.00',
        reentries: 0,
        allowsReentry: false,
        status: 'finished',
      }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    // (22*3) + (22*1) = 88
    expect(stats.totalInvestido).toBeCloseTo(88, 2);
  });

  it('deve aceitar reentries como string e coagir para number', () => {
    const tournaments = [
      makeTournament({
        buyIn: '10.00',
        reentries: '3',
        allowsReentry: true,
        status: 'finished',
      }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    // 10 * (1 + 0 + 3) = 40
    expect(stats.totalInvestido).toBeCloseTo(40, 2);
  });

  it('deve aceitar reentries null como 0 (torneio antigo)', () => {
    const tournaments = [
      makeTournament({
        buyIn: '22.00',
        reentries: null,
        allowsReentry: false,
        status: 'finished',
      }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    expect(stats.totalInvestido).toBeCloseTo(22, 2);
  });
});

// ===========================================================================
// calculateSessionStats: formula completa combinada
// ===========================================================================

describe('calculateSessionStats - formula completa Plus + ReA + Rebuy', () => {
  it('cenario Spec 1 §7.6: rebuys=2, reentries=1, addOnTaken=true, buyIn=10, addOnCost=5 -> 45', () => {
    const tournaments = [
      makeTournament({
        buyIn: '10.00',
        rebuys: 2,
        reentries: 1,
        allowsReentry: true,
        allowsAddOn: true,
        addOnCost: '5.00',
        addOnTaken: true,
        status: 'finished',
      }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    // 10 * (1+2+1) + 5 = 45
    expect(stats.totalInvestido).toBeCloseTo(45, 2);
  });

  it('cenario high-roller: buyIn=530, rebuys=0, reentries=2, addOnCost=530 pago', () => {
    const tournaments = [
      makeTournament({
        buyIn: '530.00',
        rebuys: 0,
        reentries: 2,
        allowsReentry: true,
        allowsAddOn: true,
        addOnCost: '530.00',
        addOnTaken: true,
        status: 'finished',
      }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    // 530 * 3 + 530 = 2120
    expect(stats.totalInvestido).toBeCloseTo(2120, 2);
  });

  it('sessao mista com 5 torneios variados', () => {
    const tournaments = [
      makeTournament({
        buyIn: '22.00',
        rebuys: 0,
        reentries: 0,
        addOnTaken: false,
        status: 'finished',
      }), // 22
      makeTournament({
        buyIn: '22.00',
        rebuys: 1,
        reentries: 0,
        addOnTaken: false,
        status: 'finished',
      }), // 44
      makeTournament({
        buyIn: '55.00',
        rebuys: 0,
        reentries: 2,
        allowsReentry: true,
        addOnTaken: false,
        status: 'finished',
      }), // 165
      makeTournament({
        buyIn: '11.00',
        rebuys: 0,
        reentries: 0,
        allowsAddOn: true,
        addOnCost: '11.00',
        addOnTaken: true,
        status: 'finished',
      }), // 22
      makeTournament({
        buyIn: '109.00',
        rebuys: 2,
        reentries: 1,
        allowsReentry: true,
        allowsAddOn: true,
        addOnCost: '50.00',
        addOnTaken: true,
        status: 'finished',
      }), // 109*4 + 50 = 486
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    // 22 + 44 + 165 + 22 + 486 = 739
    expect(stats.totalInvestido).toBeCloseTo(739, 2);
  });
});

// ===========================================================================
// Regressao numerica: sem flags produz resultado identico
// ===========================================================================

describe('calculateSessionStats - REGRESSAO ZERO (sem flags Plus/ReA)', () => {
  it('torneio sem flags produz resultado identico ao calculo antigo', () => {
    const tournaments = [
      makeTournament({
        buyIn: '22.00',
        rebuys: 1,
        // Sem nenhuma flag Plus/ReA setada
        status: 'finished',
      }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    // Formula antiga: 22 * (1+1) = 44. Nova: mesma (reentries=0, addOn=0).
    expect(stats.totalInvestido).toBeCloseTo(44, 2);
  });

  it('torneio totalmente vazio (apenas buyIn) produz 22', () => {
    const tournaments = [
      makeTournament({ buyIn: '22.00', status: 'finished' }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    expect(stats.totalInvestido).toBeCloseTo(22, 2);
  });

  it('torneio com undefined em reentries/addOnTaken (pre-migracao) nao quebra', () => {
    const tournaments = [
      {
        id: 't-legacy',
        sessionId: 'session-001',
        userId: 'USER-0001',
        site: 'PokerStars',
        buyIn: '22.00',
        rebuys: 1,
        // reentries e addOnTaken undefined (torneio antigo sem migrar)
        status: 'finished',
      },
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    expect(stats.totalInvestido).toBeCloseTo(44, 2);
  });

  it('20 torneios sem flags produzem soma antiga', () => {
    const tournaments = Array.from({ length: 20 }, (_, i) =>
      makeTournament({
        id: 't-' + i,
        buyIn: '10.00',
        rebuys: i % 3, // 0, 1, 2 em ciclo
        status: 'finished',
      })
    );
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    // Sum rebuys: (0+1+2) * 7 repeticoes perfeitas - ajusta pelo modulo.
    // rebuys por indice: 0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1
    // sum = 6 * (0+1+2) + 0+1 = 19
    // invested = 20 * 10 + 19 * 10 = 200 + 190 = 390
    expect(stats.totalInvestido).toBeCloseTo(390, 2);
  });
});

// ===========================================================================
// calculateFinalSessionStats: mesma formula aplicada
// ===========================================================================

describe('calculateFinalSessionStats - formula convergente com calculateSessionStats', () => {
  it('summary modal reflete o mesmo totalInvested que o dashboard ao vivo', () => {
    const tournaments = [
      makeTournament({
        buyIn: '10.00',
        rebuys: 2,
        reentries: 1,
        allowsReentry: true,
        allowsAddOn: true,
        addOnCost: '5.00',
        addOnTaken: true,
        status: 'finished',
      }),
    ];
    const dashboardStats = calculateSessionStats(
      tournaments,
      [],
      emptyRegistrationData,
      null
    );
    const finalStats = calculateFinalSessionStats([], tournaments);
    expect(finalStats.totalInvested ?? (finalStats as any).totalInvestido).toBeCloseTo(
      dashboardStats.totalInvestido,
      2
    );
  });

  it('final stats com add-on pago soma corretamente', () => {
    const tournaments = [
      makeTournament({
        buyIn: '22.00',
        addOnCost: '22.00',
        addOnTaken: true,
        allowsAddOn: true,
        status: 'finished',
      }),
    ];
    const finalStats = calculateFinalSessionStats([], tournaments);
    const value = finalStats.totalInvested ?? (finalStats as any).totalInvestido;
    expect(value).toBeCloseTo(44, 2);
  });

  it('final stats com reentries soma corretamente', () => {
    const tournaments = [
      makeTournament({
        buyIn: '22.00',
        reentries: 2,
        allowsReentry: true,
        status: 'finished',
      }),
    ];
    const finalStats = calculateFinalSessionStats([], tournaments);
    const value = finalStats.totalInvested ?? (finalStats as any).totalInvestido;
    // 22 * 3 = 66
    expect(value).toBeCloseTo(66, 2);
  });

  it('final stats regressao: sem flags equivale ao calculo antigo', () => {
    const tournaments = [
      makeTournament({ buyIn: '22.00', rebuys: 1, status: 'finished' }),
    ];
    const finalStats = calculateFinalSessionStats([], tournaments);
    const value = finalStats.totalInvested ?? (finalStats as any).totalInvestido;
    expect(value).toBeCloseTo(44, 2);
  });
});

// ===========================================================================
// totalEntries (Spec 3) - novo campo em SessionStats
// ===========================================================================

describe('calculateSessionStats - totalEntries (Spec 3)', () => {
  it('deve calcular totalEntries = volume + sum(reentries)', () => {
    const tournaments = [
      makeTournament({ reentries: 2, allowsReentry: true, status: 'finished' }),
      makeTournament({ reentries: 0, status: 'finished' }),
      makeTournament({ reentries: 1, allowsReentry: true, status: 'registered' }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    // volume=3, reentries=3, total entries = 6
    expect((stats as any).totalEntries).toBe(6);
  });

  it('totalEntries = volume quando sem reentries', () => {
    const tournaments = [
      makeTournament({ reentries: 0, status: 'finished' }),
      makeTournament({ reentries: 0, status: 'finished' }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    expect((stats as any).totalEntries).toBe(2);
  });

  it('totalEntries=0 quando sessao vazia', () => {
    const stats = calculateSessionStats([], [], emptyRegistrationData, null);
    expect((stats as any).totalEntries ?? 0).toBe(0);
  });
});

// ===========================================================================
// ROI/profit usam a formula nova
// ===========================================================================

describe('calculateSessionStats - ROI e profit usam totalInvestido novo', () => {
  it('ROI com add-on pago reflete investimento correto', () => {
    const tournaments = [
      makeTournament({
        buyIn: '22.00',
        addOnCost: '22.00',
        addOnTaken: true,
        allowsAddOn: true,
        result: '88.00',
        prize: '88.00',
        status: 'finished',
      }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    // totalInvestido=44, profit=88-44=44, roi=100%
    expect(stats.totalInvestido).toBeCloseTo(44, 2);
    expect(stats.profit).toBeCloseTo(44, 2);
    expect(stats.roi).toBeCloseTo(100, 1);
  });

  it('ROI com reentries reflete investimento correto', () => {
    const tournaments = [
      makeTournament({
        buyIn: '22.00',
        reentries: 2,
        allowsReentry: true,
        result: '132.00',
        status: 'finished',
      }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    // totalInvestido=66, profit=132-66=66, roi=100%
    expect(stats.totalInvestido).toBeCloseTo(66, 2);
    expect(stats.profit).toBeCloseTo(66, 2);
    expect(stats.roi).toBeCloseTo(100, 1);
  });

  it('ROI negativo quando profit < totalInvestido', () => {
    const tournaments = [
      makeTournament({
        buyIn: '100.00',
        rebuys: 1,
        reentries: 1,
        allowsReentry: true,
        result: '50.00',
        status: 'finished',
      }),
    ];
    const stats = calculateSessionStats(tournaments, [], emptyRegistrationData, null);
    // totalInvestido=300, profit=50-300=-250, roi=-83.33%
    expect(stats.totalInvestido).toBeCloseTo(300, 2);
    expect(stats.roi).toBeLessThan(0);
  });
});
