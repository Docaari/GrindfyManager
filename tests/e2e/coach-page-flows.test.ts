import { describe, it, expect } from 'vitest';

// Grade hours
import { generateTimeSlots, validateGradeHours } from '@shared/grade-hours';

// Profile utilities
import {
  isProfileActive,
  canAcceptTournament,
  getProfileColor,
  getProfileLabel,
} from '@shared/grade-profile-utils';

// Slot grouping
import { groupTournamentsBySlot } from '@shared/grade-slot-grouping';

// Day metrics
import { calculateDayMetrics } from '@shared/grade-day-metrics';

// Weekly summary
import { calculateWeeklySummary } from '@shared/weekly-summary';

// Profile comparison
import { calculateProfileComparison } from '@shared/profile-comparison';

// Library filters
import { filterLibraryTournaments } from '@shared/library-filters';

// Drag & drop
import {
  validateDrop,
  mapLibraryToPlanned,
  calculateMove,
} from '@shared/drag-drop-utils';

// Cell overflow
import { getCellDisplayInfo } from '@shared/grade-cell-overflow';

// Chip data
import { prepareTournamentChip } from '@shared/grade-chip-data';

// Off toggle warning
import { checkOffToggleWarning } from '@shared/grade-off-toggle';

// Platform currency
import {
  formatBuyIn,
  groupBuyInsByCurrency,
  formatGroupedBuyIns,
  getCurrencyForSite,
} from '@shared/platform-currency';

// Suprema sync
import { processSupremaSync } from '@shared/library-suprema-sync';


// =============================================================================
// Fluxo 1: Planejamento completo de uma semana
// =============================================================================

describe('Fluxo 1: Planejamento completo de uma semana', () => {
  // Profile states: Seg=A(1), Ter=A(2), Qua=B(3), Qui=OFF(4), Sex=A(5), Sab=C(6), Dom=OFF(0)
  const profileStates = [
    { dayOfWeek: 1, activeProfile: 'A' },
    { dayOfWeek: 2, activeProfile: 'A' },
    { dayOfWeek: 3, activeProfile: 'B' },
    { dayOfWeek: 4, activeProfile: 'OFF' },
    { dayOfWeek: 5, activeProfile: 'A' },
    { dayOfWeek: 6, activeProfile: 'C' },
    { dayOfWeek: 0, activeProfile: 'OFF' },
  ];

  const tournaments = [
    { id: '1', name: 'T1', site: 'PokerStars', buyIn: '22', time: '18:00', dayOfWeek: 1, type: 'Vanilla', speed: 'Normal' },
    { id: '2', name: 'T2', site: 'GGPoker', buyIn: '11', time: '19:00', dayOfWeek: 1, type: 'PKO', speed: 'Turbo' },
    { id: '3', name: 'T3', site: 'PokerStars', buyIn: '33', time: '20:00', dayOfWeek: 2, type: 'Vanilla', speed: 'Normal' },
    { id: '4', name: 'T4', site: 'Suprema', buyIn: '15', time: '18:30', dayOfWeek: 3, type: 'PKO', speed: 'Turbo' },
    { id: '5', name: 'T5', site: 'PokerStars', buyIn: '55', time: '21:00', dayOfWeek: 5, type: 'Vanilla', speed: 'Normal' },
    { id: '6', name: 'T6', site: 'iPoker', buyIn: '50', time: '19:00', dayOfWeek: 6, type: 'Vanilla', speed: 'Normal' },
    // Torneio em dia OFF -- deve ser ignorado pelo weekly summary
    { id: '7', name: 'T7', site: 'PokerStars', buyIn: '100', time: '20:00', dayOfWeek: 4, type: 'Vanilla', speed: 'Normal' },
  ];

  it('generateTimeSlots(18, 2) gera slots de 18:00 ate 01:00', () => {
    const slots = generateTimeSlots(18, 2);
    expect(slots).toEqual([
      '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00',
    ]);
  });

  it('validateGradeHours(18, 2) retorna valid=true (8 horas)', () => {
    const result = validateGradeHours(18, 2);
    expect(result).toEqual({ valid: true });
  });

  it('calculateDayMetrics para segunda com 2 torneios retorna metricas corretas', () => {
    const segTournaments = tournaments.filter((t) => t.dayOfWeek === 1);
    const metrics = calculateDayMetrics(segTournaments);

    expect(metrics.tournamentCount).toBe(2);
    expect(metrics.totalBuyIn).toBe(33); // 22 + 11
    expect(metrics.averageBuyIn).toBeCloseTo(16.5);
    expect(metrics.timeRange).toEqual({ start: '18:00', end: '19:00' });
    expect(metrics.sites).toEqual({ PokerStars: 1, GGPoker: 1 });
  });

  it('calculateDayMetrics para dia OFF (qui) com torneio ainda retorna metricas do torneio', () => {
    const quiTournaments = tournaments.filter((t) => t.dayOfWeek === 4);
    const metrics = calculateDayMetrics(quiTournaments);
    expect(metrics.tournamentCount).toBe(1);
    expect(metrics.totalBuyIn).toBe(100);
  });

  it('calculateDayMetrics para dia sem torneios retorna zerado', () => {
    const metrics = calculateDayMetrics([]);
    expect(metrics.tournamentCount).toBe(0);
    expect(metrics.totalBuyIn).toBe(0);
    expect(metrics.averageBuyIn).toBe(0);
    expect(metrics.timeRange).toBeNull();
    expect(metrics.estimatedHours).toBe(0);
  });

  it('calculateWeeklySummary soma apenas dias ativos e ignora OFF', () => {
    const summary = calculateWeeklySummary(tournaments, profileStates);

    // Dias ativos: 1(A), 2(A), 3(B), 5(A), 6(C) = 5 dias
    expect(summary.activeDays).toBe(5);

    // Torneios ativos: T1, T2 (seg), T3 (ter), T4 (qua), T5 (sex), T6 (sab) = 6
    // T7 (qui=OFF) excluido
    expect(summary.tournamentCount).toBe(6);

    // Total buy-in: 22+11+33+15+55+50 = 186
    expect(summary.totalBuyIn).toBe(186);
    expect(summary.averageBuyIn).toBe(186 / 6);
  });

  it('calculateProfileComparison separa torneios por perfil A/B/C', () => {
    const comparison = calculateProfileComparison(tournaments, profileStates);

    // Profile A: dias 1, 2, 5 -> T1, T2, T3, T5
    expect(comparison.A.tournamentCount).toBe(4);
    expect(comparison.A.totalBuyIn).toBe(22 + 11 + 33 + 55); // 121
    expect(comparison.A.hasData).toBe(true);

    // Profile B: dia 3 -> T4
    expect(comparison.B.tournamentCount).toBe(1);
    expect(comparison.B.totalBuyIn).toBe(15);
    expect(comparison.B.hasData).toBe(true);

    // Profile C: dia 6 -> T6
    expect(comparison.C.tournamentCount).toBe(1);
    expect(comparison.C.totalBuyIn).toBe(50);
    expect(comparison.C.hasData).toBe(true);
  });
});


