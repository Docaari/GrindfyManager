import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Testes TDD: RF-03 — CTA contextual Grade para Grind (FP-06)
//
// Funcoes puras que determinam se o banner CTA deve ser exibido e seu conteudo:
//   - `shouldShowGrindCTA`: decide se o banner deve aparecer
//   - `getGrindCTAData`: retorna dados do banner (contagem de torneios)
//   - `getTodayDayOfWeek`: retorna o dia da semana no formato do sistema
//
// Modulo esperado: `client/src/components/grade-planner/grind-cta-helpers.ts`
//
// Todos devem FALHAR (red phase) — funcoes ainda nao existem.
// =============================================================================

// Estas funcoes AINDA NAO EXISTEM
// import {
//   shouldShowGrindCTA,
//   getGrindCTAData,
//   getTodayDayOfWeek,
// } from '../../../client/src/components/grade-planner/grind-cta-helpers';

interface ProfileState {
  dayOfWeek: number;
  activeProfile: 'A' | 'B' | 'C' | 'OFF';
}

interface GrindCTAData {
  show: boolean;
  tournamentCount: number;
}

// Stubs para compilacao — Implementer substituira
let shouldShowGrindCTA: (
  todayDayOfWeek: number,
  profileStates: ProfileState[],
  plannedTournaments: any[],
  dismissed: boolean,
) => boolean;

let getGrindCTAData: (
  todayDayOfWeek: number,
  profileStates: ProfileState[],
  plannedTournaments: any[],
) => GrindCTAData;

let getTodayDayOfWeek: () => number;

