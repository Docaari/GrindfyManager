import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: RF-05 — Empty state na Biblioteca com filtros ativos (FP-18)
//
// Funcoes puras que determinam o tipo de empty state e deteccao de filtros:
//   - `hasActiveFilters`: verifica se algum filtro esta diferente do default
//   - `getEmptyStateType`: retorna tipo de empty state a exibir
//   - `getDefaultFilters`: retorna o estado default dos filtros
//
// Modulo esperado: `client/src/components/tournament-library/filter-helpers.ts`
//
// Testes de hasActiveFilters e getDefaultFilters devem PASSAR (logica ja existe inline).
// Testes de getEmptyStateType devem FALHAR (funcao nova).
// =============================================================================

// Estas funcoes AINDA NAO EXISTEM como modulo separado
// import {
//   hasActiveFilters,
//   getEmptyStateType,
//   getDefaultFilters,
// } from '../../../client/src/components/tournament-library/filter-helpers';

type EmptyStateType = 'no-data' | 'no-results-with-filters';

interface TournamentLibraryFilters {
  period: string;
  sites: string[];
  categories: string[];
  speeds: string[];
  buyinRange: {
    min: number | null;
    max: number | null;
  };
  roiFilter: string;
  profitFilter: string;
  volumeFilter: string;
  minimumVolume: number | null;
}

// Stubs
let hasActiveFilters: (filters: TournamentLibraryFilters, searchTerm: string) => boolean;
let getEmptyStateType: (resultCount: number, filters: TournamentLibraryFilters, searchTerm: string) => EmptyStateType | null;
let getDefaultFilters: () => TournamentLibraryFilters;