// =============================================================================
// Fluxo 2: Moedas multi-plataforma
// =============================================================================

describe('Fluxo 2: Moedas multi-plataforma', () => {
  const tournaments = [
    { id: '1', name: 'Sunday Special', site: 'PokerStars', buyIn: '22', time: '20:00', type: 'Vanilla', speed: 'Normal' },
    { id: '2', name: 'Suprema Daily', site: 'Suprema', buyIn: '15', time: '19:00', type: 'PKO', speed: 'Turbo' },
    { id: '3', name: 'Euro Major', site: 'iPoker', buyIn: '50', time: '18:00', type: 'Vanilla', speed: 'Normal' },
    { id: '4', name: 'GG Bounty', site: 'GGPoker', buyIn: '11', time: '21:00', type: 'PKO', speed: 'Normal' },
  ];

  it('formatBuyIn formata cada torneio com o simbolo correto da moeda', () => {
    expect(formatBuyIn('22', 'PokerStars')).toBe('$22');
    expect(formatBuyIn('15', 'Suprema')).toBe('R$15');
    expect(formatBuyIn('50', 'iPoker')).toBe('\u20ac50');
    expect(formatBuyIn('11', 'GGPoker')).toBe('$11');
  });

  it('formatBuyIn exibe decimais quando o valor nao e inteiro', () => {
    expect(formatBuyIn('5.50', 'Suprema')).toBe('R$5.50');
    expect(formatBuyIn('2.20', 'PokerStars')).toBe('$2.20');
  });

  it('groupBuyInsByCurrency agrupa totais por moeda', () => {
    const grouped = groupBuyInsByCurrency(tournaments);
    expect(grouped).toEqual({
      USD: 33,  // 22 + 11
      BRL: 15,
      EUR: 50,
    });
  });

  it('formatGroupedBuyIns exibe moedas na ordem USD, BRL, EUR', () => {
    const grouped = { USD: 33, BRL: 15, EUR: 50 };
    expect(formatGroupedBuyIns(grouped)).toBe('$33 + R$15 + \u20ac50');
  });

  it('filtro por moeda USD retorna apenas PokerStars e GGPoker', () => {
    const result = filterLibraryTournaments(tournaments, { currencies: ['USD'] });
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.site).sort()).toEqual(['GGPoker', 'PokerStars']);
  });

  it('filtro por moeda BRL retorna apenas Suprema', () => {
    const result = filterLibraryTournaments(tournaments, { currencies: ['BRL'] });
    expect(result).toHaveLength(1);
    expect(result[0].site).toBe('Suprema');
  });

  it('filtro por moeda EUR retorna apenas iPoker', () => {
    const result = filterLibraryTournaments(tournaments, { currencies: ['EUR'] });
    expect(result).toHaveLength(1);
    expect(result[0].site).toBe('iPoker');
  });

  it('getCurrencyForSite retorna USD como default para site desconhecido', () => {
    expect(getCurrencyForSite('SiteDesconhecido')).toEqual({ code: 'USD', symbol: '$' });
  });
});


