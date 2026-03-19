import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Deduplicacao de torneios importados da Suprema Poker
//
// A funcao filterDuplicateSupremaTournaments ainda NAO existe.
// O Implementer vai cria-la em:
//   server/supremaDedup.ts (ou server/suprema/dedup.ts)
//
// A deduplicacao verifica se um torneio com o mesmo externalId ja existe
// nos planned_tournaments do usuario para o dia selecionado.
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Import da funcao que AINDA NAO EXISTE — sera criada pelo Implementer
// ---------------------------------------------------------------------------
import { filterDuplicateSupremaTournaments } from '../../../server/supremaDedup';

// ---------------------------------------------------------------------------
// Tipos para os testes
// ---------------------------------------------------------------------------
interface MappedTournament {
  externalId: string;
  name: string;
  buyIn: string;
  [key: string]: any;
}

interface ExistingPlannedTournament {
  externalId: string | null;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------
function makeMappedTournament(overrides: Partial<MappedTournament> = {}): MappedTournament {
  return {
    externalId: 'suprema-12345',
    name: 'Daily $22 PKO',
    buyIn: '22',
    site: 'Suprema',
    type: 'PKO',
    speed: 'Normal',
    ...overrides,
  };
}

function makeExistingTournament(overrides: Partial<ExistingPlannedTournament> = {}): ExistingPlannedTournament {
  return {
    id: 'plan-001',
    externalId: null,
    name: 'Some Tournament',
    userId: 'USER-0001',
    ...overrides,
  };
}

// =============================================================================
// TESTES
// =============================================================================

describe('filterDuplicateSupremaTournaments', () => {

  // -------------------------------------------------------------------------
  // 1. Torneio novo (sem externalId igual) — permite importar
  // -------------------------------------------------------------------------
  it('deve permitir torneio com externalId que nao existe nos planejados', () => {
    const incoming = [
      makeMappedTournament({ externalId: 'suprema-111' }),
    ];
    const existing: ExistingPlannedTournament[] = [
      makeExistingTournament({ externalId: 'suprema-222' }),
    ];

    const result = filterDuplicateSupremaTournaments(incoming, existing);
    expect(result).toHaveLength(1);
    expect(result[0].externalId).toBe('suprema-111');
  });

  // -------------------------------------------------------------------------
  // 2. Torneio ja importado (mesmo externalId) — bloqueia
  // -------------------------------------------------------------------------
  it('deve remover torneio cujo externalId ja existe nos planejados', () => {
    const incoming = [
      makeMappedTournament({ externalId: 'suprema-12345' }),
    ];
    const existing: ExistingPlannedTournament[] = [
      makeExistingTournament({ externalId: 'suprema-12345' }),
    ];

    const result = filterDuplicateSupremaTournaments(incoming, existing);
    expect(result).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 3. Mesmo nome mas externalId diferente — permite
  // -------------------------------------------------------------------------
  it('deve permitir torneio com mesmo nome mas externalId diferente', () => {
    const incoming = [
      makeMappedTournament({ externalId: 'suprema-111', name: 'Daily $22 PKO' }),
    ];
    const existing: ExistingPlannedTournament[] = [
      makeExistingTournament({ externalId: 'suprema-222', name: 'Daily $22 PKO' }),
    ];

    const result = filterDuplicateSupremaTournaments(incoming, existing);
    expect(result).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // 4. Filtra lista mista removendo apenas duplicados
  // -------------------------------------------------------------------------
  it('deve filtrar apenas os duplicados de uma lista mista', () => {
    const incoming = [
      makeMappedTournament({ externalId: 'suprema-100', name: 'Torneio A' }),
      makeMappedTournament({ externalId: 'suprema-200', name: 'Torneio B' }),
      makeMappedTournament({ externalId: 'suprema-300', name: 'Torneio C' }),
    ];
    const existing: ExistingPlannedTournament[] = [
      makeExistingTournament({ externalId: 'suprema-200' }),
    ];

    const result = filterDuplicateSupremaTournaments(incoming, existing);
    expect(result).toHaveLength(2);
    expect(result.map((t: MappedTournament) => t.externalId)).toEqual([
      'suprema-100',
      'suprema-300',
    ]);
  });

  // -------------------------------------------------------------------------
  // 5. Array vazio de existentes — todos passam
  // -------------------------------------------------------------------------
  it('deve permitir todos os torneios quando nao ha planejados existentes', () => {
    const incoming = [
      makeMappedTournament({ externalId: 'suprema-100' }),
      makeMappedTournament({ externalId: 'suprema-200' }),
      makeMappedTournament({ externalId: 'suprema-300' }),
    ];
    const existing: ExistingPlannedTournament[] = [];

    const result = filterDuplicateSupremaTournaments(incoming, existing);
    expect(result).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  it('deve lidar com existentes que tem externalId null (torneios manuais)', () => {
    const incoming = [
      makeMappedTournament({ externalId: 'suprema-100' }),
    ];
    const existing: ExistingPlannedTournament[] = [
      makeExistingTournament({ externalId: null }),
      makeExistingTournament({ externalId: null }),
    ];

    const result = filterDuplicateSupremaTournaments(incoming, existing);
    expect(result).toHaveLength(1);
  });

  it('deve retornar array vazio quando incoming esta vazio', () => {
    const incoming: MappedTournament[] = [];
    const existing: ExistingPlannedTournament[] = [
      makeExistingTournament({ externalId: 'suprema-100' }),
    ];

    const result = filterDuplicateSupremaTournaments(incoming, existing);
    expect(result).toHaveLength(0);
  });

  it('deve remover todos quando todos ja foram importados', () => {
    const incoming = [
      makeMappedTournament({ externalId: 'suprema-100' }),
      makeMappedTournament({ externalId: 'suprema-200' }),
    ];
    const existing: ExistingPlannedTournament[] = [
      makeExistingTournament({ externalId: 'suprema-100' }),
      makeExistingTournament({ externalId: 'suprema-200' }),
    ];

    const result = filterDuplicateSupremaTournaments(incoming, existing);
    expect(result).toHaveLength(0);
  });
});
