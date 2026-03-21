import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: OFF Toggle Warning — verifica se mudar para OFF precisa de aviso
//
// O modulo shared/grade-off-toggle.ts AINDA NAO EXISTE.
// O Implementer vai cria-lo.
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Imports que AINDA NAO EXISTEM — serao criados pelo Implementer
// ---------------------------------------------------------------------------
import { checkOffToggleWarning } from '../../../shared/grade-off-toggle';

// ---------------------------------------------------------------------------
// Helpers de teste
// ---------------------------------------------------------------------------

function makePlannedTournament(overrides: Record<string, any> = {}) {
  return {
    id: 'pt-1',
    name: 'Tournament',
    site: 'PokerStars',
    buyIn: '22',
    time: '19:00',
    dayOfWeek: 1,
    profile: 'A',
    isActive: true,
    ...overrides,
  };
}

// =============================================================================
// Grupo 4: checkOffToggleWarning
// =============================================================================

describe('checkOffToggleWarning', () => {

  // -------------------------------------------------------------------------
  // Dia com torneios ativos — precisa de aviso
  // -------------------------------------------------------------------------

  it('deve retornar needsWarning=true quando dia tem torneios ativos', () => {
    const tournaments = [
      makePlannedTournament({ id: 'pt-1', dayOfWeek: 1 }),
      makePlannedTournament({ id: 'pt-2', dayOfWeek: 1 }),
      makePlannedTournament({ id: 'pt-3', dayOfWeek: 1 }),
      makePlannedTournament({ id: 'pt-4', dayOfWeek: 1 }),
      makePlannedTournament({ id: 'pt-5', dayOfWeek: 1 }),
    ];
    const result = checkOffToggleWarning(1, tournaments);

    expect(result.needsWarning).toBe(true);
    expect(result.tournamentCount).toBe(5);
  });

  // -------------------------------------------------------------------------
  // Dia sem torneios — nao precisa de aviso
  // -------------------------------------------------------------------------

  it('deve retornar needsWarning=false quando dia nao tem torneios', () => {
    const tournaments = [
      makePlannedTournament({ id: 'pt-1', dayOfWeek: 2 }),
      makePlannedTournament({ id: 'pt-2', dayOfWeek: 3 }),
    ];
    const result = checkOffToggleWarning(1, tournaments);

    expect(result.needsWarning).toBe(false);
    expect(result.tournamentCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Filtra por dayOfWeek
  // -------------------------------------------------------------------------

  it('deve contar apenas torneios do dia especificado', () => {
    const tournaments = [
      makePlannedTournament({ id: 'pt-1', dayOfWeek: 1 }),
      makePlannedTournament({ id: 'pt-2', dayOfWeek: 1 }),
      makePlannedTournament({ id: 'pt-3', dayOfWeek: 2 }),
      makePlannedTournament({ id: 'pt-4', dayOfWeek: 3 }),
    ];
    const result = checkOffToggleWarning(1, tournaments);

    expect(result.needsWarning).toBe(true);
    expect(result.tournamentCount).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Ignora torneios inativos
  // -------------------------------------------------------------------------

  it('deve ignorar torneios com isActive=false', () => {
    const tournaments = [
      makePlannedTournament({ id: 'pt-1', dayOfWeek: 1, isActive: true }),
      makePlannedTournament({ id: 'pt-2', dayOfWeek: 1, isActive: false }),
      makePlannedTournament({ id: 'pt-3', dayOfWeek: 1, isActive: false }),
    ];
    const result = checkOffToggleWarning(1, tournaments);

    expect(result.needsWarning).toBe(true);
    expect(result.tournamentCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Array vazio
  // -------------------------------------------------------------------------

  it('deve retornar needsWarning=false para array vazio', () => {
    const result = checkOffToggleWarning(1, []);

    expect(result.needsWarning).toBe(false);
    expect(result.tournamentCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Todos inativos no dia
  // -------------------------------------------------------------------------

  it('deve retornar needsWarning=false quando todos os torneios do dia sao inativos', () => {
    const tournaments = [
      makePlannedTournament({ id: 'pt-1', dayOfWeek: 1, isActive: false }),
      makePlannedTournament({ id: 'pt-2', dayOfWeek: 1, isActive: false }),
    ];
    const result = checkOffToggleWarning(1, tournaments);

    expect(result.needsWarning).toBe(false);
    expect(result.tournamentCount).toBe(0);
  });
});