// =============================================================================
// Fluxo 3: Drag & Drop da biblioteca para a grade
// =============================================================================

describe('Fluxo 3: Drag & Drop da biblioteca para a grade', () => {
  const libraryTournament = {
    id: 'lib-1',
    name: 'Sunday Million',
    site: 'PokerStars',
    buyIn: '215',
    guaranteed: '1000000',
    type: 'Vanilla',
    speed: 'Normal',
    lateRegMinutes: 120,
    gameType: 'NLH',
    startingStack: 10000,
    maxPlayers: 9,
    blindLevelMinutes: 12,
  };

  it('validateDrop retorna allowed=true para dia ativo com horario valido', () => {
    const result = validateDrop(libraryTournament, {
      dayOfWeek: 1,
      time: '20:00',
      profile: 'A',
    });
    expect(result).toEqual({ allowed: true });
  });

  it('validateDrop retorna allowed=false para dia OFF', () => {
    const result = validateDrop(libraryTournament, {
      dayOfWeek: 4,
      time: '20:00',
      profile: 'OFF',
    });
    expect(result).toEqual({
      allowed: false,
      reason: 'Dia OFF n\u00e3o aceita torneios',
    });
  });

  it('validateDrop retorna allowed=false para perfil null', () => {
    const result = validateDrop(libraryTournament, {
      dayOfWeek: 1,
      time: '20:00',
      profile: null,
    });
    expect(result).toEqual({
      allowed: false,
      reason: 'Dia OFF n\u00e3o aceita torneios',
    });
  });

  it('validateDrop retorna allowed=false quando destino e null', () => {
    const result = validateDrop(libraryTournament, null);
    expect(result).toEqual({ allowed: false, reason: 'Drop cancelado' });
  });

  it('validateDrop retorna allowed=false para horario invalido', () => {
    const result = validateDrop(libraryTournament, {
      dayOfWeek: 1,
      time: '25:00',
      profile: 'A',
    });
    expect(result).toEqual({ allowed: false, reason: 'Hor\u00e1rio inv\u00e1lido' });
  });

  it('mapLibraryToPlanned mapeia todos os campos corretamente', () => {
    const result = mapLibraryToPlanned(libraryTournament, {
      dayOfWeek: 1,
      time: '20:00',
      profile: 'A',
    });

    expect(result).toEqual({
      name: 'Sunday Million',
      site: 'PokerStars',
      buyIn: '215',
      guaranteed: '1000000',
      type: 'Vanilla',
      speed: 'Normal',
      dayOfWeek: 1,
      time: '20:00',
      profile: 'A',
      status: 'upcoming',
      priority: 2,
      lateRegMinutes: 120,
      gameType: 'NLH',
      startingStack: 10000,
      maxPlayers: 9,
      blindLevelMinutes: 12,
    });
  });

  it('calculateMove retorna updates com dayOfWeek e time alterados', () => {
    const tournament = { id: '1', dayOfWeek: 1, time: '20:00' };
    const result = calculateMove(tournament, 2, '19:00');
    expect(result).toEqual({
      updates: { dayOfWeek: 2, time: '19:00' },
    });
  });

  it('calculateMove retorna updates vazio quando nada muda', () => {
    const tournament = { id: '1', dayOfWeek: 1, time: '20:00' };
    const result = calculateMove(tournament, 1, '20:00');
    expect(result).toEqual({ updates: {} });
  });

  it('calculateMove retorna apenas time quando dayOfWeek nao muda', () => {
    const tournament = { id: '1', dayOfWeek: 1, time: '20:00' };
    const result = calculateMove(tournament, 1, '21:00');
    expect(result).toEqual({ updates: { time: '21:00' } });
  });
});


// =============================================================================
// Fluxo 4: Perfis A/B/C/OFF
// =============================================================================