try {
  const mod = require('../../../client/src/components/grade-planner/grind-cta-helpers');
  if (mod.shouldShowGrindCTA) shouldShowGrindCTA = mod.shouldShowGrindCTA;
  if (mod.getGrindCTAData) getGrindCTAData = mod.getGrindCTAData;
  if (mod.getTodayDayOfWeek) getTodayDayOfWeek = mod.getTodayDayOfWeek;
} catch {
  // Esperado em red phase
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const profileStatesAllActive: ProfileState[] = [
  { dayOfWeek: 0, activeProfile: 'A' },
  { dayOfWeek: 1, activeProfile: 'A' },
  { dayOfWeek: 2, activeProfile: 'B' },
  { dayOfWeek: 3, activeProfile: 'C' },
  { dayOfWeek: 4, activeProfile: 'A' },
  { dayOfWeek: 5, activeProfile: 'OFF' },
  { dayOfWeek: 6, activeProfile: 'OFF' },
];

const mondayTournaments = [
  { id: 't1', dayOfWeek: 1, name: 'Monday Starter', time: '18:00', buyIn: '22', site: 'PokerStars', isActive: true },
  { id: 't2', dayOfWeek: 1, name: 'Monday Grind', time: '19:30', buyIn: '55', site: 'GGPoker', isActive: true },
  { id: 't3', dayOfWeek: 1, name: 'Monday Main', time: '21:00', buyIn: '109', site: 'PokerStars', isActive: true },
];

const saturdayTournaments = [
  { id: 't4', dayOfWeek: 5, name: 'Saturday Special', time: '20:00', buyIn: '33', site: '888poker', isActive: true },
];

const allTournaments = [...mondayTournaments, ...saturdayTournaments];

// ---------------------------------------------------------------------------
// shouldShowGrindCTA — decide se o banner deve aparecer
// ---------------------------------------------------------------------------

describe('shouldShowGrindCTA', () => {
  it('deve retornar true quando hoje tem perfil ativo e torneios planejados', () => {
    // segunda-feira (dayOfWeek=1) tem perfil A e 3 torneios
    expect(shouldShowGrindCTA(1, profileStatesAllActive, allTournaments, false)).toBe(true);
  });

  it('deve retornar false quando hoje e dia OFF', () => {
    // sabado (dayOfWeek=5) tem perfil OFF
    expect(shouldShowGrindCTA(5, profileStatesAllActive, saturdayTournaments, false)).toBe(false);
  });

  it('deve retornar false quando hoje nao tem torneios planejados', () => {
    // quarta-feira (dayOfWeek=3) tem perfil C mas sem torneios
    expect(shouldShowGrindCTA(3, profileStatesAllActive, allTournaments, false)).toBe(false);
  });

  it('deve retornar false quando banner foi dispensado (dismissed=true)', () => {
    expect(shouldShowGrindCTA(1, profileStatesAllActive, allTournaments, true)).toBe(false);
  });

  it('deve retornar false quando nao ha torneios em nenhum dia', () => {
    expect(shouldShowGrindCTA(1, profileStatesAllActive, [], false)).toBe(false);
  });

  it('deve retornar false quando profileStates esta vazio', () => {
    expect(shouldShowGrindCTA(1, [], allTournaments, false)).toBe(false);
  });

  it('deve retornar false quando dia nao tem perfil definido nos states', () => {
    const partialStates: ProfileState[] = [
      { dayOfWeek: 0, activeProfile: 'A' },
      // dayOfWeek 1 nao esta definido
    ];
    expect(shouldShowGrindCTA(1, partialStates, allTournaments, false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getGrindCTAData — retorna dados para renderizar o banner
// ---------------------------------------------------------------------------

describe('getGrindCTAData', () => {
  it('deve retornar show=true e contagem correta quando ha torneios hoje', () => {
    const result = getGrindCTAData(1, profileStatesAllActive, allTournaments);
    expect(result.show).toBe(true);
    expect(result.tournamentCount).toBe(3); // 3 torneios na segunda
  });

  it('deve retornar show=false e contagem 0 quando dia e OFF', () => {
    const result = getGrindCTAData(5, profileStatesAllActive, saturdayTournaments);
    expect(result.show).toBe(false);
    expect(result.tournamentCount).toBe(0);
  });

  it('deve retornar show=false e contagem 0 quando nao ha torneios hoje', () => {
    const result = getGrindCTAData(3, profileStatesAllActive, allTournaments);
    expect(result.show).toBe(false);
    expect(result.tournamentCount).toBe(0);
  });

  it('deve contar apenas torneios do dia especificado (nao de outros dias)', () => {
    const result = getGrindCTAData(1, profileStatesAllActive, allTournaments);
    // allTournaments tem 3 da segunda + 1 do sabado. Deve contar apenas 3
    expect(result.tournamentCount).toBe(3);
  });

  it('deve contar apenas torneios ativos', () => {
    const withInactive = [
      ...mondayTournaments,
      { id: 't-inactive', dayOfWeek: 1, name: 'Inactive', time: '22:00', buyIn: '10', site: 'WPN', isActive: false },
    ];
    const result = getGrindCTAData(1, profileStatesAllActive, withInactive);
    expect(result.tournamentCount).toBe(3); // apenas os 3 ativos
  });
});

// ---------------------------------------------------------------------------
// getTodayDayOfWeek — retorna dia da semana no formato do sistema (0-6)
// ---------------------------------------------------------------------------

describe('getTodayDayOfWeek', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deve retornar 1 para uma segunda-feira', () => {
    // 2026-04-06 e segunda-feira
    vi.setSystemTime(new Date('2026-04-06T12:00:00'));
    expect(getTodayDayOfWeek()).toBe(1);
  });

  it('deve retornar 0 para um domingo', () => {
    // 2026-04-05 e domingo
    vi.setSystemTime(new Date('2026-04-05T12:00:00'));
    expect(getTodayDayOfWeek()).toBe(0);
  });

  it('deve retornar 5 para uma sexta-feira', () => {
    // 2026-04-10 e sexta-feira
    vi.setSystemTime(new Date('2026-04-10T12:00:00'));
    expect(getTodayDayOfWeek()).toBe(5);
  });

  it('deve retornar 6 para um sabado', () => {
    // 2026-04-11 e sabado
    vi.setSystemTime(new Date('2026-04-11T12:00:00'));
    expect(getTodayDayOfWeek()).toBe(6);
  });
});
