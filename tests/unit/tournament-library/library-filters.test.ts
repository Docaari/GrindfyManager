import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Filtros da Biblioteca de Torneios (logica client-side)
//
// A funcao filterLibraryTournaments AINDA NAO EXISTE.
// O Implementer vai cria-la em:
//   shared/library-filters.ts (ou client/src/lib/library-filters.ts)
//
// Regras de filtragem (da spec):
// - Filtro por texto: busca em name, case-insensitive, parcial
// - Filtro por buy-in range: min e max
// - Filtro por type: multi-select (PKO, Vanilla, Mystery)
// - Filtro por speed: multi-select (Normal, Turbo, Hyper)
// - Filtro por site: multi-select
// - Filtro por time range: startTime e endTime no formato "HH:mm"
// - Filtros sao AND logico (todos devem coincidir)
// - Filtro vazio/undefined retorna todos
// - Nenhum resultado retorna array vazio
//
// Modo: TDD — todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Import da funcao que AINDA NAO EXISTE — sera criada pelo Implementer
// ---------------------------------------------------------------------------
import { filterLibraryTournaments } from '../../../shared/library-filters';

// ---------------------------------------------------------------------------
// Tipos para os testes
// ---------------------------------------------------------------------------
interface LibraryTournament {
  id: string;
  name: string;
  site: string;
  buyIn: string;
  time: string | null;
  type: string | null;
  speed: string | null;
  [key: string]: any;
}