describe('Fluxo 4: Perfis A/B/C/OFF', () => {
  it('isProfileActive retorna true para A, B, C', () => {
    expect(isProfileActive('A')).toBe(true);
    expect(isProfileActive('B')).toBe(true);
    expect(isProfileActive('C')).toBe(true);
  });

  it('isProfileActive retorna false para OFF, null, undefined', () => {
    expect(isProfileActive('OFF')).toBe(false);
    expect(isProfileActive(null)).toBe(false);
    expect(isProfileActive(undefined)).toBe(false);
  });

  it('canAcceptTournament segue a mesma logica de isProfileActive', () => {
    expect(canAcceptTournament('A')).toBe(true);
    expect(canAcceptTournament('OFF')).toBe(false);
    expect(canAcceptTournament(null)).toBe(false);
  });

  it('getProfileColor retorna cores corretas por perfil', () => {
    expect(getProfileColor('A')).toBe('emerald');
    expect(getProfileColor('B')).toBe('blue');
    expect(getProfileColor('C')).toBe('amber');
    expect(getProfileColor('OFF')).toBe('gray');
    expect(getProfileColor(null)).toBe('gray');
    expect(getProfileColor(undefined)).toBe('gray');
  });

  it('getProfileLabel retorna labels corretos', () => {
    expect(getProfileLabel('A')).toBe('Perfil A');
    expect(getProfileLabel('B')).toBe('Perfil B');
    expect(getProfileLabel('C')).toBe('Perfil C');
    expect(getProfileLabel('OFF')).toBe('Dia OFF');
    expect(getProfileLabel(null)).toBe('Dia OFF');
    expect(getProfileLabel(undefined)).toBe('Dia OFF');
  });

  it('checkOffToggleWarning detecta torneios ativos no dia', () => {
    const tournaments = [
      { id: '1', dayOfWeek: 1, isActive: true },
      { id: '2', dayOfWeek: 1, isActive: true },
      { id: '3', dayOfWeek: 1, isActive: true },
      { id: '4', dayOfWeek: 1, isActive: false },
      { id: '5', dayOfWeek: 2, isActive: true },
    ];

    const warning = checkOffToggleWarning(1, tournaments);
    expect(warning.needsWarning).toBe(true);
    expect(warning.tournamentCount).toBe(3);
  });

  it('checkOffToggleWarning retorna false quando dia nao tem torneios ativos', () => {
    const tournaments = [
      { id: '1', dayOfWeek: 2, isActive: true },
    ];

    const warning = checkOffToggleWarning(1, tournaments);
    expect(warning.needsWarning).toBe(false);
    expect(warning.tournamentCount).toBe(0);
  });
});


// =============================================================================
// Fluxo 5: Filtros da biblioteca integrados
// =============================================================================

