import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Weekly Summary Metrics (WeeklySummaryBar)
//
// O modulo shared/weekly-summary.ts AINDA NAO EXISTE.
// O Implementer vai cria-lo.
//
// calculateWeeklySummary recebe torneios planejados e profile states,
// retornando metricas consolidadas da semana inteira.
//
// Regras:
// - totalBuyIn: soma de buy-ins de torneios em dias ativos (nao OFF)
// - tournamentCount: total de torneios em dias ativos
// - averageBuyIn: media (0 se nenhum torneio)
// - activeDays: contagem de dias com perfil != 'OFF' e != null
// - estimatedHours: soma de horas estimadas por dia (range de horarios)
// - Torneios em dias OFF sao ignorados
//
// Modo: TDD — todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Import que AINDA NAO EXISTE — sera criado pelo Implementer
// ---------------------------------------------------------------------------
import { calculateWeeklySummary } from '../../../shared/weekly-summary';

// ---------------------------------------------------------------------------
// Helpers de teste
// ---------------------------------------------------------------------------

interface PlannedTournament {
  id: string;
  name: string;
  site: string;
  buyIn: string;
  time: string | null;
  dayOfWeek: number;
  type: string | null;
  speed: string | null;
  [key: string]: any;
}

interface ProfileState {
  dayOfWeek: number;
  activeProfile: string;
}

function makeTournament(overrides: Partial<PlannedTournament> = {}): PlannedTournament {
  return {
    id: 'pt-1',
    name: 'Tournament',
    site: 'PokerStars',
    buyIn: '22',
    time: '19:00',
    dayOfWeek: 1,
    type: 'Vanilla',
    speed: 'Normal',
    ...overrides,
  };
}

function makeProfileState(dayOfWeek: number, activeProfile: string): ProfileState {
  return { dayOfWeek, activeProfile };
}

// =============================================================================
// Grupo 1: calculateWeeklySummary
// =============================================================================

