import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Slot Grouping — agrupa torneios planejados por slot de horario
//
// O modulo shared/grade-slot-grouping.ts AINDA NAO EXISTE.
// O Implementer vai cria-lo.
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Imports que AINDA NAO EXISTEM — serao criados pelo Implementer
// ---------------------------------------------------------------------------
import { groupTournamentsBySlot } from '../../../shared/grade-slot-grouping';

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
    dayOfWeek: 1,
    profile: 'A',
    ...overrides,
  };
}

const defaultSlots = ['18:00', '19:00', '20:00', '21:00', '22:00'];

// =============================================================================
// Grupo 2: groupTournamentsBySlot
// =============================================================================

describe('groupTournamentsBySlot', () => {

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('deve agrupar torneio com time="19:00" no slot "19:00"', () => {
    const tournaments = [makeTournament({ time: '19:00' })];
    const result = groupTournamentsBySlot(tournaments, defaultSlots);

    expect(result.get('19:00')).toHaveLength(1);
    expect(result.get('19:00')![0].name).toBe('Tournament');
  });

  it('deve agrupar multiplos torneios no mesmo slot', () => {
    const tournaments = [
      makeTournament({ id: 'pt-1', time: '19:00', buyIn: '55' }),
      makeTournament({ id: 'pt-2', time: '19:00', buyIn: '22' }),
      makeTournament({ id: 'pt-3', time: '19:00', buyIn: '33' }),
    ];
    const result = groupTournamentsBySlot(tournaments, defaultSlots);

    expect(result.get('19:00')).toHaveLength(3);
  });

  it('deve distribuir torneios em slots diferentes', () => {
    const tournaments = [
      makeTournament({ id: 'pt-1', time: '18:00' }),
      makeTournament({ id: 'pt-2', time: '20:00' }),
      makeTournament({ id: 'pt-3', time: '22:00' }),
    ];
    const result = groupTournamentsBySlot(tournaments, defaultSlots);

    expect(result.get('18:00')).toHaveLength(1);
    expect(result.get('20:00')).toHaveLength(1);
    expect(result.get('22:00')).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Arredondamento para baixo (torneio entre slots)
  // -------------------------------------------------------------------------

  it('deve arredondar time="19:30" para slot "19:00"', () => {
    const tournaments = [makeTournament({ time: '19:30' })];
    const result = groupTournamentsBySlot(tournaments, defaultSlots);

    expect(result.get('19:00')).toHaveLength(1);
  });

  it('deve arredondar time="19:45" para slot "19:00"', () => {
    const tournaments = [makeTournament({ time: '19:45' })];
    const result = groupTournamentsBySlot(tournaments, defaultSlots);

    expect(result.get('19:00')).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Torneio sem horario
  // -------------------------------------------------------------------------

  it('deve colocar torneio com time=null no slot "unscheduled"', () => {
    const tournaments = [makeTournament({ time: null })];
    const result = groupTournamentsBySlot(tournaments, defaultSlots);

    expect(result.get('unscheduled')).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Ordenacao dentro do slot
  // -------------------------------------------------------------------------

  it('deve ordenar torneios dentro de cada slot por buyIn decrescente', () => {
    const tournaments = [
      makeTournament({ id: 'pt-1', time: '19:00', buyIn: '5.50' }),
      makeTournament({ id: 'pt-2', time: '19:00', buyIn: '109' }),
      makeTournament({ id: 'pt-3', time: '19:00', buyIn: '22' }),
    ];
    const result = groupTournamentsBySlot(tournaments, defaultSlots);
    const slot = result.get('19:00')!;

    expect(parseFloat(slot[0].buyIn)).toBe(109);
    expect(parseFloat(slot[1].buyIn)).toBe(22);
    expect(parseFloat(slot[2].buyIn)).toBe(5.50);
  });

  // -------------------------------------------------------------------------
  // Array vazio
  // -------------------------------------------------------------------------

  it('deve retornar Map vazio quando nao ha torneios', () => {
    const result = groupTournamentsBySlot([], defaultSlots);
    expect(result.size).toBe(0);
  });
});