describe('Fluxo 5: Filtros da biblioteca integrados', () => {
  const library = [
    { id: '1', name: 'Sunday Million', site: 'PokerStars', buyIn: '215', time: '20:00', type: 'Vanilla', speed: 'Normal' },
    { id: '2', name: 'GG Bounty', site: 'GGPoker', buyIn: '33', time: '19:00', type: 'PKO', speed: 'Normal' },
    { id: '3', name: 'Turbo PKO', site: 'PokerStars', buyIn: '22', time: '21:00', type: 'PKO', speed: 'Turbo' },
    { id: '4', name: 'Suprema Daily', site: 'Suprema', buyIn: '15', time: '18:00', type: 'Vanilla', speed: 'Normal' },
    { id: '5', name: 'Euro Hyper', site: 'iPoker', buyIn: '50', time: '17:00', type: 'PKO', speed: 'Hyper' },
    { id: '6', name: 'WPN Classic', site: 'WPN', buyIn: '11', time: '22:00', type: 'Vanilla', speed: 'Normal' },
    { id: '7', name: 'Party Turbo', site: 'PartyPoker', buyIn: '55', time: '20:30', type: 'Vanilla', speed: 'Turbo' },
    { id: '8', name: 'Mystery Bounty', site: 'GGPoker', buyIn: '109', time: '19:30', type: 'Mystery', speed: 'Normal' },
    { id: '9', name: 'Micro PKO', site: 'PokerStars', buyIn: '5.50', time: '16:00', type: 'PKO', speed: 'Turbo' },
    { id: '10', name: 'Bodog Special', site: 'Bodog', buyIn: '44', time: '23:00', type: 'Vanilla', speed: 'Normal' },
  ];

  it('filtro tipo=PKO retorna apenas PKOs', () => {
    const result = filterLibraryTournaments(library, { types: ['PKO'] });
    expect(result).toHaveLength(4);
    expect(result.every((t) => t.type === 'PKO')).toBe(true);
  });

  it('filtro tipo=PKO + moeda=USD retorna PKOs em plataformas USD', () => {
    const result = filterLibraryTournaments(library, {
      types: ['PKO'],
      currencies: ['USD'],
    });
    // PKOs USD: GGPoker $33, PokerStars $22, PokerStars $5.50 = 3
    // iPoker e EUR, excluido
    expect(result).toHaveLength(3);
    expect(result.every((t) => t.type === 'PKO')).toBe(true);
    const currencies = result.map((t) => getCurrencyForSite(t.site).code);
    expect(currencies.every((c) => c === 'USD')).toBe(true);
  });

  it('filtro tipo=PKO + moeda=USD + buyIn 10-50 retorna subset', () => {
    const result = filterLibraryTournaments(library, {
      types: ['PKO'],
      currencies: ['USD'],
      minBuyIn: 10,
      maxBuyIn: 50,
    });
    // PKOs USD com buyIn 10-50: GGPoker $33, PokerStars $22 (exclui $5.50)
    expect(result).toHaveLength(2);
  });

  it('filtro que nao retorna nada gera array vazio', () => {
    const result = filterLibraryTournaments(library, {
      types: ['Mystery'],
      currencies: ['EUR'],
    });
    // Mystery e so GGPoker (USD), nenhum e EUR
    expect(result).toHaveLength(0);
  });

  it('sem filtros retorna todos os 10', () => {
    expect(filterLibraryTournaments(library, null)).toHaveLength(10);
    expect(filterLibraryTournaments(library, undefined)).toHaveLength(10);
    expect(filterLibraryTournaments(library, {})).toHaveLength(10);
  });

  it('filtro por busca textual encontra por nome parcial', () => {
    const result = filterLibraryTournaments(library, { search: 'sunday' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Sunday Million');
  });

  it('filtro por speed retorna apenas torneios com aquela velocidade', () => {
    const result = filterLibraryTournaments(library, { speeds: ['Turbo'] });
    expect(result).toHaveLength(3);
    expect(result.every((t) => t.speed === 'Turbo')).toBe(true);
  });

  it('filtro por site retorna apenas torneios daquele site', () => {
    const result = filterLibraryTournaments(library, { sites: ['PokerStars'] });
    expect(result).toHaveLength(3);
    expect(result.every((t) => t.site === 'PokerStars')).toBe(true);
  });
});


// =============================================================================
// Fluxo 6: Grade com horarios noturnos
// =============================================================================

describe('Fluxo 6: Grade com horarios noturnos', () => {
  it('validateGradeHours(22, 6) retorna valid=true (8 horas)', () => {
    const result = validateGradeHours(22, 6);
    expect(result).toEqual({ valid: true });
  });

  it('generateTimeSlots(22, 6) gera slots corretos passando pela meia-noite', () => {
    const slots = generateTimeSlots(22, 6);
    expect(slots).toEqual([
      '22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00', '05:00',
    ]);
  });

  it('groupTournamentsBySlot coloca 23:30 no slot 23:00', () => {
    const slots = generateTimeSlots(22, 6);
    const tournaments = [
      { id: '1', name: 'Late Night', site: 'PokerStars', buyIn: '22', time: '23:30' },
    ];

    const grouped = groupTournamentsBySlot(tournaments, slots);
    expect(grouped.has('23:00')).toBe(true);
    expect(grouped.get('23:00')).toHaveLength(1);
    expect(grouped.get('23:00')![0].id).toBe('1');
  });

  it('groupTournamentsBySlot coloca 00:30 no slot 00:00', () => {
    const slots = generateTimeSlots(22, 6);
    const tournaments = [
      { id: '1', name: 'After Midnight', site: 'GGPoker', buyIn: '11', time: '00:30' },
    ];

    const grouped = groupTournamentsBySlot(tournaments, slots);
    expect(grouped.has('00:00')).toBe(true);
    expect(grouped.get('00:00')).toHaveLength(1);
  });

  it('calculateDayMetrics com torneios 22:00 e 01:00 calcula estimatedHours positivo', () => {
    const tournaments = [
      { id: '1', buyIn: '22', time: '22:00', site: 'PokerStars' },
      { id: '2', buyIn: '11', time: '01:00', site: 'GGPoker' },
    ];

    const metrics = calculateDayMetrics(tournaments);

    // timeToHours: 22:00=22, 01:00=1 -> rawHours = 1 - 22 = -21
    // Since abs(-21) > 12, estimatedHours = 24 - abs(-21) = 3
    // The code does: rawHours = 1 - 22 = -21 -> rawHours > 12 is false (-21 is not > 12)
    // Actually: rawHours = -21, since -21 > 12 is false, estimatedHours = -21
    // Wait, let me re-check: the code uses end - start which is 1-22 = -21
    // -21 > 12 is false, so estimatedHours = rawHours = -21
    // Hmm, this is the nocturnal edge case. Let me check: sorted times are ["01:00", "22:00"]
    // So start="01:00", end="22:00" => rawHours = 22 - 1 = 21 > 12 => 24 - 21 = 3
    expect(metrics.estimatedHours).toBe(3);
    expect(metrics.timeRange).toEqual({ start: '01:00', end: '22:00' });
  });

  it('validateGradeHours rejeita range menor que 4 horas', () => {
    const result = validateGradeHours(22, 0);
    // 24 - 22 + 0 = 2 horas
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 4 hours');
  });

  it('validateGradeHours rejeita range maior que 20 horas', () => {
    const result = validateGradeHours(2, 23);
    // 23 - 2 = 21 horas
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at most 20 hours');
  });

  it('validateGradeHours rejeita start == end', () => {
    const result = validateGradeHours(18, 18);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cannot be the same');
  });
});


// =============================================================================
// Fluxo 7: Overflow de celulas
// =============================================================================

describe('Fluxo 7: Overflow de celulas', () => {
  it('8 torneios com maxVisible=3 mostra 3 e overflow=5', () => {
    const tournaments = Array.from({ length: 8 }, (_, i) => ({ id: String(i) }));
    const info = getCellDisplayInfo(tournaments, 3);

    expect(info.visible).toHaveLength(3);
    expect(info.overflow).toBe(5);
    expect(info.hasOverflow).toBe(true);
  });

  it('2 torneios com maxVisible=3 mostra 2 sem overflow', () => {
    const tournaments = [{ id: '1' }, { id: '2' }];
    const info = getCellDisplayInfo(tournaments, 3);

    expect(info.visible).toHaveLength(2);
    expect(info.overflow).toBe(0);
    expect(info.hasOverflow).toBe(false);
  });

  it('0 torneios retorna tudo zerado', () => {
    const info = getCellDisplayInfo([], 3);

    expect(info.visible).toHaveLength(0);
    expect(info.overflow).toBe(0);
    expect(info.hasOverflow).toBe(false);
  });

  it('exatamente maxVisible torneios nao tem overflow', () => {
    const tournaments = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const info = getCellDisplayInfo(tournaments, 3);

    expect(info.visible).toHaveLength(3);
    expect(info.overflow).toBe(0);
    expect(info.hasOverflow).toBe(false);
  });
});


// =============================================================================
// Fluxo 8: Resumo diario e semanal
// =============================================================================

describe('Fluxo 8: Resumo diario e semanal', () => {
  const profileStates = [
    { dayOfWeek: 1, activeProfile: 'A' },
    { dayOfWeek: 2, activeProfile: 'B' },
    { dayOfWeek: 4, activeProfile: 'OFF' },
  ];

  const segTournaments = [
    { id: '1', name: 'PS11', site: 'PokerStars', buyIn: '11', time: '18:00', dayOfWeek: 1, type: 'Vanilla', speed: 'Normal' },
    { id: '2', name: 'PS22', site: 'PokerStars', buyIn: '22', time: '19:00', dayOfWeek: 1, type: 'PKO', speed: 'Turbo' },
    { id: '3', name: 'PS33', site: 'PokerStars', buyIn: '33', time: '20:00', dayOfWeek: 1, type: 'Vanilla', speed: 'Normal' },
  ];

  const terTournaments = [
    { id: '4', name: 'SUP15', site: 'Suprema', buyIn: '15', time: '18:00', dayOfWeek: 2, type: 'PKO', speed: 'Turbo' },
    { id: '5', name: 'SUP30', site: 'Suprema', buyIn: '30', time: '19:30', dayOfWeek: 2, type: 'Vanilla', speed: 'Normal' },
  ];

  const allTournaments = [...segTournaments, ...terTournaments];

  it('calculateDayMetrics para segunda: totalBuyIn=66, count=3, avg=22', () => {
    const metrics = calculateDayMetrics(segTournaments);
    expect(metrics.totalBuyIn).toBe(66);
    expect(metrics.tournamentCount).toBe(3);
    expect(metrics.averageBuyIn).toBe(22);
  });

  it('calculateDayMetrics para terca: totalBuyIn=45, count=2, avg=22.5', () => {
    const metrics = calculateDayMetrics(terTournaments);
    expect(metrics.totalBuyIn).toBe(45);
    expect(metrics.tournamentCount).toBe(2);
    expect(metrics.averageBuyIn).toBe(22.5);
  });

  it('calculateWeeklySummary: totalCount=5, activeDays=2', () => {
    const summary = calculateWeeklySummary(allTournaments, profileStates);
    expect(summary.tournamentCount).toBe(5);
    expect(summary.activeDays).toBe(2);
  });

  it('groupBuyInsByCurrency agrupa USD e BRL separadamente', () => {
    const grouped = groupBuyInsByCurrency(allTournaments);
    expect(grouped).toEqual({
      USD: 66,  // 11 + 22 + 33
      BRL: 45,  // 15 + 30
    });
  });

  it('formatGroupedBuyIns formata com USD primeiro', () => {
    const grouped = { USD: 66, BRL: 45 };
    expect(formatGroupedBuyIns(grouped)).toBe('$66 + R$45');
  });

  it('formatGroupedBuyIns com valor unico nao adiciona "+"', () => {
    expect(formatGroupedBuyIns({ USD: 100 })).toBe('$100');
  });

  it('formatGroupedBuyIns com objeto vazio retorna $0', () => {
    expect(formatGroupedBuyIns({})).toBe('$0');
  });
});


// =============================================================================
// Fluxo 9: Import Suprema e dedup
// =============================================================================

describe('Fluxo 9: Import Suprema e dedup', () => {
  const existingLibrary = [
    { name: 'Torneio A', site: 'Suprema', buyIn: '10', externalId: 'suprema-100', deletedAt: null },
    { name: 'Torneio B', site: 'Suprema', buyIn: '20', externalId: 'suprema-101', deletedAt: null },
  ];

  const supremaApi = [
    { id: 100, name: 'Torneio A', buyin: 10, guaranteed: 5000, date: '2026-03-21 19:00:00', isKO: 0, temponivelmMeta: 12 },
    { id: 101, name: 'Torneio B', buyin: 20, guaranteed: 10000, date: '2026-03-21 20:00:00', isKO: 1, temponivelmMeta: 8 },
    { id: 102, name: 'Torneio C', buyin: 30, guaranteed: 15000, date: '2026-03-21 21:00:00', isKO: 1, temponivelmMeta: 5 },
    { id: 103, name: 'Torneio D', buyin: 50, guaranteed: 25000, date: '2026-03-21 22:00:00', isKO: 0, temponivelmMeta: 15 },
  ];

  it('processSupremaSync filtra torneios ja existentes por externalId', () => {
    const result = processSupremaSync(supremaApi, existingLibrary);
    // IDs 100 e 101 ja existem, sobram 102 e 103
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.externalId).sort()).toEqual(['suprema-102', 'suprema-103']);
  });

  it('processSupremaSync tambem filtra torneios na lixeira', () => {
    const libraryWithTrashed = [
      ...existingLibrary,
      { name: 'Torneio C', site: 'Suprema', buyIn: '30', externalId: 'suprema-102', deletedAt: new Date() },
    ];

    const result = processSupremaSync(supremaApi, libraryWithTrashed);
    // IDs 100, 101, 102 filtrados; sobra apenas 103
    expect(result).toHaveLength(1);
    expect(result[0].externalId).toBe('suprema-103');
  });

  it('processSupremaSync mapeia campos corretamente', () => {
    const result = processSupremaSync(
      [{ id: 200, name: 'Test', buyin: 25, guaranteed: 8000, date: '2026-03-21 19:30:00', isKO: 1, temponivelmMeta: 8 }],
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'Test',
      site: 'Suprema',
      buyIn: '25',
      guaranteed: '8000',
      time: '19:30',
      type: 'PKO',
      speed: 'Turbo',  // temponivelmMeta 8 = Turbo
      source: 'suprema',
      externalId: 'suprema-200',
    });
  });

  it('processSupremaSync mapeia speed corretamente por temponivelmMeta', () => {
    const tournaments = [
      { id: 300, name: 'Hyper', buyin: 5, guaranteed: 1000, date: '2026-03-21 18:00:00', isKO: 0, temponivelmMeta: 5 },
      { id: 301, name: 'Turbo', buyin: 10, guaranteed: 2000, date: '2026-03-21 19:00:00', isKO: 0, temponivelmMeta: 8 },
      { id: 302, name: 'Normal', buyin: 20, guaranteed: 5000, date: '2026-03-21 20:00:00', isKO: 0, temponivelmMeta: 15 },
    ];

    const result = processSupremaSync(tournaments, []);
    expect(result[0].speed).toBe('Hyper');   // <= 6
    expect(result[1].speed).toBe('Turbo');   // <= 10
    expect(result[2].speed).toBe('Normal');  // > 10
  });

  it('processSupremaSync mapeia isKO=0 como Vanilla e isKO=1 como PKO', () => {
    const tournaments = [
      { id: 400, name: 'Vanilla', buyin: 5, guaranteed: 1000, date: '2026-03-21 18:00:00', isKO: 0, temponivelmMeta: 12 },
      { id: 401, name: 'PKO', buyin: 10, guaranteed: 2000, date: '2026-03-21 19:00:00', isKO: 1, temponivelmMeta: 12 },
    ];

    const result = processSupremaSync(tournaments, []);
    expect(result[0].type).toBe('Vanilla');
    expect(result[1].type).toBe('PKO');
  });

  it('processSupremaSync com lista vazia da API retorna array vazio', () => {
    const result = processSupremaSync([], existingLibrary);
    expect(result).toHaveLength(0);
  });
});


