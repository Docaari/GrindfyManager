import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Drop Mapping — mapeia dados da biblioteca para planned_tournament
// e calcula moves entre celulas da grade
//
// O modulo shared/drag-drop-utils.ts AINDA NAO EXISTE.
// O Implementer vai cria-lo com as funcoes abaixo.
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Imports que AINDA NAO EXISTEM — serao criados pelo Implementer
// ---------------------------------------------------------------------------
import {
  mapLibraryToPlanned,
  calculateMove,
} from '../../../shared/drag-drop-utils';

// ---------------------------------------------------------------------------
// Helpers de teste
// ---------------------------------------------------------------------------

function makeLibraryTournament(overrides: Record<string, any> = {}) {
  return {
    id: 'lib-abc123',
    userId: 'USER-0001',
    name: 'Sunday Million',
    site: 'PokerStars',
    buyIn: '109',
    guaranteed: '1000000',
    time: '20:00',
    type: 'Vanilla',
    speed: 'Normal',
    fieldSize: 5000,
    source: 'suprema',
    externalId: 'suprema-12345',
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    lateRegMinutes: 120,
    gameType: 'NLH',
    startingStack: 10000,
    maxPlayers: 9,
    blindLevelMinutes: 12,
    ...overrides,
  };
}

function makeDestination(overrides: Record<string, any> = {}) {
  return {
    dayOfWeek: 0,
    time: '20:00',
    profile: 'A',
    ...overrides,
  };
}

function makePlannedTournament(overrides: Record<string, any> = {}) {
  return {
    id: 'pt-xyz789',
    userId: 'USER-0001',
    name: 'Sunday Million',
    site: 'PokerStars',
    buyIn: '109',
    type: 'Vanilla',
    speed: 'Normal',
    dayOfWeek: 1,
    time: '19:00',
    profile: 'A',
    status: 'upcoming',
    priority: 2,
    lateRegMinutes: 120,
    gameType: 'NLH',
    startingStack: 10000,
    maxPlayers: 9,
    blindLevelMinutes: 12,
    ...overrides,
  };
}

// =============================================================================
// Grupo 2: mapLibraryToPlanned — biblioteca -> planned_tournament
// =============================================================================

