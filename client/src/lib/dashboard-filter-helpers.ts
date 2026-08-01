// Dashboard filter persistence helpers (FP-11)

export interface DashboardFilters {
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

  // Reforma dos filtros (2026-08-01). Todos OPCIONAIS: URL antiga, sem nenhum
  // destes, continua abrindo com o mesmo resultado de antes.
  sitesExclude?: string[];
  categoriesExclude?: string[];
  speedsExclude?: string[];
  buyinBands?: string[];
  buyinBandsExclude?: string[];
  fieldBands?: string[];
  fieldBandsExclude?: string[];
  modifiers?: string[];
  modifiersExclude?: string[];
  buyinMin?: number | null;
  buyinMax?: number | null;
}

/**
 * Nome curto de cada lista nova na query string. Manter estavel: e o que o
 * jogador compartilha quando copia o link do dashboard.
 */
const LIST_PARAMS: Array<[keyof DashboardFilters, string]> = [
  ['sitesExclude', 'sitesX'],
  ['categoriesExclude', 'catsX'],
  ['speedsExclude', 'speedsX'],
  ['buyinBands', 'abi'],
  ['buyinBandsExclude', 'abiX'],
  ['fieldBands', 'field'],
  ['fieldBandsExclude', 'fieldX'],
  ['modifiers', 'mods'],
  ['modifiersExclude', 'modsX'],
];

const VALID_PERIODS = [
  'all', 'current_month', 'last_3_months', 'last_6_months',
  'current_year', 'last_12_months', 'last_24_months', 'last_36_months',
];

const VALID_TABS = [
  'evolution', 'por-site', 'por-abi', 'por-tipo',
  'velocidade', 'por-periodo', 'por-participantes', 'por-posicao',
];

const DEFAULTS: DashboardFilters = {
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

export function getDefaultFilters(): DashboardFilters {
  return { ...DEFAULTS, sites: [], categories: [], speeds: [] };
}

export function isDefaultFilter(key: string, value: any): boolean {
  if (key === 'sites' || key === 'categories' || key === 'speeds') {
    return Array.isArray(value) && value.length === 0;
  }
  if (key === 'participantMin' || key === 'participantMax') {
    return value === null;
  }
  return value === (DEFAULTS as any)[key];
}

export function serializeFiltersToURL(filters: DashboardFilters): string {
  const params = new URLSearchParams();

  if (!isDefaultFilter('period', filters.period)) params.set('period', filters.period);
  if (!isDefaultFilter('tab', filters.tab)) params.set('tab', filters.tab);
  if (!isDefaultFilter('sites', filters.sites)) params.set('sites', filters.sites.join(','));
  if (!isDefaultFilter('categories', filters.categories)) params.set('categories', filters.categories.join(','));
  if (!isDefaultFilter('speeds', filters.speeds)) params.set('speeds', filters.speeds.join(','));
  if (!isDefaultFilter('keyword', filters.keyword)) params.set('keyword', filters.keyword);
  if (!isDefaultFilter('keywordType', filters.keywordType)) params.set('keywordType', filters.keywordType);
  if (!isDefaultFilter('dateFrom', filters.dateFrom)) params.set('dateFrom', filters.dateFrom);
  if (!isDefaultFilter('dateTo', filters.dateTo)) params.set('dateTo', filters.dateTo);
  if (!isDefaultFilter('participantMin', filters.participantMin)) params.set('pMin', String(filters.participantMin));
  if (!isDefaultFilter('participantMax', filters.participantMax)) params.set('pMax', String(filters.participantMax));

  // Listas novas (excluir / faixas / modificadores). Lista vazia nao vai pra URL.
  for (const [key, param] of LIST_PARAMS) {
    const value = filters[key] as string[] | undefined;
    if (Array.isArray(value) && value.length > 0) params.set(param, value.join(','));
  }
  if (filters.buyinMin !== null && filters.buyinMin !== undefined) params.set('bMin', String(filters.buyinMin));
  if (filters.buyinMax !== null && filters.buyinMax !== undefined) params.set('bMax', String(filters.buyinMax));

  return params.toString();
}

export function deserializeFiltersFromURL(searchParams: string): DashboardFilters {
  const params = new URLSearchParams(searchParams);
  const defaults = getDefaultFilters();

  const period = params.get('period');
  if (period && VALID_PERIODS.includes(period)) {
    defaults.period = period;
  }

  const tab = params.get('tab');
  if (tab && VALID_TABS.includes(tab)) {
    defaults.tab = tab;
  }

  const sites = params.get('sites');
  if (sites && sites.length > 0) {
    defaults.sites = sites.split(',');
  }

  const categories = params.get('categories');
  if (categories && categories.length > 0) {
    defaults.categories = categories.split(',');
  }

  const speeds = params.get('speeds');
  if (speeds && speeds.length > 0) {
    defaults.speeds = speeds.split(',');
  }

  const keyword = params.get('keyword');
  if (keyword) {
    defaults.keyword = keyword;
  }

  const keywordType = params.get('keywordType');
  if (keywordType) {
    defaults.keywordType = keywordType;
  }

  const dateFrom = params.get('dateFrom');
  if (dateFrom) {
    defaults.dateFrom = dateFrom;
  }

  const dateTo = params.get('dateTo');
  if (dateTo) {
    defaults.dateTo = dateTo;
  }

  const pMin = params.get('pMin');
  if (pMin && !isNaN(Number(pMin))) {
    defaults.participantMin = Number(pMin);
  }

  const pMax = params.get('pMax');
  if (pMax && !isNaN(Number(pMax))) {
    defaults.participantMax = Number(pMax);
  }

  for (const [key, param] of LIST_PARAMS) {
    const raw = params.get(param);
    if (raw && raw.length > 0) {
      (defaults as any)[key] = raw.split(',').filter(Boolean);
    }
  }

  const bMin = params.get('bMin');
  if (bMin && !isNaN(Number(bMin))) {
    defaults.buyinMin = Number(bMin);
  }

  const bMax = params.get('bMax');
  if (bMax && !isNaN(Number(bMax))) {
    defaults.buyinMax = Number(bMax);
  }

  return defaults;
}