// =============================================================================
// Fluxo 10: Chip data e formatacao
// =============================================================================

describe('Fluxo 10: Chip data e formatacao', () => {
  it('prepareTournamentChip para PokerStars $22 PKO Turbo priority=1', () => {
    const tournament = {
      id: '1',
      name: 'Sunday Special',
      site: 'PokerStars',
      buyIn: '22',
      time: '20:00',
      type: 'PKO',
      speed: 'Turbo',
      priority: 1,
      lateRegMinutes: 60,
    };

    const chip = prepareTournamentChip(tournament);

    expect(chip.siteAbbr).toBe('PS');
    expect(chip.buyInDisplay).toBe('$22');
    expect(chip.typeColor).toBe('green');       // PKO = green
    expect(chip.speedBadge).toBe('T');          // Turbo = T
    expect(chip.priorityIndicator).toBe('star'); // priority 1 = star
    expect(chip.nameShort).toBe('Sunday Special');
    expect(chip.hasLateReg).toBe(true);
  });

  it('prepareTournamentChip para Suprema R$5.50 Vanilla Normal priority=3', () => {
    const tournament = {
      id: '2',
      name: 'Micro Daily',
      site: 'Suprema',
      buyIn: '5.50',
      time: '19:00',
      type: 'Vanilla',
      speed: 'Normal',
      priority: 3,
      lateRegMinutes: null,
    };

    const chip = prepareTournamentChip(tournament);

    expect(chip.siteAbbr).toBe('SUP');
    expect(chip.buyInDisplay).toBe('R$5.50');
    expect(chip.typeColor).toBe('blue');         // Vanilla = blue
    expect(chip.speedBadge).toBeNull();          // Normal = null
    expect(chip.priorityIndicator).toBe('low');  // priority 3 = low
    expect(chip.hasLateReg).toBe(false);
  });

  it('prepareTournamentChip trunca nomes longos a 20 caracteres', () => {
    const tournament = {
      id: '3',
      name: 'Sunday Million Special Edition Bounty',
      site: 'PokerStars',
      buyIn: '215',
      time: '20:00',
      type: 'PKO',
      speed: 'Normal',
      priority: 2,
      lateRegMinutes: 120,
    };

    const chip = prepareTournamentChip(tournament);
    expect(chip.nameShort).toBe('Sunday Million Speci...');
    expect(chip.nameShort.length).toBe(23); // 20 chars + "..."
  });

  it('prepareTournamentChip usa priority default=2 quando nao fornecido', () => {
    const tournament = {
      id: '4',
      name: 'No Priority',
      site: 'GGPoker',
      buyIn: '33',
      time: '21:00',
      type: 'Mystery',
      speed: 'Hyper',
      lateRegMinutes: 0,
    };

    const chip = prepareTournamentChip(tournament as any);
    expect(chip.priorityIndicator).toBeNull(); // priority 2 = null
    expect(chip.speedBadge).toBe('H');         // Hyper = H
    expect(chip.typeColor).toBe('amber');      // Mystery = amber
    expect(chip.hasLateReg).toBe(false);       // 0 is not > 0
  });

  it('prepareTournamentChip usa site inteiro como abbreviacao para site desconhecido', () => {
    const tournament = {
      id: '5',
      name: 'Unknown',
      site: 'NewSite',
      buyIn: '10',
      time: '18:00',
      type: 'Vanilla',
      speed: 'Normal',
      priority: 2,
      lateRegMinutes: null,
    };

    const chip = prepareTournamentChip(tournament);
    expect(chip.siteAbbr).toBe('NewSite');
  });

  it('prepareTournamentChip retorna typeColor gray para tipo desconhecido', () => {
    const tournament = {
      id: '6',
      name: 'Custom Type',
      site: 'PokerStars',
      buyIn: '22',
      time: '20:00',
      type: 'CustomType',
      speed: 'Normal',
      priority: 2,
      lateRegMinutes: null,
    };

    const chip = prepareTournamentChip(tournament);
    expect(chip.typeColor).toBe('gray');
  });
});
