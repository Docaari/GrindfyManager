import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes para cenarios noturnos (grades que cruzam meia-noite)
//
// Cobrem os fixes das Issues 1-4 do review:
// - Issue 1: findSlot com slots noturnos
// - Issue 2: filtro de horario com range noturno
// - Issue 3: estimatedHours negativo para ranges noturnos
// - Issue 4: priority vs prioridade mismatch
// =============================================================================

import { groupTournamentsBySlot } from '../../../shared/grade-slot-grouping';
import { filterLibraryTournaments } from '../../../shared/library-filters';
import { calculateDayMetrics } from '../../../shared/grade-day-metrics';
import { calculateWeeklySummary } from '../../../shared/weekly-summary';
import { prepareTournamentChip } from '../../../shared/grade-chip-data';

// ---------------------------------------------------------------------------
// Issue 1: findSlot com slots noturnos
// ---------------------------------------------------------------------------

describe('groupTournamentsBySlot — slots noturnos', () => {
  const nocturnalSlots = ['22:00', '23:00', '00:00', '01:00', '02:00'];

  function makeTournament(overrides: Record<string, any> = {}) {
    return {
      id: 'pt-1',
      name: 'Tournament',
      site: 'PokerStars',
      buyIn: '22',
      time: '23:00',
      ...overrides,
    };
  }

  it('deve agrupar torneio das 23:30 no slot 23:00', () => {
    const tournaments = [makeTournament({ time: '23:30' })];
    const result = groupTournamentsBySlot(tournaments, nocturnalSlots);

    expect(result.get('23:00')).toHaveLength(1);
  });

  it('deve agrupar torneio das 00:30 no slot 00:00', () => {
    const tournaments = [makeTournament({ time: '00:30' })];
    const result = groupTournamentsBySlot(tournaments, nocturnalSlots);

    expect(result.get('00:00')).toHaveLength(1);
  });

  it('deve agrupar torneio das 01:45 no slot 01:00', () => {
    const tournaments = [makeTournament({ time: '01:45' })];
    const result = groupTournamentsBySlot(tournaments, nocturnalSlots);

    expect(result.get('01:00')).toHaveLength(1);
  });

  it('deve agrupar torneio das 22:00 no slot 22:00 (exato)', () => {
    const tournaments = [makeTournament({ time: '22:00' })];
    const result = groupTournamentsBySlot(tournaments, nocturnalSlots);

    expect(result.get('22:00')).toHaveLength(1);
  });

  it('deve distribuir torneios noturnos em slots corretos', () => {
    const tournaments = [
      makeTournament({ id: 'pt-1', time: '22:15' }),
      makeTournament({ id: 'pt-2', time: '23:30' }),
      makeTournament({ id: 'pt-3', time: '00:45' }),
      makeTournament({ id: 'pt-4', time: '01:30' }),
    ];
    const result = groupTournamentsBySlot(tournaments, nocturnalSlots);

    expect(result.get('22:00')).toHaveLength(1);
    expect(result.get('23:00')).toHaveLength(1);
    expect(result.get('00:00')).toHaveLength(1);
    expect(result.get('01:00')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Issue 2: filtro de horario com range noturno
// ---------------------------------------------------------------------------

describe('filterLibraryTournaments — range noturno', () => {
  function makeTournament(overrides: Record<string, any> = {}) {
    return {
      id: 'lib-001',
      name: 'Tournament',
      site: 'GGPoker',
      buyIn: '22.00',
      time: '20:00',
      type: 'PKO',
      speed: 'Normal',
      ...overrides,
    };
  }

  it('deve incluir torneio das 23:00 no range 22:00-02:00', () => {
    const tournaments = [makeTournament({ time: '23:00' })];
    const result = filterLibraryTournaments(tournaments, {
      startTime: '22:00',
      endTime: '02:00',
    });

    expect(result).toHaveLength(1);
  });

  it('deve incluir torneio das 01:00 no range 22:00-02:00', () => {
    const tournaments = [makeTournament({ time: '01:00' })];
    const result = filterLibraryTournaments(tournaments, {
      startTime: '22:00',
      endTime: '02:00',
    });

    expect(result).toHaveLength(1);
  });

  it('deve incluir torneio das 22:00 no range 22:00-02:00 (limite exato start)', () => {
    const tournaments = [makeTournament({ time: '22:00' })];
    const result = filterLibraryTournaments(tournaments, {
      startTime: '22:00',
      endTime: '02:00',
    });

    expect(result).toHaveLength(1);
  });

  it('deve incluir torneio das 02:00 no range 22:00-02:00 (limite exato end)', () => {
    const tournaments = [makeTournament({ time: '02:00' })];
    const result = filterLibraryTournaments(tournaments, {
      startTime: '22:00',
      endTime: '02:00',
    });

    expect(result).toHaveLength(1);
  });

  it('deve excluir torneio das 15:00 no range noturno 22:00-02:00', () => {
    const tournaments = [makeTournament({ time: '15:00' })];
    const result = filterLibraryTournaments(tournaments, {
      startTime: '22:00',
      endTime: '02:00',
    });

    expect(result).toHaveLength(0);
  });

  it('deve excluir torneio das 10:00 no range noturno 22:00-02:00', () => {
    const tournaments = [makeTournament({ time: '10:00' })];
    const result = filterLibraryTournaments(tournaments, {
      startTime: '22:00',
      endTime: '02:00',
    });

    expect(result).toHaveLength(0);
  });

  it('deve filtrar corretamente mix de torneios com range noturno', () => {
    const tournaments = [
      makeTournament({ id: '1', time: '22:00' }),  // incluir
      makeTournament({ id: '2', time: '23:30' }),  // incluir
      makeTournament({ id: '3', time: '01:00' }),  // incluir
      makeTournament({ id: '4', time: '15:00' }),  // excluir
      makeTournament({ id: '5', time: '08:00' }),  // excluir
      makeTournament({ id: '6', time: '02:00' }),  // incluir
    ];
    const result = filterLibraryTournaments(tournaments, {
      startTime: '22:00',
      endTime: '02:00',
    });

    expect(result).toHaveLength(4);
    expect(result.map((t) => t.id)).toContain('1');
    expect(result.map((t) => t.id)).toContain('2');
    expect(result.map((t) => t.id)).toContain('3');
    expect(result.map((t) => t.id)).toContain('6');
  });
});

// ---------------------------------------------------------------------------
// Issue 3: estimatedHours negativo para ranges noturnos
// ---------------------------------------------------------------------------

describe('calculateDayMetrics — range noturno', () => {
  function makeTournament(overrides: Record<string, any> = {}) {
    return {
      buyIn: '22',
      time: '19:00',
      site: 'PokerStars',
      type: 'Vanilla',
      speed: 'Normal',
      ...overrides,
    };
  }

  it('deve calcular estimatedHours positivo para range 22:00-01:00 (3h)', () => {
    const tournaments = [
      makeTournament({ time: '22:00' }),
      makeTournament({ time: '01:00' }),
    ];
    const result = calculateDayMetrics(tournaments);

    expect(result.estimatedHours).toBe(3);
  });

  it('deve calcular estimatedHours positivo para range 23:00-02:00 (3h)', () => {
    const tournaments = [
      makeTournament({ time: '23:00' }),
      makeTournament({ time: '02:00' }),
    ];
    const result = calculateDayMetrics(tournaments);

    expect(result.estimatedHours).toBe(3);
  });

  it('nunca deve retornar estimatedHours negativo', () => {
    const tournaments = [
      makeTournament({ time: '22:00' }),
      makeTournament({ time: '00:00' }),
    ];
    const result = calculateDayMetrics(tournaments);

    expect(result.estimatedHours).toBeGreaterThanOrEqual(0);
    expect(result.estimatedHours).toBe(2);
  });
});

describe('calculateWeeklySummary — range noturno', () => {
  function makeTournament(overrides: Record<string, any> = {}) {
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

  it('deve calcular estimatedHours positivo para dia com range noturno', () => {
    const tournaments = [
      makeTournament({ id: '1', time: '22:00', dayOfWeek: 1 }),
      makeTournament({ id: '2', time: '01:00', dayOfWeek: 1 }),
    ];
    const profiles = [{ dayOfWeek: 1, activeProfile: 'A' }];
    const result = calculateWeeklySummary(tournaments, profiles);

    expect(result.estimatedHours).toBe(3);
  });

  it('nunca deve retornar estimatedHours negativo em weekly summary', () => {
    const tournaments = [
      makeTournament({ id: '1', time: '23:00', dayOfWeek: 1 }),
      makeTournament({ id: '2', time: '02:00', dayOfWeek: 1 }),
    ];
    const profiles = [{ dayOfWeek: 1, activeProfile: 'A' }];
    const result = calculateWeeklySummary(tournaments, profiles);

    expect(result.estimatedHours).toBeGreaterThanOrEqual(0);
    expect(result.estimatedHours).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Issue 4: priority vs prioridade mismatch
// ---------------------------------------------------------------------------

describe('prepareTournamentChip — prioridade fallback', () => {
  function makeTournament(overrides: Record<string, any> = {}) {
    return {
      id: 'pt-1',
      name: 'Sunday Million',
      site: 'PokerStars',
      buyIn: '22',
      time: '19:00',
      type: 'Vanilla',
      speed: 'Normal',
      lateRegMinutes: null,
      ...overrides,
    };
  }

  it('deve usar prioridade quando priority nao esta definido', () => {
    const result = prepareTournamentChip(makeTournament({ prioridade: 1 }));
    expect(result.priorityIndicator).toBe('star');
  });

  it('deve usar prioridade=3 como "low" quando priority nao esta definido', () => {
    const result = prepareTournamentChip(makeTournament({ prioridade: 3 }));
    expect(result.priorityIndicator).toBe('low');
  });

  it('deve usar priority quando ambos estao definidos (priority tem precedencia)', () => {
    const result = prepareTournamentChip(makeTournament({ priority: 1, prioridade: 3 }));
    expect(result.priorityIndicator).toBe('star');
  });

  it('deve usar default 2 (null indicator) quando nenhum campo esta definido', () => {
    const result = prepareTournamentChip(makeTournament({}));
    expect(result.priorityIndicator).toBeNull();
  });

  it('deve usar prioridade=2 como null indicator', () => {
    const result = prepareTournamentChip(makeTournament({ prioridade: 2 }));
    expect(result.priorityIndicator).toBeNull();
  });
});