interface LibraryFilters {
  search?: string;
  minBuyIn?: number;
  maxBuyIn?: number;
  types?: string[];
  speeds?: string[];
  sites?: string[];
  startTime?: string; // "HH:mm"
  endTime?: string;   // "HH:mm"
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
function makeTournament(overrides: Partial<LibraryTournament> = {}): LibraryTournament {
  return {
    id: 'lib-001',
    userId: 'USER-0001',
    name: 'Daily $22 PKO',
    site: 'GGPoker',
    buyIn: '22.00',
    time: '20:00',
    type: 'PKO',
    speed: 'Normal',
    source: 'manual',
    externalId: null,
    deletedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Dataset de teste compartilhado
// ---------------------------------------------------------------------------
const testDataset: LibraryTournament[] = [
  makeTournament({ id: 'lib-001', name: 'Daily $22 PKO', site: 'GGPoker', buyIn: '22.00', time: '19:00', type: 'PKO', speed: 'Normal' }),
  makeTournament({ id: 'lib-002', name: 'Super Tuesday $109', site: 'PokerStars', buyIn: '109.00', time: '20:30', type: 'Vanilla', speed: 'Normal' }),
  makeTournament({ id: 'lib-003', name: 'Turbo $55 PKO', site: 'GGPoker', buyIn: '55.00', time: '21:00', type: 'PKO', speed: 'Turbo' }),
  makeTournament({ id: 'lib-004', name: 'Hyper $11', site: 'Suprema', buyIn: '11.00', time: '22:00', type: 'Vanilla', speed: 'Hyper' }),
  makeTournament({ id: 'lib-005', name: 'Mystery $33', site: 'PokerStars', buyIn: '33.00', time: '18:00', type: 'Mystery', speed: 'Normal' }),
  makeTournament({ id: 'lib-006', name: 'Late Night $22', site: 'Suprema', buyIn: '22.00', time: '01:00', type: 'PKO', speed: 'Turbo' }),
  makeTournament({ id: 'lib-007', name: 'Freeroll Sunday', site: 'GGPoker', buyIn: '0', time: '15:00', type: 'Vanilla', speed: 'Normal' }),
  makeTournament({ id: 'lib-008', name: 'High Roller $530', site: 'PokerStars', buyIn: '530.00', time: '20:00', type: 'PKO', speed: 'Normal' }),
  makeTournament({ id: 'lib-009', name: 'No Time Tournament', site: 'GGPoker', buyIn: '22.00', time: null, type: 'Vanilla', speed: 'Normal' }),
];

// =============================================================================
// Filtro por texto (search)
// =============================================================================

describe('filterLibraryTournaments', () => {

  describe('filtro por texto (search)', () => {

    it('deve filtrar por nome parcial', () => {
      const result = filterLibraryTournaments(testDataset, { search: 'Daily' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('lib-001');
    });

    it('deve ser case-insensitive', () => {
      const result = filterLibraryTournaments(testDataset, { search: 'daily' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('lib-001');
    });

    it('deve retornar multiplos resultados para busca parcial', () => {
      const result = filterLibraryTournaments(testDataset, { search: '$22' });

      expect(result).toHaveLength(3); // Daily $22 PKO, Late Night $22, No Time Tournament (buyIn=22 mas $22 no nome)
      expect(result.map((t) => t.id)).toContain('lib-001');
      expect(result.map((t) => t.id)).toContain('lib-006');
    });

    it('deve retornar vazio quando busca nao encontra nada', () => {
      const result = filterLibraryTournaments(testDataset, { search: 'inexistente' });

      expect(result).toHaveLength(0);
    });

    it('deve buscar por substring no meio do nome', () => {
      const result = filterLibraryTournaments(testDataset, { search: 'Tuesday' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('lib-002');
    });
  });

  // ===========================================================================
  // Filtro por buy-in range
  // ===========================================================================

  describe('filtro por buy-in range', () => {

    it('deve filtrar por minBuyIn', () => {
      const result = filterLibraryTournaments(testDataset, { minBuyIn: 100 });

      expect(result).toHaveLength(2); // $109 e $530
      expect(result.map((t) => t.id)).toContain('lib-002');
      expect(result.map((t) => t.id)).toContain('lib-008');
    });

    it('deve filtrar por maxBuyIn', () => {
      const result = filterLibraryTournaments(testDataset, { maxBuyIn: 22 });

      expect(result.every((t) => parseFloat(t.buyIn) <= 22)).toBe(true);
    });

    it('deve filtrar por range min e max combinados', () => {
      const result = filterLibraryTournaments(testDataset, { minBuyIn: 20, maxBuyIn: 60 });

      expect(result.every((t) => {
        const bi = parseFloat(t.buyIn);
        return bi >= 20 && bi <= 60;
      })).toBe(true);
    });

    it('deve incluir torneio no limite exato do min', () => {
      const result = filterLibraryTournaments(testDataset, { minBuyIn: 22 });

      expect(result.map((t) => t.id)).toContain('lib-001'); // buyIn = 22.00
    });

    it('deve incluir torneio no limite exato do max', () => {
      const result = filterLibraryTournaments(testDataset, { maxBuyIn: 22 });

      expect(result.map((t) => t.id)).toContain('lib-001'); // buyIn = 22.00
    });

    it('deve incluir freeroll (buyIn=0) quando minBuyIn nao definido', () => {
      const result = filterLibraryTournaments(testDataset, { maxBuyIn: 50 });

      expect(result.map((t) => t.id)).toContain('lib-007'); // Freeroll
    });

    it('deve excluir freeroll quando minBuyIn > 0', () => {
      const result = filterLibraryTournaments(testDataset, { minBuyIn: 1 });

      expect(result.map((t) => t.id)).not.toContain('lib-007');
    });
  });

  // ===========================================================================
  // Filtro por type (multi-select)
  // ===========================================================================

  describe('filtro por type', () => {

    it('deve filtrar por um tipo (PKO)', () => {
      const result = filterLibraryTournaments(testDataset, { types: ['PKO'] });

      expect(result.every((t) => t.type === 'PKO')).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('deve filtrar por multiplos tipos (PKO e Vanilla)', () => {
      const result = filterLibraryTournaments(testDataset, { types: ['PKO', 'Vanilla'] });

      expect(result.every((t) => t.type === 'PKO' || t.type === 'Vanilla')).toBe(true);
    });

    it('deve filtrar por tipo Mystery', () => {
      const result = filterLibraryTournaments(testDataset, { types: ['Mystery'] });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('lib-005');
    });

    it('deve retornar vazio para tipo que nao existe no dataset', () => {
      const result = filterLibraryTournaments(testDataset, { types: ['Bounty'] });

      expect(result).toHaveLength(0);
    });

    it('deve incluir torneio com type null quando types nao esta no filtro', () => {
      const data = [makeTournament({ id: 'lib-null-type', type: null })];
      const result = filterLibraryTournaments(data, {});

      expect(result).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Filtro por speed (multi-select)
  // ===========================================================================

  describe('filtro por speed', () => {

    it('deve filtrar por uma velocidade (Turbo)', () => {
      const result = filterLibraryTournaments(testDataset, { speeds: ['Turbo'] });

      expect(result.every((t) => t.speed === 'Turbo')).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('deve filtrar por multiplas velocidades (Normal e Hyper)', () => {
      const result = filterLibraryTournaments(testDataset, { speeds: ['Normal', 'Hyper'] });

      expect(result.every((t) => t.speed === 'Normal' || t.speed === 'Hyper')).toBe(true);
    });

    it('deve filtrar por Hyper', () => {
      const result = filterLibraryTournaments(testDataset, { speeds: ['Hyper'] });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('lib-004');
    });
  });

  // ===========================================================================
  // Filtro por site (multi-select)
  // ===========================================================================

  describe('filtro por site', () => {

    it('deve filtrar por um site (GGPoker)', () => {
      const result = filterLibraryTournaments(testDataset, { sites: ['GGPoker'] });

      expect(result.every((t) => t.site === 'GGPoker')).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('deve filtrar por multiplos sites', () => {
      const result = filterLibraryTournaments(testDataset, { sites: ['GGPoker', 'Suprema'] });

      expect(result.every((t) => t.site === 'GGPoker' || t.site === 'Suprema')).toBe(true);
    });

    it('deve retornar vazio para site que nao existe', () => {
      const result = filterLibraryTournaments(testDataset, { sites: ['888poker'] });

      expect(result).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Filtro por time range
  // ===========================================================================

  describe('filtro por time range', () => {

    it('deve filtrar por startTime', () => {
      const result = filterLibraryTournaments(testDataset, { startTime: '20:00' });

      // Deve incluir torneios com time >= 20:00
      result.forEach((t) => {
        if (t.time !== null) {
          expect(t.time >= '20:00').toBe(true);
        }
      });
    });

    it('deve filtrar por endTime', () => {
      const result = filterLibraryTournaments(testDataset, { endTime: '19:00' });

      // Deve incluir torneios com time <= 19:00
      result.forEach((t) => {
        if (t.time !== null) {
          expect(t.time <= '19:00').toBe(true);
        }
      });
    });

    it('deve filtrar por range completo (startTime e endTime)', () => {
      const result = filterLibraryTournaments(testDataset, { startTime: '19:00', endTime: '21:00' });

      result.forEach((t) => {
        if (t.time !== null) {
          expect(t.time >= '19:00' && t.time <= '21:00').toBe(true);
        }
      });
    });

    it('deve incluir torneio no limite exato do startTime', () => {
      const result = filterLibraryTournaments(testDataset, { startTime: '19:00', endTime: '23:59' });

      expect(result.map((t) => t.id)).toContain('lib-001'); // time = 19:00
    });

    it('deve incluir torneio no limite exato do endTime', () => {
      const result = filterLibraryTournaments(testDataset, { startTime: '18:00', endTime: '19:00' });

      expect(result.map((t) => t.id)).toContain('lib-001'); // time = 19:00
      expect(result.map((t) => t.id)).toContain('lib-005'); // time = 18:00
    });

    it('deve excluir torneio com time null quando filtro de time esta ativo', () => {
      const result = filterLibraryTournaments(testDataset, { startTime: '18:00', endTime: '22:00' });

      expect(result.map((t) => t.id)).not.toContain('lib-009'); // time = null
    });
  });

  // ===========================================================================
  // Filtros combinados (AND logico)
  // ===========================================================================

  describe('filtros combinados (AND logico)', () => {

    it('deve combinar search + type', () => {
      const result = filterLibraryTournaments(testDataset, {
        search: 'PKO',
        types: ['PKO'],
      });

      expect(result.every((t) => t.type === 'PKO' && t.name.toLowerCase().includes('pko'))).toBe(true);
    });

    it('deve combinar site + speed', () => {
      const result = filterLibraryTournaments(testDataset, {
        sites: ['GGPoker'],
        speeds: ['Normal'],
      });

      expect(result.every((t) => t.site === 'GGPoker' && t.speed === 'Normal')).toBe(true);
    });

    it('deve combinar minBuyIn + types + sites', () => {
      const result = filterLibraryTournaments(testDataset, {
        minBuyIn: 20,
        types: ['PKO'],
        sites: ['GGPoker'],
      });

      expect(result.every((t) =>
        parseFloat(t.buyIn) >= 20 &&
        t.type === 'PKO' &&
        t.site === 'GGPoker'
      )).toBe(true);
    });

    it('deve retornar vazio quando combinacao de filtros nao tem match', () => {
      const result = filterLibraryTournaments(testDataset, {
        sites: ['Suprema'],
        types: ['Mystery'],
      });

      // Nao ha torneio Mystery na Suprema
      expect(result).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Filtro vazio / undefined
  // ===========================================================================

  describe('filtro vazio', () => {

    it('deve retornar todos quando filtro e objeto vazio', () => {
      const result = filterLibraryTournaments(testDataset, {});

      expect(result).toHaveLength(testDataset.length);
    });

    it('deve retornar todos quando filtro e undefined', () => {
      const result = filterLibraryTournaments(testDataset, undefined as any);

      expect(result).toHaveLength(testDataset.length);
    });

    it('deve retornar todos quando todos os campos do filtro sao undefined', () => {
      const result = filterLibraryTournaments(testDataset, {
        search: undefined,
        minBuyIn: undefined,
        maxBuyIn: undefined,
        types: undefined,
        speeds: undefined,
        sites: undefined,
        startTime: undefined,
        endTime: undefined,
      });

      expect(result).toHaveLength(testDataset.length);
    });
  });

  // ===========================================================================
  // Nenhum resultado
  // ===========================================================================

  describe('nenhum resultado', () => {

    it('deve retornar array vazio quando nenhum torneio corresponde', () => {
      const result = filterLibraryTournaments(testDataset, { search: 'xyz-nao-existe' });

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });

    it('deve retornar array vazio quando lista de torneios esta vazia', () => {
      const result = filterLibraryTournaments([], { search: 'algo' });

      expect(result).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Arrays vazios em multi-select
  // ===========================================================================

  describe('arrays vazios em filtros multi-select', () => {

    it('deve retornar todos quando types e array vazio', () => {
      const result = filterLibraryTournaments(testDataset, { types: [] });

      expect(result).toHaveLength(testDataset.length);
    });

    it('deve retornar todos quando speeds e array vazio', () => {
      const result = filterLibraryTournaments(testDataset, { speeds: [] });

      expect(result).toHaveLength(testDataset.length);
    });

    it('deve retornar todos quando sites e array vazio', () => {
      const result = filterLibraryTournaments(testDataset, { sites: [] });

      expect(result).toHaveLength(testDataset.length);
    });
  });

  // ===========================================================================
  // Search com string vazia
  // ===========================================================================

  describe('search com string vazia', () => {

    it('deve retornar todos quando search e string vazia', () => {
      const result = filterLibraryTournaments(testDataset, { search: '' });

      expect(result).toHaveLength(testDataset.length);
    });
  });
});
