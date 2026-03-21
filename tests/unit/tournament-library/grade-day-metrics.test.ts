import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Day Metrics — calcula metricas de planejamento para um dia
//
// O modulo shared/grade-day-metrics.ts AINDA NAO EXISTE.
// O Implementer vai cria-lo.
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Imports que AINDA NAO EXISTEM — serao criados pelo Implementer
// ---------------------------------------------------------------------------
import { calculateDayMetrics } from '../../../shared/grade-day-metrics';

// ---------------------------------------------------------------------------
// Helpers de teste
// ---------------------------------------------------------------------------

function makeTournament(overrides: Record<string, any> = {}) {
  return {
    id: 'pt-1',
    name: 'Tournament',
    site: 'PokerStars',
    buyIn: '22',
    time: '19:00',
    type: 'Vanilla',
    speed: 'Normal',
    ...overrides,
  };
}

// =============================================================================
// Grupo 5: calculateDayMetrics
// =============================================================================

describe('calculateDayMetrics', () => {

  // -------------------------------------------------------------------------
  // Array vazio — todos zeros/null
  // -------------------------------------------------------------------------

  it('deve retornar metricas zeradas para array vazio', () => {
    const result = calculateDayMetrics([]);

    expect(result.totalBuyIn).toBe(0);
    expect(result.tournamentCount).toBe(0);
    expect(result.averageBuyIn).toBe(0);
    expect(result.timeRange).toBeNull();
    expect(result.estimatedHours).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Soma de buy-ins
  // -------------------------------------------------------------------------

  it('deve somar totalBuyIn de todos os torneios', () => {
    const tournaments = [
      makeTournament({ buyIn: '22' }),
      makeTournament({ buyIn: '55' }),
      makeTournament({ buyIn: '109' }),
    ];
    const result = calculateDayMetrics(tournaments);

    expect(result.totalBuyIn).toBe(186);
  });

  it('deve converter buyIn string decimal para number na soma', () => {
    const tournaments = [
      makeTournament({ buyIn: '5.50' }),
      makeTournament({ buyIn: '2.20' }),
    ];
    const result = calculateDayMetrics(tournaments);

    expect(result.totalBuyIn).toBeCloseTo(7.70);
  });

  // -------------------------------------------------------------------------
  // Contagem e media
  // -------------------------------------------------------------------------

  it('deve calcular tournamentCount e averageBuyIn corretamente', () => {
    const tournaments = [
      makeTournament({ buyIn: '10' }),
      makeTournament({ buyIn: '20' }),
      makeTournament({ buyIn: '30' }),
    ];
    const result = calculateDayMetrics(tournaments);

    expect(result.tournamentCount).toBe(3);
    expect(result.averageBuyIn).toBe(20);
  });

  // -------------------------------------------------------------------------
  // Time range e horas estimadas
  // -------------------------------------------------------------------------

  it('deve calcular timeRange com primeiro e ultimo horario', () => {
    const tournaments = [
      makeTournament({ time: '19:00' }),
      makeTournament({ time: '21:30' }),
      makeTournament({ time: '18:00' }),
    ];
    const result = calculateDayMetrics(tournaments);

    expect(result.timeRange).toEqual({ start: '18:00', end: '21:30' });
  });

  it('deve calcular estimatedHours como diferenca entre ultimo e primeiro horario', () => {
    const tournaments = [
      makeTournament({ time: '18:00' }),
      makeTournament({ time: '22:00' }),
    ];
    const result = calculateDayMetrics(tournaments);

    expect(result.estimatedHours).toBe(4);
  });

  it('deve retornar timeRange=null quando nenhum torneio tem horario', () => {
    const tournaments = [
      makeTournament({ time: null }),
      makeTournament({ time: null }),
    ];
    const result = calculateDayMetrics(tournaments);

    expect(result.timeRange).toBeNull();
    expect(result.estimatedHours).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Distribuicao por site, type e speed
  // -------------------------------------------------------------------------

  it('deve calcular distribuicao por site, type e speed', () => {
    const tournaments = [
      makeTournament({ site: 'PokerStars', type: 'Vanilla', speed: 'Normal' }),
      makeTournament({ site: 'PokerStars', type: 'PKO', speed: 'Turbo' }),
      makeTournament({ site: 'GGNetwork', type: 'PKO', speed: 'Turbo' }),
      makeTournament({ site: 'GGNetwork', type: 'Vanilla', speed: 'Normal' }),
      makeTournament({ site: 'GGNetwork', type: 'Mystery', speed: 'Hyper' }),
    ];
    const result = calculateDayMetrics(tournaments);

    // Sites
    expect(result.sites).toEqual({ PokerStars: 2, GGNetwork: 3 });

    // Types
    expect(result.types).toEqual({ Vanilla: 2, PKO: 2, Mystery: 1 });

    // Speeds
    expect(result.speeds).toEqual({ Normal: 2, Turbo: 2, Hyper: 1 });
  });

  // -------------------------------------------------------------------------
  // Um unico torneio
  // -------------------------------------------------------------------------

  it('deve calcular metricas para um unico torneio', () => {
    const tournaments = [makeTournament({ buyIn: '55', time: '20:00', site: 'WPN', type: 'PKO', speed: 'Turbo' })];
    const result = calculateDayMetrics(tournaments);

    expect(result.totalBuyIn).toBe(55);
    expect(result.tournamentCount).toBe(1);
    expect(result.averageBuyIn).toBe(55);
    expect(result.timeRange).toEqual({ start: '20:00', end: '20:00' });
    expect(result.estimatedHours).toBe(0);
    expect(result.sites).toEqual({ WPN: 1 });
    expect(result.types).toEqual({ PKO: 1 });
    expect(result.speeds).toEqual({ Turbo: 1 });
  });
});