try {
  const mod = require('../../../client/src/components/tournament-library/filter-helpers');
  if (mod.hasActiveFilters) hasActiveFilters = mod.hasActiveFilters;
  if (mod.getEmptyStateType) getEmptyStateType = mod.getEmptyStateType;
  if (mod.getDefaultFilters) getDefaultFilters = mod.getDefaultFilters;
} catch {
  // Esperado em red phase
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const defaultFilters: TournamentLibraryFilters = {
  period: 'all',
  sites: [],
  categories: [],
  speeds: [],
  buyinRange: { min: null, max: null },
  roiFilter: 'all',
  profitFilter: 'all',
  volumeFilter: 'all',
  minimumVolume: null,
};

// ---------------------------------------------------------------------------
// getDefaultFilters — retorna estado default dos filtros
// ---------------------------------------------------------------------------

describe('getDefaultFilters', () => {
  it('deve retornar filtros com period "all"', () => {
    const defaults = getDefaultFilters();
    expect(defaults.period).toBe('all');
  });

  it('deve retornar arrays vazios para sites, categories e speeds', () => {
    const defaults = getDefaultFilters();
    expect(defaults.sites).toEqual([]);
    expect(defaults.categories).toEqual([]);
    expect(defaults.speeds).toEqual([]);
  });

  it('deve retornar buyinRange com min e max null', () => {
    const defaults = getDefaultFilters();
    expect(defaults.buyinRange).toEqual({ min: null, max: null });
  });

  it('deve retornar roiFilter, profitFilter e volumeFilter como "all"', () => {
    const defaults = getDefaultFilters();
    expect(defaults.roiFilter).toBe('all');
    expect(defaults.profitFilter).toBe('all');
    expect(defaults.volumeFilter).toBe('all');
  });

  it('deve retornar minimumVolume como null', () => {
    const defaults = getDefaultFilters();
    expect(defaults.minimumVolume).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hasActiveFilters — detecta se algum filtro esta diferente do default
// ---------------------------------------------------------------------------

describe('hasActiveFilters', () => {
  it('deve retornar false quando todos os filtros estao no default e searchTerm vazio', () => {
    expect(hasActiveFilters(defaultFilters, '')).toBe(false);
  });

  it('deve retornar true quando searchTerm nao esta vazio', () => {
    expect(hasActiveFilters(defaultFilters, 'Sunday Million')).toBe(true);
  });

  it('deve retornar true quando sites tem valores', () => {
    const filters = { ...defaultFilters, sites: ['PokerStars'] };
    expect(hasActiveFilters(filters, '')).toBe(true);
  });

  it('deve retornar true quando categories tem valores', () => {
    const filters = { ...defaultFilters, categories: ['PKO'] };
    expect(hasActiveFilters(filters, '')).toBe(true);
  });

  it('deve retornar true quando speeds tem valores', () => {
    const filters = { ...defaultFilters, speeds: ['Turbo'] };
    expect(hasActiveFilters(filters, '')).toBe(true);
  });

  it('deve retornar true quando roiFilter nao e "all"', () => {
    const filters = { ...defaultFilters, roiFilter: 'positive' };
    expect(hasActiveFilters(filters, '')).toBe(true);
  });

  it('deve retornar true quando profitFilter nao e "all"', () => {
    const filters = { ...defaultFilters, profitFilter: 'higher' };
    expect(hasActiveFilters(filters, '')).toBe(true);
  });

  it('deve retornar true quando volumeFilter nao e "all"', () => {
    const filters = { ...defaultFilters, volumeFilter: 'higher' };
    expect(hasActiveFilters(filters, '')).toBe(true);
  });

  it('deve retornar true quando minimumVolume tem valor', () => {
    const filters = { ...defaultFilters, minimumVolume: 100 };
    expect(hasActiveFilters(filters, '')).toBe(true);
  });

  it('deve retornar true quando buyinRange.min tem valor', () => {
    const filters = { ...defaultFilters, buyinRange: { min: 10, max: null } };
    expect(hasActiveFilters(filters, '')).toBe(true);
  });

  it('deve retornar true quando buyinRange.max tem valor', () => {
    const filters = { ...defaultFilters, buyinRange: { min: null, max: 100 } };
    expect(hasActiveFilters(filters, '')).toBe(true);
  });

  it('deve retornar true quando multiplos filtros estao ativos', () => {
    const filters = {
      ...defaultFilters,
      sites: ['PokerStars', 'GGPoker'],
      roiFilter: 'positive',
      buyinRange: { min: 10, max: 200 },
    };
    expect(hasActiveFilters(filters, 'Sunday')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getEmptyStateType — determina tipo de empty state
// ---------------------------------------------------------------------------

describe('getEmptyStateType', () => {
  it('deve retornar null quando ha resultados (nao e empty state)', () => {
    expect(getEmptyStateType(5, defaultFilters, '')).toBeNull();
  });

  it('deve retornar "no-data" quando 0 resultados e sem filtros ativos', () => {
    expect(getEmptyStateType(0, defaultFilters, '')).toBe('no-data');
  });

  it('deve retornar "no-results-with-filters" quando 0 resultados com filtro de busca', () => {
    expect(getEmptyStateType(0, defaultFilters, 'Sunday Million')).toBe('no-results-with-filters');
  });

  it('deve retornar "no-results-with-filters" quando 0 resultados com filtro de site', () => {
    const filters = { ...defaultFilters, sites: ['PokerStars'] };
    expect(getEmptyStateType(0, filters, '')).toBe('no-results-with-filters');
  });

  it('deve retornar "no-results-with-filters" quando 0 resultados com filtro de ROI', () => {
    const filters = { ...defaultFilters, roiFilter: 'positive' };
    expect(getEmptyStateType(0, filters, '')).toBe('no-results-with-filters');
  });

  it('deve retornar "no-results-with-filters" quando 0 resultados com buyinRange definido', () => {
    const filters = { ...defaultFilters, buyinRange: { min: 50, max: 100 } };
    expect(getEmptyStateType(0, filters, '')).toBe('no-results-with-filters');
  });

  it('deve retornar "no-data" quando 0 resultados e filtros sao exatamente o default', () => {
    // Garante que filtros default nao sao detectados como "ativos"
    expect(getEmptyStateType(0, defaultFilters, '')).toBe('no-data');
  });
});
