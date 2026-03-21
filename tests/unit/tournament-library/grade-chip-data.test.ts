import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Chip Data — prepara dados de torneio para exibicao como chip
//
// O modulo shared/grade-chip-data.ts AINDA NAO EXISTE.
// O Implementer vai cria-lo.
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Imports que AINDA NAO EXISTEM — serao criados pelo Implementer
// ---------------------------------------------------------------------------
import { prepareTournamentChip } from '../../../shared/grade-chip-data';

// ---------------------------------------------------------------------------
// Helpers de teste
// ---------------------------------------------------------------------------

function makeTournament(overrides: Record<string, any> = {}) {
  return {
    id: 'pt-1',
    name: 'Sunday Million',
    site: 'PokerStars',
    buyIn: '22',
    time: '19:00',
    type: 'Vanilla',
    speed: 'Normal',
    priority: 2,
    lateRegMinutes: null,
    ...overrides,
  };
}

// =============================================================================
// Grupo 6: prepareTournamentChip
// =============================================================================

describe('prepareTournamentChip', () => {

  // -------------------------------------------------------------------------
  // Site abbreviations
  // -------------------------------------------------------------------------

  it('deve abreviar PokerStars para "PS"', () => {
    const result = prepareTournamentChip(makeTournament({ site: 'PokerStars' }));
    expect(result.siteAbbr).toBe('PS');
  });

  it('deve abreviar GGNetwork para "GG"', () => {
    const result = prepareTournamentChip(makeTournament({ site: 'GGNetwork' }));
    expect(result.siteAbbr).toBe('GG');
  });

  it('deve abreviar Suprema para "SUP"', () => {
    const result = prepareTournamentChip(makeTournament({ site: 'Suprema' }));
    expect(result.siteAbbr).toBe('SUP');
  });

  it('deve abreviar WPN para "WPN"', () => {
    const result = prepareTournamentChip(makeTournament({ site: 'WPN' }));
    expect(result.siteAbbr).toBe('WPN');
  });

  // -------------------------------------------------------------------------
  // Buy-in display format
  // -------------------------------------------------------------------------

  it('deve formatar buyIn inteiro como "$22"', () => {
    const result = prepareTournamentChip(makeTournament({ buyIn: '22' }));
    expect(result.buyInDisplay).toBe('$22');
  });

  it('deve formatar buyIn decimal como "$5.50"', () => {
    const result = prepareTournamentChip(makeTournament({ buyIn: '5.50' }));
    expect(result.buyInDisplay).toBe('$5.50');
  });

  it('deve formatar buyIn zero como "$0" para freeroll', () => {
    const result = prepareTournamentChip(makeTournament({ buyIn: '0' }));
    expect(result.buyInDisplay).toBe('$0');
  });

  // -------------------------------------------------------------------------
  // Type color
  // -------------------------------------------------------------------------

  it('deve retornar typeColor "green" para PKO', () => {
    const result = prepareTournamentChip(makeTournament({ type: 'PKO' }));
    expect(result.typeColor).toBe('green');
  });

  it('deve retornar typeColor "blue" para Vanilla', () => {
    const result = prepareTournamentChip(makeTournament({ type: 'Vanilla' }));
    expect(result.typeColor).toBe('blue');
  });

  it('deve retornar typeColor "amber" para Mystery', () => {
    const result = prepareTournamentChip(makeTournament({ type: 'Mystery' }));
    expect(result.typeColor).toBe('amber');
  });

  // -------------------------------------------------------------------------
  // Speed badge
  // -------------------------------------------------------------------------

  it('deve retornar speedBadge null para velocidade Normal', () => {
    const result = prepareTournamentChip(makeTournament({ speed: 'Normal' }));
    expect(result.speedBadge).toBeNull();
  });

  it('deve retornar speedBadge "T" para Turbo', () => {
    const result = prepareTournamentChip(makeTournament({ speed: 'Turbo' }));
    expect(result.speedBadge).toBe('T');
  });

  it('deve retornar speedBadge "H" para Hyper', () => {
    const result = prepareTournamentChip(makeTournament({ speed: 'Hyper' }));
    expect(result.speedBadge).toBe('H');
  });

  // -------------------------------------------------------------------------
  // Priority indicator
  // -------------------------------------------------------------------------

  it('deve retornar priorityIndicator "star" para priority 1', () => {
    const result = prepareTournamentChip(makeTournament({ priority: 1 }));
    expect(result.priorityIndicator).toBe('star');
  });

  it('deve retornar priorityIndicator null para priority 2 (padrao)', () => {
    const result = prepareTournamentChip(makeTournament({ priority: 2 }));
    expect(result.priorityIndicator).toBeNull();
  });

  it('deve retornar priorityIndicator "low" para priority 3', () => {
    const result = prepareTournamentChip(makeTournament({ priority: 3 }));
    expect(result.priorityIndicator).toBe('low');
  });

  // -------------------------------------------------------------------------
  // Name truncation
  // -------------------------------------------------------------------------

  it('deve manter nome curto sem truncar (<=20 chars)', () => {
    const result = prepareTournamentChip(makeTournament({ name: 'Sunday Million' }));
    expect(result.nameShort).toBe('Sunday Million');
  });

  it('deve truncar nome longo em 20 chars com "..."', () => {
    const longName = 'Sunday Million Special Bounty Hunter Edition';
    const result = prepareTournamentChip(makeTournament({ name: longName }));

    expect(result.nameShort).toHaveLength(23); // 20 chars + "..."
    expect(result.nameShort).toBe(longName.substring(0, 20) + '...');
  });

  it('deve manter nome com exatamente 20 chars sem truncar', () => {
    const name = '12345678901234567890'; // exactly 20
    const result = prepareTournamentChip(makeTournament({ name }));

    expect(result.nameShort).toBe(name);
    expect(result.nameShort).not.toContain('...');
  });

  // -------------------------------------------------------------------------
  // Late registration indicator
  // -------------------------------------------------------------------------

  it('deve retornar hasLateReg=true quando lateRegMinutes > 0', () => {
    const result = prepareTournamentChip(makeTournament({ lateRegMinutes: 60 }));
    expect(result.hasLateReg).toBe(true);
  });

  it('deve retornar hasLateReg=false quando lateRegMinutes e null', () => {
    const result = prepareTournamentChip(makeTournament({ lateRegMinutes: null }));
    expect(result.hasLateReg).toBe(false);
  });

  it('deve retornar hasLateReg=false quando lateRegMinutes e 0', () => {
    const result = prepareTournamentChip(makeTournament({ lateRegMinutes: 0 }));
    expect(result.hasLateReg).toBe(false);
  });
});
