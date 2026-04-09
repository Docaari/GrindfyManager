import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: RF-03 — Filtros do Dashboard persistentes via URL (FP-11)
//
// Funcoes puras que controlam a logica de persistencia de filtros:
//   - `serializeFiltersToURL`: converte objeto de filtros para URLSearchParams string
//   - `deserializeFiltersFromURL`: converte URL params de volta para objeto de filtros
//   - `isDefaultFilter`: verifica se valor e o default para aquela chave
//   - `getDefaultFilters`: retorna objeto com todos os filtros default
//
// Modulo esperado: `client/src/lib/dashboard-filter-helpers.ts`
//
// Todos devem FALHAR (red phase) — funcoes ainda nao existem.
// =============================================================================

// Estas funcoes AINDA NAO EXISTEM
// import {
//   serializeFiltersToURL,
//   deserializeFiltersFromURL,
//   isDefaultFilter,
//   getDefaultFilters,
// } from '../../../client/src/lib/dashboard-filter-helpers';

// Tipos esperados
interface DashboardFilters {
  period: string;
  tab: string;
  sites: string[];
  categories: string[];
  speeds: string[];
  keyword: string;
  keywordType: string;
  dateFrom: string;
  dateTo: string;
  participantMin: number | null;
  participantMax: number | null;
}

// Stubs para compilacao — Implementer substituira
let serializeFiltersToURL: (filters: DashboardFilters) => string;
let deserializeFiltersFromURL: (searchParams: string) => DashboardFilters;
let isDefaultFilter: (key: string, value: any) => boolean;
let getDefaultFilters: () => DashboardFilters;

