import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Deduplicacao da Biblioteca de Torneios
//
// As funcoes de deduplicacao AINDA NAO EXISTEM.
// O Implementer vai cria-las em:
//   shared/library-dedup.ts (ou server/library-dedup.ts)
//
// Regras de dedup da spec:
// - Suprema: por externalId (preciso)
// - Grind-live / manual: por name + site + buyIn (case-insensitive name)
// - Dedup verifica contra ativos E lixeira (deletedAt != null)
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Imports das funcoes que AINDA NAO EXISTEM — serao criadas pelo Implementer
// ---------------------------------------------------------------------------
import {
  isDuplicateByExternalId,
  isDuplicateByFields,
  filterNewTournaments,
} from '../../../shared/library-dedup';

// ---------------------------------------------------------------------------
// Tipos para os testes
// ---------------------------------------------------------------------------
interface IncomingTournament {
  name: string;
  site: string;
  buyIn: string;
  externalId: string | null;
  [key: string]: any;
}

interface ExistingLibraryItem {
  name: string;
  site: string;
  buyIn: string;
  externalId: string | null;
  deletedAt: Date | null;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------
function makeIncoming(overrides: Partial<IncomingTournament> = {}): IncomingTournament {
  return {
    name: 'Daily $22 PKO',
    site: 'GGPoker',
    buyIn: '22.00',
    externalId: null,
    source: 'manual',
    ...overrides,
  };
}

function makeExisting(overrides: Partial<ExistingLibraryItem> = {}): ExistingLibraryItem {
  return {
    id: 'lib-001',
    name: 'Some Tournament',
    site: 'PokerStars',
    buyIn: '55.00',
    externalId: null,
    deletedAt: null,
    userId: 'USER-0001',
    ...overrides,
  };
}

// =============================================================================
// isDuplicateByExternalId
// =============================================================================

describe('isDuplicateByExternalId', () => {

  it('deve retornar true quando externalId iguais e nao-null', () => {
    const incoming = makeIncoming({ externalId: 'suprema-100' });
    const existing = [
      makeExisting({ externalId: 'suprema-100' }),
    ];
    expect(isDuplicateByExternalId(incoming, existing)).toBe(true);
  });

  it('deve retornar false quando externalId diferentes', () => {
    const incoming = makeIncoming({ externalId: 'suprema-100' });
    const existing = [
      makeExisting({ externalId: 'suprema-200' }),
    ];
    expect(isDuplicateByExternalId(incoming, existing)).toBe(false);
  });

  it('deve retornar false quando incoming externalId e null (torneio manual)', () => {
    const incoming = makeIncoming({ externalId: null });
    const existing = [
      makeExisting({ externalId: 'suprema-100' }),
    ];
    expect(isDuplicateByExternalId(incoming, existing)).toBe(false);
  });

  it('deve retornar false quando existing tem apenas externalId null', () => {
    const incoming = makeIncoming({ externalId: 'suprema-100' });
    const existing = [
      makeExisting({ externalId: null }),
    ];
    expect(isDuplicateByExternalId(incoming, existing)).toBe(false);
  });

  it('deve retornar false quando ambos externalId sao null (manual nao deduplica por id)', () => {
    const incoming = makeIncoming({ externalId: null });
    const existing = [
      makeExisting({ externalId: null }),
    ];
    expect(isDuplicateByExternalId(incoming, existing)).toBe(false);
  });

  it('deve detectar duplicata em lista com multiplos existentes', () => {
    const incoming = makeIncoming({ externalId: 'suprema-300' });
    const existing = [
      makeExisting({ externalId: 'suprema-100' }),
      makeExisting({ externalId: 'suprema-200' }),
      makeExisting({ externalId: 'suprema-300' }),
    ];
    expect(isDuplicateByExternalId(incoming, existing)).toBe(true);
  });

  it('deve detectar duplicata mesmo quando item esta na lixeira', () => {
    const incoming = makeIncoming({ externalId: 'suprema-100' });
    const existing = [
      makeExisting({ externalId: 'suprema-100', deletedAt: new Date() }),
    ];
    expect(isDuplicateByExternalId(incoming, existing)).toBe(true);
  });

  it('deve retornar false quando lista de existentes esta vazia', () => {
    const incoming = makeIncoming({ externalId: 'suprema-100' });
    expect(isDuplicateByExternalId(incoming, [])).toBe(false);
  });
});

// =============================================================================
// isDuplicateByFields
// =============================================================================

describe('isDuplicateByFields', () => {

  it('deve retornar true quando name + site + buyIn iguais', () => {
    const incoming = makeIncoming({ name: 'Daily $22', site: 'GGPoker', buyIn: '22.00' });
    const existing = [
      makeExisting({ name: 'Daily $22', site: 'GGPoker', buyIn: '22.00' }),
    ];
    expect(isDuplicateByFields(incoming, existing)).toBe(true);
  });

  it('deve ser case-insensitive no name', () => {
    const incoming = makeIncoming({ name: 'DAILY $22 PKO', site: 'GGPoker', buyIn: '22.00' });
    const existing = [
      makeExisting({ name: 'daily $22 pko', site: 'GGPoker', buyIn: '22.00' }),
    ];
    expect(isDuplicateByFields(incoming, existing)).toBe(true);
  });

  it('deve retornar false quando name difere', () => {
    const incoming = makeIncoming({ name: 'Daily $22', site: 'GGPoker', buyIn: '22.00' });
    const existing = [
      makeExisting({ name: 'Weekly $22', site: 'GGPoker', buyIn: '22.00' }),
    ];
    expect(isDuplicateByFields(incoming, existing)).toBe(false);
  });

  it('deve retornar false quando site difere', () => {
    const incoming = makeIncoming({ name: 'Daily $22', site: 'GGPoker', buyIn: '22.00' });
    const existing = [
      makeExisting({ name: 'Daily $22', site: 'PokerStars', buyIn: '22.00' }),
    ];
    expect(isDuplicateByFields(incoming, existing)).toBe(false);
  });

  it('deve retornar false quando buyIn difere', () => {
    const incoming = makeIncoming({ name: 'Daily $22', site: 'GGPoker', buyIn: '22.00' });
    const existing = [
      makeExisting({ name: 'Daily $22', site: 'GGPoker', buyIn: '33.00' }),
    ];
    expect(isDuplicateByFields(incoming, existing)).toBe(false);
  });

  it('deve detectar duplicata em item na lixeira (deletedAt != null)', () => {
    const incoming = makeIncoming({ name: 'Daily $22', site: 'GGPoker', buyIn: '22.00' });
    const existing = [
      makeExisting({ name: 'Daily $22', site: 'GGPoker', buyIn: '22.00', deletedAt: new Date() }),
    ];
    expect(isDuplicateByFields(incoming, existing)).toBe(true);
  });

  it('deve retornar false quando lista de existentes esta vazia', () => {
    const incoming = makeIncoming({ name: 'Daily $22', site: 'GGPoker', buyIn: '22.00' });
    expect(isDuplicateByFields(incoming, [])).toBe(false);
  });

  it('deve detectar duplicata entre multiplos existentes', () => {
    const incoming = makeIncoming({ name: 'Daily $22', site: 'GGPoker', buyIn: '22.00' });
    const existing = [
      makeExisting({ name: 'Other', site: 'PokerStars', buyIn: '55.00' }),
      makeExisting({ name: 'Daily $22', site: 'GGPoker', buyIn: '22.00' }),
      makeExisting({ name: 'Another', site: 'GGPoker', buyIn: '11.00' }),
    ];
    expect(isDuplicateByFields(incoming, existing)).toBe(true);
  });
});

// =============================================================================
// filterNewTournaments
// =============================================================================

describe('filterNewTournaments', () => {

  // -------------------------------------------------------------------------
  // Filtragem por externalId
  // -------------------------------------------------------------------------

  it('deve remover incoming com externalId que ja existe nos existentes', () => {
    const incoming = [
      makeIncoming({ name: 'T1', externalId: 'suprema-100' }),
      makeIncoming({ name: 'T2', externalId: 'suprema-200' }),
    ];
    const existing = [
      makeExisting({ externalId: 'suprema-100' }),
    ];

    const result = filterNewTournaments(incoming, existing);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('T2');
  });

  // -------------------------------------------------------------------------
  // Filtragem por name + site + buyIn
  // -------------------------------------------------------------------------

  it('deve remover incoming com name+site+buyIn que ja existe (sem externalId)', () => {
    const incoming = [
      makeIncoming({ name: 'Daily $22', site: 'GGPoker', buyIn: '22.00', externalId: null }),
    ];
    const existing = [
      makeExisting({ name: 'Daily $22', site: 'GGPoker', buyIn: '22.00' }),
    ];

    const result = filterNewTournaments(incoming, existing);
    expect(result).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Filtragem combinada (externalId OU name+site+buyIn)
  // -------------------------------------------------------------------------

  it('deve remover duplicatas por externalId E por name+site+buyIn', () => {
    const incoming = [
      makeIncoming({ name: 'Suprema T1', externalId: 'suprema-100', site: 'Suprema', buyIn: '11.00' }),
      makeIncoming({ name: 'Manual T1', externalId: null, site: 'GGPoker', buyIn: '22.00' }),
      makeIncoming({ name: 'New T1', externalId: 'suprema-999', site: 'PokerStars', buyIn: '55.00' }),
    ];
    const existing = [
      makeExisting({ externalId: 'suprema-100', name: 'Suprema T1', site: 'Suprema', buyIn: '11.00' }),
      makeExisting({ externalId: null, name: 'Manual T1', site: 'GGPoker', buyIn: '22.00' }),
    ];

    const result = filterNewTournaments(incoming, existing);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('New T1');
  });

  // -------------------------------------------------------------------------
  // Inclui lixeira na verificacao
  // -------------------------------------------------------------------------

  it('deve considerar itens na lixeira (deletedAt != null) como existentes', () => {
    const incoming = [
      makeIncoming({ name: 'Trashed T1', site: 'GGPoker', buyIn: '22.00', externalId: null }),
    ];
    const existing = [
      makeExisting({ name: 'Trashed T1', site: 'GGPoker', buyIn: '22.00', deletedAt: new Date() }),
    ];

    const result = filterNewTournaments(incoming, existing);
    expect(result).toHaveLength(0);
  });

  it('deve considerar itens na lixeira por externalId tambem', () => {
    const incoming = [
      makeIncoming({ name: 'T1', externalId: 'suprema-100' }),
    ];
    const existing = [
      makeExisting({ externalId: 'suprema-100', deletedAt: new Date() }),
    ];

    const result = filterNewTournaments(incoming, existing);
    expect(result).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it('deve permitir todos quando nao ha existentes', () => {
    const incoming = [
      makeIncoming({ name: 'T1', externalId: 'suprema-100' }),
      makeIncoming({ name: 'T2', externalId: null }),
    ];

    const result = filterNewTournaments(incoming, []);
    expect(result).toHaveLength(2);
  });

  it('deve retornar array vazio quando incoming esta vazio', () => {
    const existing = [
      makeExisting({ externalId: 'suprema-100' }),
    ];

    const result = filterNewTournaments([], existing);
    expect(result).toHaveLength(0);
  });

  it('deve remover todos quando todos ja existem', () => {
    const incoming = [
      makeIncoming({ name: 'T1', externalId: 'suprema-100', site: 'GGPoker', buyIn: '22.00' }),
      makeIncoming({ name: 'T2', externalId: null, site: 'PokerStars', buyIn: '55.00' }),
    ];
    const existing = [
      makeExisting({ externalId: 'suprema-100' }),
      makeExisting({ name: 'T2', site: 'PokerStars', buyIn: '55.00' }),
    ];

    const result = filterNewTournaments(incoming, existing);
    expect(result).toHaveLength(0);
  });

  it('deve usar case-insensitive name na dedup por campos', () => {
    const incoming = [
      makeIncoming({ name: 'DAILY $22 PKO', site: 'GGPoker', buyIn: '22.00', externalId: null }),
    ];
    const existing = [
      makeExisting({ name: 'daily $22 pko', site: 'GGPoker', buyIn: '22.00' }),
    ];

    const result = filterNewTournaments(incoming, existing);
    expect(result).toHaveLength(0);
  });

  it('deve manter torneios com mesmo nome mas site diferente', () => {
    const incoming = [
      makeIncoming({ name: 'Daily $22', site: 'GGPoker', buyIn: '22.00', externalId: null }),
      makeIncoming({ name: 'Daily $22', site: 'PokerStars', buyIn: '22.00', externalId: null }),
    ];
    const existing = [
      makeExisting({ name: 'Daily $22', site: 'GGPoker', buyIn: '22.00' }),
    ];

    const result = filterNewTournaments(incoming, existing);
    expect(result).toHaveLength(1);
    expect(result[0].site).toBe('PokerStars');
  });

  it('deve manter torneios com mesmo nome e site mas buyIn diferente', () => {
    const incoming = [
      makeIncoming({ name: 'Daily PKO', site: 'GGPoker', buyIn: '22.00', externalId: null }),
      makeIncoming({ name: 'Daily PKO', site: 'GGPoker', buyIn: '55.00', externalId: null }),
    ];
    const existing = [
      makeExisting({ name: 'Daily PKO', site: 'GGPoker', buyIn: '22.00' }),
    ];

    const result = filterNewTournaments(incoming, existing);
    expect(result).toHaveLength(1);
    expect(result[0].buyIn).toBe('55.00');
  });
});