describe('calculateWeeklySummary', () => {

  // -------------------------------------------------------------------------
  // Array vazio — todos zeros
  // -------------------------------------------------------------------------

  it('deve retornar metricas zeradas para arrays vazios', () => {
    const result = calculateWeeklySummary([], []);

    expect(result.totalBuyIn).toBe(0);
    expect(result.tournamentCount).toBe(0);
    expect(result.averageBuyIn).toBe(0);
    expect(result.activeDays).toBe(0);
    expect(result.estimatedHours).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Soma de buy-ins da semana (apenas dias ativos)
  // -------------------------------------------------------------------------

  it('deve somar totalBuyIn de torneios em dias ativos', () => {
    const tournaments = [
      makeTournament({ id: '1', buyIn: '22', dayOfWeek: 1 }),
      makeTournament({ id: '2', buyIn: '55', dayOfWeek: 2 }),
      makeTournament({ id: '3', buyIn: '109', dayOfWeek: 3 }),
    ];
    const profiles = [
      makeProfileState(1, 'A'),
      makeProfileState(2, 'B'),
      makeProfileState(3, 'A'),
    ];
    const result = calculateWeeklySummary(tournaments, profiles);

    expect(result.totalBuyIn).toBe(186);
  });

  it('deve converter buyIn string decimal para number na soma', () => {
    const tournaments = [
      makeTournament({ id: '1', buyIn: '5.50', dayOfWeek: 1 }),
      makeTournament({ id: '2', buyIn: '2.20', dayOfWeek: 1 }),
    ];
    const profiles = [makeProfileState(1, 'A')];
    const result = calculateWeeklySummary(tournaments, profiles);

    expect(result.totalBuyIn).toBeCloseTo(7.70);
  });

  // -------------------------------------------------------------------------
  // Contagem de torneios e media
  // -------------------------------------------------------------------------

  it('deve calcular tournamentCount e averageBuyIn', () => {
    const tournaments = [
      makeTournament({ id: '1', buyIn: '10', dayOfWeek: 1 }),
      makeTournament({ id: '2', buyIn: '20', dayOfWeek: 1 }),
      makeTournament({ id: '3', buyIn: '30', dayOfWeek: 2 }),
    ];
    const profiles = [
      makeProfileState(1, 'A'),
      makeProfileState(2, 'B'),
    ];
    const result = calculateWeeklySummary(tournaments, profiles);

    expect(result.tournamentCount).toBe(3);
    expect(result.averageBuyIn).toBe(20);
  });

  it('deve retornar averageBuyIn 0 quando nao ha torneios', () => {
    const profiles = [makeProfileState(1, 'A')];
    const result = calculateWeeklySummary([], profiles);

    expect(result.averageBuyIn).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Contagem de dias ativos (perfil != OFF e != null)
  // -------------------------------------------------------------------------

  it('deve contar activeDays excluindo OFF e null', () => {
    const profiles = [
      makeProfileState(0, 'A'),
      makeProfileState(1, 'B'),
      makeProfileState(2, 'C'),
      makeProfileState(3, 'A'),
      makeProfileState(4, 'B'),
      makeProfileState(5, 'C'),
      makeProfileState(6, 'OFF'),
    ];
    const result = calculateWeeklySummary([], profiles);

    expect(result.activeDays).toBe(6);
  });

  it('deve contar activeDays como 0 quando todos sao OFF', () => {
    const profiles = [
      makeProfileState(0, 'OFF'),
      makeProfileState(1, 'OFF'),
    ];
    const result = calculateWeeklySummary([], profiles);

    expect(result.activeDays).toBe(0);
  });

  it('deve contar activeDays como 0 quando profileStates esta vazio', () => {
    const result = calculateWeeklySummary([], []);

    expect(result.activeDays).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Torneios em dias OFF sao ignorados
  // -------------------------------------------------------------------------

  it('deve ignorar torneios em dias com perfil OFF', () => {
    const tournaments = [
      makeTournament({ id: '1', buyIn: '22', dayOfWeek: 1 }),   // dia ativo
      makeTournament({ id: '2', buyIn: '55', dayOfWeek: 2 }),   // dia OFF
      makeTournament({ id: '3', buyIn: '109', dayOfWeek: 3 }),  // dia ativo
    ];
    const profiles = [
      makeProfileState(1, 'A'),
      makeProfileState(2, 'OFF'),
      makeProfileState(3, 'B'),
    ];
    const result = calculateWeeklySummary(tournaments, profiles);

    expect(result.totalBuyIn).toBe(131);      // 22 + 109 (sem 55 do dia OFF)
    expect(result.tournamentCount).toBe(2);    // sem o torneio do dia OFF
    expect(result.averageBuyIn).toBeCloseTo(65.5);
  });

  it('deve ignorar torneios em dias sem profileState definido', () => {
    const tournaments = [
      makeTournament({ id: '1', buyIn: '22', dayOfWeek: 1 }),
      makeTournament({ id: '2', buyIn: '55', dayOfWeek: 5 }),  // sem profile definido
    ];
    const profiles = [
      makeProfileState(1, 'A'),
      // dayOfWeek 5 nao tem profileState
    ];
    const result = calculateWeeklySummary(tournaments, profiles);

    expect(result.totalBuyIn).toBe(22);
    expect(result.tournamentCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Horas estimadas — soma das horas por dia
  // -------------------------------------------------------------------------

  it('deve calcular estimatedHours como soma de horas estimadas por dia', () => {
    const tournaments = [
      // Dia 1: 18:00 - 22:00 = 4h
      makeTournament({ id: '1', time: '18:00', dayOfWeek: 1 }),
      makeTournament({ id: '2', time: '22:00', dayOfWeek: 1 }),
      // Dia 2: 19:00 - 21:00 = 2h
      makeTournament({ id: '3', time: '19:00', dayOfWeek: 2 }),
      makeTournament({ id: '4', time: '21:00', dayOfWeek: 2 }),
    ];
    const profiles = [
      makeProfileState(1, 'A'),
      makeProfileState(2, 'B'),
    ];
    const result = calculateWeeklySummary(tournaments, profiles);

    expect(result.estimatedHours).toBe(6); // 4 + 2
  });

  it('deve retornar estimatedHours 0 quando torneios nao tem horario', () => {
    const tournaments = [
      makeTournament({ id: '1', time: null, dayOfWeek: 1 }),
      makeTournament({ id: '2', time: null, dayOfWeek: 1 }),
    ];
    const profiles = [makeProfileState(1, 'A')];
    const result = calculateWeeklySummary(tournaments, profiles);

    expect(result.estimatedHours).toBe(0);
  });

  it('deve retornar estimatedHours 0 para dia com um unico torneio', () => {
    const tournaments = [
      makeTournament({ id: '1', time: '20:00', dayOfWeek: 1 }),
    ];
    const profiles = [makeProfileState(1, 'A')];
    const result = calculateWeeklySummary(tournaments, profiles);

    // Um unico torneio: range = 20:00 - 20:00 = 0h
    expect(result.estimatedHours).toBe(0);
  });

  it('deve ignorar horas de dias OFF no calculo de estimatedHours', () => {
    const tournaments = [
      // Dia 1 (ativo): 18:00 - 22:00 = 4h
      makeTournament({ id: '1', time: '18:00', dayOfWeek: 1 }),
      makeTournament({ id: '2', time: '22:00', dayOfWeek: 1 }),
      // Dia 2 (OFF): 19:00 - 23:00 = 4h (ignorado)
      makeTournament({ id: '3', time: '19:00', dayOfWeek: 2 }),
      makeTournament({ id: '4', time: '23:00', dayOfWeek: 2 }),
    ];
    const profiles = [
      makeProfileState(1, 'A'),
      makeProfileState(2, 'OFF'),
    ];
    const result = calculateWeeklySummary(tournaments, profiles);

    expect(result.estimatedHours).toBe(4); // so dia 1
  });

  // -------------------------------------------------------------------------
  // Cenario completo: semana com 3A + 2B + 1C + 1OFF
  // -------------------------------------------------------------------------

  it('deve calcular semana completa com multiplos perfis e dias OFF', () => {
    const tournaments = [
      makeTournament({ id: '1', buyIn: '22', time: '18:00', dayOfWeek: 0 }),
      makeTournament({ id: '2', buyIn: '33', time: '20:00', dayOfWeek: 0 }),
      makeTournament({ id: '3', buyIn: '55', time: '19:00', dayOfWeek: 1 }),
      makeTournament({ id: '4', buyIn: '11', time: '20:00', dayOfWeek: 2 }),
      makeTournament({ id: '5', buyIn: '22', time: '21:00', dayOfWeek: 3 }),
      makeTournament({ id: '6', buyIn: '109', time: '19:00', dayOfWeek: 4 }),
      // Dia 5 e 6: OFF, mas tem torneios (devem ser ignorados)
      makeTournament({ id: '7', buyIn: '500', time: '18:00', dayOfWeek: 5 }),
      makeTournament({ id: '8', buyIn: '500', time: '22:00', dayOfWeek: 6 }),
    ];
    const profiles = [
      makeProfileState(0, 'A'),   // seg
      makeProfileState(1, 'A'),   // ter
      makeProfileState(2, 'B'),   // qua
      makeProfileState(3, 'B'),   // qui
      makeProfileState(4, 'C'),   // sex
      makeProfileState(5, 'OFF'), // sab
      makeProfileState(6, 'OFF'), // dom
    ];
    const result = calculateWeeklySummary(tournaments, profiles);

    expect(result.totalBuyIn).toBe(252);       // 22+33+55+11+22+109 (sem 500+500)
    expect(result.tournamentCount).toBe(6);     // sem os 2 de dias OFF
    expect(result.averageBuyIn).toBe(42);       // 252/6
    expect(result.activeDays).toBe(5);          // 3A + 2B + 0OFF (C tambem conta)... 2A+2B+1C=5
    expect(result.estimatedHours).toBeGreaterThan(0);
  });
});