describe('mapLibraryToPlanned', () => {

  // ---------------------------------------------------------------------------
  // Campos copiados da biblioteca
  // ---------------------------------------------------------------------------

  it('deve copiar name da biblioteca para planned_tournament', () => {
    const lib = makeLibraryTournament({ name: 'Sunday Million' });
    const dest = makeDestination();

    const result = mapLibraryToPlanned(lib, dest);

    expect(result.name).toBe('Sunday Million');
  });

  it('deve copiar site da biblioteca para planned_tournament', () => {
    const lib = makeLibraryTournament({ site: 'GGNetwork' });
    const dest = makeDestination();

    const result = mapLibraryToPlanned(lib, dest);

    expect(result.site).toBe('GGNetwork');
  });

  it('deve copiar buyIn da biblioteca para planned_tournament', () => {
    const lib = makeLibraryTournament({ buyIn: '55' });
    const dest = makeDestination();

    const result = mapLibraryToPlanned(lib, dest);

    expect(result.buyIn).toBe('55');
  });

  it('deve copiar guaranteed da biblioteca para planned_tournament', () => {
    const lib = makeLibraryTournament({ guaranteed: '500000' });
    const dest = makeDestination();

    const result = mapLibraryToPlanned(lib, dest);

    expect(result.guaranteed).toBe('500000');
  });

  it('deve copiar type da biblioteca para planned_tournament', () => {
    const lib = makeLibraryTournament({ type: 'PKO' });
    const dest = makeDestination();

    const result = mapLibraryToPlanned(lib, dest);

    expect(result.type).toBe('PKO');
  });

  it('deve copiar speed da biblioteca para planned_tournament', () => {
    const lib = makeLibraryTournament({ speed: 'Turbo' });
    const dest = makeDestination();

    const result = mapLibraryToPlanned(lib, dest);

    expect(result.speed).toBe('Turbo');
  });

  // ---------------------------------------------------------------------------
  // Campos definidos pelo destino
  // ---------------------------------------------------------------------------

  it('deve definir dayOfWeek com valor do destino', () => {
    const dest = makeDestination({ dayOfWeek: 3 });

    const result = mapLibraryToPlanned(makeLibraryTournament(), dest);

    expect(result.dayOfWeek).toBe(3);
  });

  it('deve definir profile com valor do destino', () => {
    const dest = makeDestination({ profile: 'B' });

    const result = mapLibraryToPlanned(makeLibraryTournament(), dest);

    expect(result.profile).toBe('B');
  });

  it('deve preservar o time da biblioteca, ignorando o time do destino', () => {
    const lib = makeLibraryTournament({ time: '13:30' });
    const dest = makeDestination({ time: '11:00' });

    const result = mapLibraryToPlanned(lib, dest);

    // O bloco onde o torneio cai define so o dia — o horario e o original.
    expect(result.time).toBe('13:30');
  });

  it('deve usar o time do destino quando a biblioteca nao tem time', () => {
    const lib = makeLibraryTournament({ time: null });
    const dest = makeDestination({ time: '21:00' });

    const result = mapLibraryToPlanned(lib, dest);

    expect(result.time).toBe('21:00');
  });

  // ---------------------------------------------------------------------------
  // Campos com valores padrao
  // ---------------------------------------------------------------------------

  it('deve definir status como "upcoming"', () => {
    const result = mapLibraryToPlanned(makeLibraryTournament(), makeDestination());

    expect(result.status).toBe('upcoming');
  });

  it('deve definir prioridade como 2 (default)', () => {
    const result = mapLibraryToPlanned(makeLibraryTournament(), makeDestination());

    expect(result.priority).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Campos enriquecidos preservados (dados da Suprema)
  // ---------------------------------------------------------------------------

  it('deve preservar lateRegMinutes quando presente na biblioteca', () => {
    const lib = makeLibraryTournament({ lateRegMinutes: 90 });

    const result = mapLibraryToPlanned(lib, makeDestination());

    expect(result.lateRegMinutes).toBe(90);
  });

  it('deve preservar gameType quando presente na biblioteca', () => {
    const lib = makeLibraryTournament({ gameType: 'PLO' });

    const result = mapLibraryToPlanned(lib, makeDestination());

    expect(result.gameType).toBe('PLO');
  });

  it('deve preservar startingStack quando presente na biblioteca', () => {
    const lib = makeLibraryTournament({ startingStack: 25000 });

    const result = mapLibraryToPlanned(lib, makeDestination());

    expect(result.startingStack).toBe(25000);
  });

  it('deve preservar maxPlayers quando presente na biblioteca', () => {
    const lib = makeLibraryTournament({ maxPlayers: 6 });

    const result = mapLibraryToPlanned(lib, makeDestination());

    expect(result.maxPlayers).toBe(6);
  });

  it('deve preservar blindLevelMinutes quando presente na biblioteca', () => {
    const lib = makeLibraryTournament({ blindLevelMinutes: 8 });

    const result = mapLibraryToPlanned(lib, makeDestination());

    expect(result.blindLevelMinutes).toBe(8);
  });

  // ---------------------------------------------------------------------------
  // Campos enriquecidos null (torneio manual sem dados Suprema)
  // ---------------------------------------------------------------------------

  it('deve manter lateRegMinutes null quando nao presente', () => {
    const lib = makeLibraryTournament({ lateRegMinutes: null });

    const result = mapLibraryToPlanned(lib, makeDestination());

    expect(result.lateRegMinutes).toBeNull();
  });

  it('deve manter gameType null quando nao presente', () => {
    const lib = makeLibraryTournament({ gameType: null });

    const result = mapLibraryToPlanned(lib, makeDestination());

    expect(result.gameType).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Campos que NAO devem ser copiados
  // ---------------------------------------------------------------------------

  it('nao deve copiar id da biblioteca', () => {
    const lib = makeLibraryTournament({ id: 'lib-abc123' });

    const result = mapLibraryToPlanned(lib, makeDestination());

    expect(result).not.toHaveProperty('id');
  });

  it('nao deve copiar userId da biblioteca', () => {
    const lib = makeLibraryTournament({ userId: 'USER-0001' });

    const result = mapLibraryToPlanned(lib, makeDestination());

    expect(result).not.toHaveProperty('userId');
  });

  it('nao deve copiar source da biblioteca', () => {
    const lib = makeLibraryTournament({ source: 'suprema' });

    const result = mapLibraryToPlanned(lib, makeDestination());

    expect(result).not.toHaveProperty('source');
  });

  it('nao deve copiar deletedAt da biblioteca', () => {
    const result = mapLibraryToPlanned(makeLibraryTournament(), makeDestination());

    expect(result).not.toHaveProperty('deletedAt');
  });

  it('nao deve copiar createdAt da biblioteca', () => {
    const result = mapLibraryToPlanned(makeLibraryTournament(), makeDestination());

    expect(result).not.toHaveProperty('createdAt');
  });

  it('nao deve copiar updatedAt da biblioteca', () => {
    const result = mapLibraryToPlanned(makeLibraryTournament(), makeDestination());

    expect(result).not.toHaveProperty('updatedAt');
  });

  it('nao deve copiar externalId da biblioteca', () => {
    const result = mapLibraryToPlanned(makeLibraryTournament(), makeDestination());

    expect(result).not.toHaveProperty('externalId');
  });

  // ---------------------------------------------------------------------------
  // Cenario completo: todos os campos corretos juntos
  // ---------------------------------------------------------------------------

  it('deve mapear corretamente todos os campos em cenario completo', () => {
    const lib = makeLibraryTournament({
      name: 'Bounty Hunter $33',
      site: 'GGNetwork',
      buyIn: '33',
      guaranteed: '100000',
      type: 'PKO',
      speed: 'Turbo',
      time: '13:30',
      lateRegMinutes: 60,
      gameType: 'NLH',
      startingStack: 15000,
      maxPlayers: 8,
      blindLevelMinutes: 10,
    });
    const dest = makeDestination({ dayOfWeek: 5, time: '22:00', profile: 'C' });

    const result = mapLibraryToPlanned(lib, dest);

    expect(result).toEqual({
      name: 'Bounty Hunter $33',
      site: 'GGNetwork',
      buyIn: '33',
      guaranteed: '100000',
      type: 'PKO',
      speed: 'Turbo',
      dayOfWeek: 5,
      // time preservado da biblioteca (13:30), nao o do destino (22:00).
      time: '13:30',
      profile: 'C',
      status: 'upcoming',
      priority: 2,
      lateRegMinutes: 60,
      gameType: 'NLH',
      startingStack: 15000,
      maxPlayers: 8,
      blindLevelMinutes: 10,
    });
  });

  // ---------------------------------------------------------------------------
  // Torneio manual minimo (sem campos enriquecidos)
  // ---------------------------------------------------------------------------

  it('deve mapear torneio manual sem campos enriquecidos', () => {
    const lib = makeLibraryTournament({
      name: 'Torneio Manual',
      site: 'WPN',
      buyIn: '11',
      guaranteed: null,
      type: null,
      speed: null,
      source: 'manual',
      externalId: null,
      lateRegMinutes: null,
      gameType: null,
      startingStack: null,
      maxPlayers: null,
      blindLevelMinutes: null,
    });
    const dest = makeDestination({ dayOfWeek: 4, time: '18:00', profile: 'A' });

    const result = mapLibraryToPlanned(lib, dest);

    expect(result.name).toBe('Torneio Manual');
    expect(result.site).toBe('WPN');
    expect(result.buyIn).toBe('11');
    expect(result.guaranteed).toBeNull();
    expect(result.type).toBeNull();
    expect(result.speed).toBeNull();
    expect(result.dayOfWeek).toBe(4);
    // lib tem time '20:00' (default do helper) — preservado, nao o do destino.
    expect(result.time).toBe('20:00');
    expect(result.profile).toBe('A');
    expect(result.status).toBe('upcoming');
    expect(result.priority).toBe(2);
    expect(result.lateRegMinutes).toBeNull();
    expect(result.gameType).toBeNull();
    expect(result.startingStack).toBeNull();
    expect(result.maxPlayers).toBeNull();
    expect(result.blindLevelMinutes).toBeNull();
  });
});

// =============================================================================
// Grupo 3: calculateMove — reposicionar torneio entre celulas
// =============================================================================

describe('calculateMove', () => {

  // ---------------------------------------------------------------------------
  // Happy path: mover para outro dia/horario
  // ---------------------------------------------------------------------------

  it('deve atualizar dayOfWeek ao mover para outro dia', () => {
    const tournament = makePlannedTournament({ dayOfWeek: 1, time: '19:00' });

    const result = calculateMove(tournament, 3, '19:00');

    expect(result.updates.dayOfWeek).toBe(3);
  });

  it('deve atualizar time ao mover para outro horario', () => {
    const tournament = makePlannedTournament({ dayOfWeek: 1, time: '19:00' });

    const result = calculateMove(tournament, 1, '21:00');

    expect(result.updates.time).toBe('21:00');
  });

  it('deve atualizar dayOfWeek e time ao mover para outro dia e horario', () => {
    const tournament = makePlannedTournament({ dayOfWeek: 1, time: '19:00' });

    const result = calculateMove(tournament, 5, '22:00');

    expect(result.updates.dayOfWeek).toBe(5);
    expect(result.updates.time).toBe('22:00');
  });

  // ---------------------------------------------------------------------------
  // Noop: mesma celula
  // ---------------------------------------------------------------------------

  it('deve retornar updates vazio quando mesma celula (noop)', () => {
    const tournament = makePlannedTournament({ dayOfWeek: 2, time: '20:00' });

    const result = calculateMove(tournament, 2, '20:00');

    expect(result.updates).toEqual({});
  });

  // ---------------------------------------------------------------------------
  // Garantir que outros campos NAO sao incluidos nos updates
  // ---------------------------------------------------------------------------

  it('nao deve incluir name nos updates', () => {
    const tournament = makePlannedTournament();

    const result = calculateMove(tournament, 3, '21:00');

    expect(result.updates).not.toHaveProperty('name');
  });

  it('nao deve incluir buyIn nos updates', () => {
    const tournament = makePlannedTournament();

    const result = calculateMove(tournament, 3, '21:00');

    expect(result.updates).not.toHaveProperty('buyIn');
  });

  it('nao deve incluir site nos updates', () => {
    const tournament = makePlannedTournament();

    const result = calculateMove(tournament, 3, '21:00');

    expect(result.updates).not.toHaveProperty('site');
  });

  it('nao deve incluir profile nos updates', () => {
    const tournament = makePlannedTournament();

    const result = calculateMove(tournament, 3, '21:00');

    expect(result.updates).not.toHaveProperty('profile');
  });

  it('nao deve incluir status nos updates', () => {
    const tournament = makePlannedTournament();

    const result = calculateMove(tournament, 3, '21:00');

    expect(result.updates).not.toHaveProperty('status');
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('deve funcionar ao mover para domingo (dayOfWeek=0)', () => {
    const tournament = makePlannedTournament({ dayOfWeek: 6, time: '20:00' });

    const result = calculateMove(tournament, 0, '20:00');

    expect(result.updates.dayOfWeek).toBe(0);
  });

  it('deve funcionar ao mover para horario de madrugada', () => {
    const tournament = makePlannedTournament({ dayOfWeek: 1, time: '20:00' });

    const result = calculateMove(tournament, 1, '02:00');

    expect(result.updates.time).toBe('02:00');
  });

  it('deve incluir apenas dayOfWeek quando so o dia muda', () => {
    const tournament = makePlannedTournament({ dayOfWeek: 1, time: '19:00' });

    const result = calculateMove(tournament, 4, '19:00');

    expect(result.updates).toEqual({ dayOfWeek: 4 });
  });

  it('deve incluir apenas time quando so o horario muda', () => {
    const tournament = makePlannedTournament({ dayOfWeek: 3, time: '19:00' });

    const result = calculateMove(tournament, 3, '22:00');

    expect(result.updates).toEqual({ time: '22:00' });
  });
});