try {
  const mod = require('../../../client/src/lib/dashboard-filter-helpers');
  if (mod.serializeFiltersToURL) serializeFiltersToURL = mod.serializeFiltersToURL;
  if (mod.deserializeFiltersFromURL) deserializeFiltersFromURL = mod.deserializeFiltersFromURL;
  if (mod.isDefaultFilter) isDefaultFilter = mod.isDefaultFilter;
  if (mod.getDefaultFilters) getDefaultFilters = mod.getDefaultFilters;
} catch {
  // Esperado em red phase
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const defaultFilters: DashboardFilters = {
  period: 'all',
  tab: 'evolution',
  sites: [],
  categories: [],
  speeds: [],
  keyword: '',
  keywordType: 'contains',
  dateFrom: '',
  dateTo: '',
  participantMin: null,
  participantMax: null,
};

const filtersWithPeriod: DashboardFilters = {
  ...defaultFilters,
  period: 'last_3_months',
};

const filtersWithTab: DashboardFilters = {
  ...defaultFilters,
  tab: 'por-site',
};

const filtersWithSites: DashboardFilters = {
  ...defaultFilters,
  sites: ['GGPoker', 'PokerStars'],
};

const filtersComplex: DashboardFilters = {
  period: 'last_6_months',
  tab: 'por-abi',
  sites: ['PokerStars', '888poker'],
  categories: ['PKO', 'Vanilla'],
  speeds: ['Turbo'],
  keyword: 'Sunday',
  keywordType: 'contains',
  dateFrom: '2026-01-01',
  dateTo: '2026-03-31',
  participantMin: 100,
  participantMax: 1500,
};

// ---------------------------------------------------------------------------
// getDefaultFilters — retorna filtros default
// ---------------------------------------------------------------------------

describe('getDefaultFilters', () => {
  it('deve retornar period "all" como default', () => {
    const defaults = getDefaultFilters();
    expect(defaults.period).toBe('all');
  });

  it('deve retornar tab "evolution" como default', () => {
    const defaults = getDefaultFilters();
    expect(defaults.tab).toBe('evolution');
  });

  it('deve retornar arrays vazios para sites, categories e speeds', () => {
    const defaults = getDefaultFilters();
    expect(defaults.sites).toEqual([]);
    expect(defaults.categories).toEqual([]);
    expect(defaults.speeds).toEqual([]);
  });

  it('deve retornar keyword vazio e keywordType "contains"', () => {
    const defaults = getDefaultFilters();
    expect(defaults.keyword).toBe('');
    expect(defaults.keywordType).toBe('contains');
  });

  it('deve retornar participantMin e participantMax como null', () => {
    const defaults = getDefaultFilters();
    expect(defaults.participantMin).toBeNull();
    expect(defaults.participantMax).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isDefaultFilter — verifica se valor e o default para aquela chave
// ---------------------------------------------------------------------------

describe('isDefaultFilter', () => {
  it('deve retornar true para period "all"', () => {
    expect(isDefaultFilter('period', 'all')).toBe(true);
  });

  it('deve retornar false para period "last_3_months"', () => {
    expect(isDefaultFilter('period', 'last_3_months')).toBe(false);
  });

  it('deve retornar true para tab "evolution"', () => {
    expect(isDefaultFilter('tab', 'evolution')).toBe(true);
  });

  it('deve retornar false para tab "por-site"', () => {
    expect(isDefaultFilter('tab', 'por-site')).toBe(false);
  });

  it('deve retornar true para sites array vazio', () => {
    expect(isDefaultFilter('sites', [])).toBe(true);
  });

  it('deve retornar false para sites com valores', () => {
    expect(isDefaultFilter('sites', ['GGPoker'])).toBe(false);
  });

  it('deve retornar true para keyword vazio', () => {
    expect(isDefaultFilter('keyword', '')).toBe(true);
  });

  it('deve retornar true para participantMin null', () => {
    expect(isDefaultFilter('participantMin', null)).toBe(true);
  });

  it('deve retornar false para participantMin com valor', () => {
    expect(isDefaultFilter('participantMin', 100)).toBe(false);
  });

  it('deve retornar true para keywordType "contains" (valor default)', () => {
    expect(isDefaultFilter('keywordType', 'contains')).toBe(true);
  });

  it('deve retornar false para keywordType "exact"', () => {
    expect(isDefaultFilter('keywordType', 'exact')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// serializeFiltersToURL — converte filtros para URLSearchParams string
// ---------------------------------------------------------------------------

describe('serializeFiltersToURL', () => {
  it('deve retornar string vazia para filtros totalmente default', () => {
    const result = serializeFiltersToURL(defaultFilters);
    expect(result).toBe('');
  });

  it('deve incluir apenas period quando difere do default', () => {
    const result = serializeFiltersToURL(filtersWithPeriod);
    expect(result).toBe('period=last_3_months');
  });

  it('deve incluir tab quando difere do default', () => {
    const result = serializeFiltersToURL(filtersWithTab);
    expect(result).toBe('tab=por-site');
  });

  it('deve serializar sites como comma-separated', () => {
    const result = serializeFiltersToURL(filtersWithSites);
    expect(result).toBe('sites=GGPoker%2CPokerStars');
  });

  it('deve serializar filtros complexos com multiplos params', () => {
    const result = serializeFiltersToURL(filtersComplex);
    const params = new URLSearchParams(result);
    expect(params.get('period')).toBe('last_6_months');
    expect(params.get('tab')).toBe('por-abi');
    expect(params.get('sites')).toBe('PokerStars,888poker');
    expect(params.get('categories')).toBe('PKO,Vanilla');
    expect(params.get('speeds')).toBe('Turbo');
    expect(params.get('keyword')).toBe('Sunday');
    expect(params.get('dateFrom')).toBe('2026-01-01');
    expect(params.get('dateTo')).toBe('2026-03-31');
    expect(params.get('pMin')).toBe('100');
    expect(params.get('pMax')).toBe('1500');
  });

  it('nao deve incluir keywordType quando e o default "contains"', () => {
    const result = serializeFiltersToURL(filtersComplex);
    const params = new URLSearchParams(result);
    expect(params.has('keywordType')).toBe(false);
  });

  it('deve incluir keywordType quando difere do default', () => {
    const filters: DashboardFilters = { ...defaultFilters, keywordType: 'exact', keyword: 'Test' };
    const result = serializeFiltersToURL(filters);
    const params = new URLSearchParams(result);
    expect(params.get('keywordType')).toBe('exact');
  });

  it('nao deve incluir arrays vazios na URL', () => {
    const result = serializeFiltersToURL(defaultFilters);
    expect(result).not.toContain('sites');
    expect(result).not.toContain('categories');
    expect(result).not.toContain('speeds');
  });

  it('deve usar pMin e pMax como nomes de param para participantes', () => {
    const filters: DashboardFilters = { ...defaultFilters, participantMin: 50, participantMax: 500 };
    const result = serializeFiltersToURL(filters);
    const params = new URLSearchParams(result);
    expect(params.get('pMin')).toBe('50');
    expect(params.get('pMax')).toBe('500');
  });
});

// ---------------------------------------------------------------------------
// deserializeFiltersFromURL — converte URL params para objeto de filtros
// ---------------------------------------------------------------------------

describe('deserializeFiltersFromURL', () => {
  it('deve retornar filtros default para string vazia', () => {
    const result = deserializeFiltersFromURL('');
    expect(result).toEqual(defaultFilters);
  });

  it('deve parsear period da URL', () => {
    const result = deserializeFiltersFromURL('period=last_3_months');
    expect(result.period).toBe('last_3_months');
  });

  it('deve parsear tab da URL', () => {
    const result = deserializeFiltersFromURL('tab=por-site');
    expect(result.tab).toBe('por-site');
  });

  it('deve parsear sites comma-separated como array', () => {
    const result = deserializeFiltersFromURL('sites=GGPoker%2CPokerStars');
    expect(result.sites).toEqual(['GGPoker', 'PokerStars']);
  });

  it('deve parsear pMin e pMax como numeros', () => {
    const result = deserializeFiltersFromURL('pMin=100&pMax=1500');
    expect(result.participantMin).toBe(100);
    expect(result.participantMax).toBe(1500);
  });

  it('deve ignorar param de tab invalido e usar default', () => {
    const result = deserializeFiltersFromURL('tab=inexistente');
    expect(result.tab).toBe('evolution');
  });

  it('deve ignorar param de period invalido e usar default', () => {
    const result = deserializeFiltersFromURL('period=xyz');
    expect(result.period).toBe('all');
  });

  it('deve ignorar pMin nao numerico e usar default null', () => {
    const result = deserializeFiltersFromURL('pMin=abc');
    expect(result.participantMin).toBeNull();
  });

  it('deve ignorar sites vazio (sem filtro)', () => {
    const result = deserializeFiltersFromURL('sites=');
    expect(result.sites).toEqual([]);
  });

  it('deve preservar filtros nao especificados como default', () => {
    const result = deserializeFiltersFromURL('period=last_3_months');
    expect(result.tab).toBe('evolution');
    expect(result.sites).toEqual([]);
    expect(result.keyword).toBe('');
  });

  it('deve parsear filtros complexos completos', () => {
    const url = 'period=last_6_months&tab=por-abi&sites=PokerStars%2C888poker&categories=PKO%2CVanilla&speeds=Turbo&keyword=Sunday&dateFrom=2026-01-01&dateTo=2026-03-31&pMin=100&pMax=1500';
    const result = deserializeFiltersFromURL(url);
    expect(result.period).toBe('last_6_months');
    expect(result.tab).toBe('por-abi');
    expect(result.sites).toEqual(['PokerStars', '888poker']);
    expect(result.categories).toEqual(['PKO', 'Vanilla']);
    expect(result.speeds).toEqual(['Turbo']);
    expect(result.keyword).toBe('Sunday');
    expect(result.dateFrom).toBe('2026-01-01');
    expect(result.dateTo).toBe('2026-03-31');
    expect(result.participantMin).toBe(100);
    expect(result.participantMax).toBe(1500);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: serialize -> deserialize retorna o mesmo objeto
// ---------------------------------------------------------------------------

describe('round-trip serialize/deserialize', () => {
  it('deve preservar filtros default no round-trip', () => {
    const serialized = serializeFiltersToURL(defaultFilters);
    const deserialized = deserializeFiltersFromURL(serialized);
    expect(deserialized).toEqual(defaultFilters);
  });

  it('deve preservar filtros com period no round-trip', () => {
    const serialized = serializeFiltersToURL(filtersWithPeriod);
    const deserialized = deserializeFiltersFromURL(serialized);
    expect(deserialized.period).toBe('last_3_months');
  });

  it('deve preservar filtros complexos no round-trip', () => {
    const serialized = serializeFiltersToURL(filtersComplex);
    const deserialized = deserializeFiltersFromURL(serialized);
    expect(deserialized.period).toBe(filtersComplex.period);
    expect(deserialized.tab).toBe(filtersComplex.tab);
    expect(deserialized.sites).toEqual(filtersComplex.sites);
    expect(deserialized.categories).toEqual(filtersComplex.categories);
    expect(deserialized.speeds).toEqual(filtersComplex.speeds);
    expect(deserialized.keyword).toBe(filtersComplex.keyword);
    expect(deserialized.dateFrom).toBe(filtersComplex.dateFrom);
    expect(deserialized.dateTo).toBe(filtersComplex.dateTo);
    expect(deserialized.participantMin).toBe(filtersComplex.participantMin);
    expect(deserialized.participantMax).toBe(filtersComplex.participantMax);
  });

  it('deve preservar filtros com sites no round-trip', () => {
    const serialized = serializeFiltersToURL(filtersWithSites);
    const deserialized = deserializeFiltersFromURL(serialized);
    expect(deserialized.sites).toEqual(['GGPoker', 'PokerStars']);
  });
});
