// Characterization test — logic copied from TournamentLibraryNew.tsx
//
// These tests document the CURRENT behavior of pure functions and filtering
// logic used in the Tournament Library page. They serve as a safety net
// against regressions when modifying the page.
//
// CHARACTERIZATION MODE: All tests MUST pass with the existing code.

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Types (copied from TournamentLibraryNew.tsx)
// ---------------------------------------------------------------------------

interface TournamentGroup {
  id: string;
  groupName: string;
  site: string;
  category: string;
  speed: string;
  format: string;
  volume: number;
  totalProfit: number;
  avgProfit: number;
  roi: number;
  avgBuyin: number;
  finalTables: number;
  finalTableRate: number;
  bigHits: number;
  bigHitRate: number;
  itm: number;
  itmRate: number;
  avgFieldSize: number;
  totalReentries: number;
  bestResult: number;
  worstResult: number;
  tournaments: any[];
}

type TournamentLibraryFiltersType = {
  period: string;
  sites: string[];
  categories: string[];
  speeds: string[];
  buyinRange: { min: number | null; max: number | null };
  roiFilter: string;
  profitFilter: string;
  volumeFilter: string;
  minimumVolume: number | null;
};

// ---------------------------------------------------------------------------
// Functions under test (copied verbatim from TournamentLibraryNew.tsx)
// ---------------------------------------------------------------------------

const calculateICD = (avgProfit: number, volume: number): number => {
  return avgProfit * (1 - Math.exp(-0.1 * volume));
};

const getSortValue = (group: TournamentGroup, sortField: string) => {
  switch (sortField) {
    case 'icd': return calculateICD(group.avgProfit, group.volume);
    case 'avgProfit': return group.avgProfit;
    case 'roi': return group.roi;
    case 'volume': return group.volume;
    case 'totalProfit': return group.totalProfit;
    case 'finalTableRate': return group.finalTableRate;
    case 'itmRate': return group.itmRate;
    default: return 0;
  }
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
};

const formatPercentage = (value: number) => {
  return `${value.toFixed(1)}%`;
};

const getSiteColor = (site: string) => {
  const colors: Record<string, string> = {
    'PokerStars': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    'GGNetwork': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    'WPN': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    'Bodog': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    '888poker': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    'PartyPoker': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
    'Coin': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  };
  return colors[site] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
};

const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    'Mystery': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    'PKO': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    'Bounty': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    'Vanilla': 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
  };
  return colors[category] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
};

const getSpeedColor = (speed: string) => {
  const colors: Record<string, string> = {
    'Hyper': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    'Turbo': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    'Normal': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  };
  return colors[speed] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
};

// ---------------------------------------------------------------------------
// Filtering + sorting logic (reproduced from TournamentLibraryNew.tsx lines 136-184)
// ---------------------------------------------------------------------------

function filterAndSortGroups(
  allGroups: TournamentGroup[],
  searchTerm: string,
  filters: TournamentLibraryFiltersType,
  sortBy: string,
  sortOrder: string,
): TournamentGroup[] {
  return allGroups
    .filter((group) => {
      const matchesSearch = group.groupName.toLowerCase().includes(searchTerm.toLowerCase());

      let matchesBuyinRange = true;
      if (filters.buyinRange.min !== null || filters.buyinRange.max !== null) {
        const min = filters.buyinRange.min || 0;
        const max = filters.buyinRange.max || Infinity;
        matchesBuyinRange = group.avgBuyin >= min && group.avgBuyin <= max;
      }

      const matchesRoi =
        filters.roiFilter === 'all' ||
        (filters.roiFilter === 'positive' && group.roi > 0) ||
        (filters.roiFilter === 'negative' && group.roi < 0) ||
        (filters.roiFilter === 'high' && group.roi > 20) ||
        (filters.roiFilter === 'medium' && group.roi >= 0 && group.roi <= 20);

      let matchesProfit = true;
      if (filters.profitFilter === 'higher' || filters.profitFilter === 'lower') {
        const avgProfit = allGroups.reduce((sum, g) => sum + g.avgProfit, 0) / allGroups.length;
        if (filters.profitFilter === 'higher') {
          matchesProfit = group.avgProfit > avgProfit;
        } else if (filters.profitFilter === 'lower') {
          matchesProfit = group.avgProfit < avgProfit;
        }
      }

      let matchesVolume = true;
      if (filters.volumeFilter === 'higher') {
        const avgVolume = allGroups.reduce((sum, g) => sum + g.volume, 0) / allGroups.length;
        matchesVolume = group.volume > avgVolume;
      } else if (filters.volumeFilter === 'minimum' && filters.minimumVolume !== null) {
        matchesVolume = group.volume >= filters.minimumVolume;
      }

      return matchesSearch && matchesBuyinRange && matchesRoi && matchesProfit && matchesVolume;
    })
    .sort((a, b) => {
      const aValue = getSortValue(a, sortBy);
      const bValue = getSortValue(b, sortBy);
      return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
    });
}

// ---------------------------------------------------------------------------
// KPI calculations (reproduced from TournamentLibraryNew.tsx lines 236-242)
// ---------------------------------------------------------------------------

function computeKPIs(filteredGroups: TournamentGroup[]) {
  const bestICD =
    filteredGroups.length > 0
      ? Math.max(...filteredGroups.map((g) => calculateICD(g.avgProfit, g.volume)))
      : 0;
  const worstICD =
    filteredGroups.length > 0
      ? Math.min(...filteredGroups.map((g) => calculateICD(g.avgProfit, g.volume)))
      : 0;
  const bestICDGroup = filteredGroups.find(
    (g) => calculateICD(g.avgProfit, g.volume) === bestICD,
  );
  const worstICDGroup = filteredGroups.find(
    (g) => calculateICD(g.avgProfit, g.volume) === worstICD,
  );
  const selectionProfit = filteredGroups.reduce((sum, g) => sum + g.totalProfit, 0);
  const filteredTournaments = filteredGroups.reduce((sum, g) => sum + g.volume, 0);

  return { bestICD, worstICD, bestICDGroup, worstICDGroup, selectionProfit, filteredTournaments };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: TournamentLibraryFiltersType = {
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

function makeGroup(overrides: Partial<TournamentGroup> = {}): TournamentGroup {
  return {
    id: '1',
    groupName: 'Test Tournament',
    site: 'PokerStars',
    category: 'Vanilla',
    speed: 'Normal',
    format: 'NLH',
    volume: 100,
    totalProfit: 500,
    avgProfit: 5,
    roi: 10,
    avgBuyin: 50,
    finalTables: 10,
    finalTableRate: 10,
    bigHits: 2,
    bigHitRate: 2,
    itm: 20,
    itmRate: 20,
    avgFieldSize: 200,
    totalReentries: 5,
    bestResult: 1000,
    worstResult: -50,
    tournaments: [],
    ...overrides,
  };
}

// ===========================================================================
// TESTS
// ===========================================================================

// ---------------------------------------------------------------------------
// calculateICD
// ---------------------------------------------------------------------------

describe('calculateICD', () => {
  it('deve retornar valor positivo para avgProfit positivo e volume > 0', () => {
    const result = calculateICD(10, 50);
    expect(result).toBeGreaterThan(0);
    // 10 * (1 - exp(-5)) ~ 10 * (1 - 0.00674) ~ 9.93
    expect(result).toBeCloseTo(9.933, 2);
  });

  it('deve retornar valor negativo para avgProfit negativo e volume > 0', () => {
    const result = calculateICD(-10, 50);
    expect(result).toBeLessThan(0);
    expect(result).toBeCloseTo(-9.933, 2);
  });

  it('deve retornar 0 quando volume e 0', () => {
    // avgProfit * (1 - exp(0)) = avgProfit * (1 - 1) = avgProfit * 0
    expect(calculateICD(100, 0)).toBe(0);
    // Note: -50 * 0 = -0 in JavaScript (IEEE 754)
    expect(calculateICD(-50, 0)).toBe(-0);
    expect(calculateICD(0, 0)).toBe(0);
  });

  it('deve retornar 0 quando avgProfit e 0', () => {
    expect(calculateICD(0, 100)).toBe(0);
  });

  it('deve convergir para avgProfit quando volume e muito grande', () => {
    // exp(-0.1 * 1000) ~ 0, so ICD ~ avgProfit * 1 = avgProfit
    const result = calculateICD(25, 1000);
    expect(result).toBeCloseTo(25, 5);
  });

  it('deve ser aproximadamente avgProfit * 0.095 para volume = 1', () => {
    // 1 - exp(-0.1) ~ 0.09516
    const result = calculateICD(100, 1);
    expect(result).toBeCloseTo(100 * (1 - Math.exp(-0.1)), 5);
  });

  it('deve lidar com volume negativo (caso inesperado)', () => {
    // exp(-0.1 * -10) = exp(1) ~ 2.718, so ICD = 5 * (1 - 2.718) = 5 * -1.718 ~ -8.59
    const result = calculateICD(5, -10);
    expect(result).toBeCloseTo(5 * (1 - Math.exp(1)), 2);
  });

  it('deve lidar com valores muito pequenos de volume', () => {
    const result = calculateICD(10, 0.001);
    // 10 * (1 - exp(-0.0001)) ~ 10 * 0.0001 ~ 0.001
    expect(result).toBeCloseTo(0.001, 3);
  });
});

// ---------------------------------------------------------------------------
// getSortValue
// ---------------------------------------------------------------------------

describe('getSortValue', () => {
  const group = makeGroup({
    avgProfit: 10,
    volume: 50,
    roi: 15,
    totalProfit: 500,
    finalTableRate: 12,
    itmRate: 25,
  });

  it('deve retornar ICD calculado para sortField "icd"', () => {
    expect(getSortValue(group, 'icd')).toBeCloseTo(calculateICD(10, 50), 5);
  });

  it('deve retornar avgProfit para sortField "avgProfit"', () => {
    expect(getSortValue(group, 'avgProfit')).toBe(10);
  });

  it('deve retornar roi para sortField "roi"', () => {
    expect(getSortValue(group, 'roi')).toBe(15);
  });

  it('deve retornar volume para sortField "volume"', () => {
    expect(getSortValue(group, 'volume')).toBe(50);
  });

  it('deve retornar totalProfit para sortField "totalProfit"', () => {
    expect(getSortValue(group, 'totalProfit')).toBe(500);
  });

  it('deve retornar finalTableRate para sortField "finalTableRate"', () => {
    expect(getSortValue(group, 'finalTableRate')).toBe(12);
  });

  it('deve retornar itmRate para sortField "itmRate"', () => {
    expect(getSortValue(group, 'itmRate')).toBe(25);
  });

  it('deve retornar 0 para sortField desconhecido', () => {
    expect(getSortValue(group, 'unknown')).toBe(0);
    expect(getSortValue(group, '')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------

describe('formatCurrency', () => {
  it('deve formatar valor positivo com simbolo USD no formato pt-BR', () => {
    const result = formatCurrency(1234.56);
    // pt-BR + USD => "US$ 1.234,56" (Intl may vary, check contains key parts)
    expect(result).toContain('1.234');
    expect(result).toContain('56');
  });

  it('deve formatar valor negativo', () => {
    const result = formatCurrency(-500);
    expect(result).toContain('500');
    // Must indicate negative somehow
    expect(result).toMatch(/-/);
  });

  it('deve formatar zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });

  it('deve formatar valores decimais', () => {
    const result = formatCurrency(0.99);
    expect(result).toContain('0,99');
  });

  it('deve formatar valor grande', () => {
    const result = formatCurrency(1000000);
    expect(result).toContain('1.000.000');
  });
});

// ---------------------------------------------------------------------------
// formatPercentage
// ---------------------------------------------------------------------------

describe('formatPercentage', () => {
  it('deve formatar porcentagem com 1 casa decimal', () => {
    expect(formatPercentage(12.34)).toBe('12.3%');
  });

  it('deve formatar zero', () => {
    expect(formatPercentage(0)).toBe('0.0%');
  });

  it('deve formatar porcentagem negativa', () => {
    expect(formatPercentage(-5.67)).toBe('-5.7%');
  });

  it('deve arredondar corretamente', () => {
    expect(formatPercentage(10.05)).toBe('10.1%');
    expect(formatPercentage(10.04)).toBe('10.0%');
  });

  it('deve formatar porcentagem inteira com .0', () => {
    expect(formatPercentage(50)).toBe('50.0%');
  });

  it('deve formatar valor muito grande', () => {
    expect(formatPercentage(999.99)).toBe('1000.0%');
  });
});

// ---------------------------------------------------------------------------
// getSiteColor
// ---------------------------------------------------------------------------

describe('getSiteColor', () => {
  it('deve retornar cor vermelha para PokerStars', () => {
    expect(getSiteColor('PokerStars')).toContain('bg-red-100');
  });

  it('deve retornar cor azul para GGNetwork', () => {
    expect(getSiteColor('GGNetwork')).toContain('bg-blue-100');
  });

  it('deve retornar cor verde para WPN', () => {
    expect(getSiteColor('WPN')).toContain('bg-green-100');
  });

  it('deve retornar cor roxa para Bodog', () => {
    expect(getSiteColor('Bodog')).toContain('bg-purple-100');
  });

  it('deve retornar cor laranja para 888poker', () => {
    expect(getSiteColor('888poker')).toContain('bg-orange-100');
  });

  it('deve retornar cor rosa para PartyPoker', () => {
    expect(getSiteColor('PartyPoker')).toContain('bg-pink-100');
  });

  it('deve retornar cor amarela para Coin', () => {
    expect(getSiteColor('Coin')).toContain('bg-yellow-100');
  });

  it('deve retornar cinza para site desconhecido', () => {
    expect(getSiteColor('UnknownSite')).toContain('bg-gray-100');
  });

  it('deve retornar cinza para string vazia', () => {
    expect(getSiteColor('')).toContain('bg-gray-100');
  });
});

// ---------------------------------------------------------------------------
// getCategoryColor
// ---------------------------------------------------------------------------

describe('getCategoryColor', () => {
  it('deve retornar cor indigo para Mystery', () => {
    expect(getCategoryColor('Mystery')).toContain('bg-indigo-100');
  });

  it('deve retornar cor emerald para PKO', () => {
    expect(getCategoryColor('PKO')).toContain('bg-emerald-100');
  });

  it('deve retornar mesma cor emerald para Bounty (igual a PKO)', () => {
    expect(getCategoryColor('Bounty')).toContain('bg-emerald-100');
    expect(getCategoryColor('Bounty')).toBe(getCategoryColor('PKO'));
  });

  it('deve retornar cor slate para Vanilla', () => {
    expect(getCategoryColor('Vanilla')).toContain('bg-slate-100');
  });

  it('deve retornar cinza para categoria desconhecida', () => {
    expect(getCategoryColor('Unknown')).toContain('bg-gray-100');
  });
});

// ---------------------------------------------------------------------------
// getSpeedColor
// ---------------------------------------------------------------------------

describe('getSpeedColor', () => {
  it('deve retornar cor vermelha para Hyper', () => {
    expect(getSpeedColor('Hyper')).toContain('bg-red-100');
  });

  it('deve retornar cor amber para Turbo', () => {
    expect(getSpeedColor('Turbo')).toContain('bg-amber-100');
  });

  it('deve retornar cor azul para Normal', () => {
    expect(getSpeedColor('Normal')).toContain('bg-blue-100');
  });

  it('deve retornar cinza para velocidade desconhecida', () => {
    expect(getSpeedColor('Slow')).toContain('bg-gray-100');
  });

  it('deve retornar cinza para string vazia', () => {
    expect(getSpeedColor('')).toContain('bg-gray-100');
  });
});

// ---------------------------------------------------------------------------
// filterAndSortGroups — Search
// ---------------------------------------------------------------------------

describe('filterAndSortGroups — Search', () => {
  const groups = [
    makeGroup({ id: '1', groupName: 'Sunday Million' }),
    makeGroup({ id: '2', groupName: 'Daily Deepstack' }),
    makeGroup({ id: '3', groupName: 'Sunday Warm-Up' }),
  ];

  it('deve retornar todos os grupos quando searchTerm e vazio', () => {
    const result = filterAndSortGroups(groups, '', DEFAULT_FILTERS, 'icd', 'desc');
    expect(result).toHaveLength(3);
  });

  it('deve filtrar por nome case-insensitive', () => {
    const result = filterAndSortGroups(groups, 'sunday', DEFAULT_FILTERS, 'icd', 'desc');
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.id)).toContain('1');
    expect(result.map((g) => g.id)).toContain('3');
  });

  it('deve filtrar por substring parcial', () => {
    const result = filterAndSortGroups(groups, 'Deep', DEFAULT_FILTERS, 'icd', 'desc');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('deve retornar vazio quando nenhum grupo corresponde', () => {
    const result = filterAndSortGroups(groups, 'nonexistent', DEFAULT_FILTERS, 'icd', 'desc');
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// filterAndSortGroups — Buy-in range
// ---------------------------------------------------------------------------

describe('filterAndSortGroups — Buy-in range', () => {
  const groups = [
    makeGroup({ id: '1', avgBuyin: 10 }),
    makeGroup({ id: '2', avgBuyin: 50 }),
    makeGroup({ id: '3', avgBuyin: 100 }),
    makeGroup({ id: '4', avgBuyin: 200 }),
  ];

  it('deve filtrar com min apenas', () => {
    const filters = { ...DEFAULT_FILTERS, buyinRange: { min: 50, max: null } };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    // min=50, max=null => max defaults to Infinity
    expect(result).toHaveLength(3);
    expect(result.map((g) => g.id)).toEqual(expect.arrayContaining(['2', '3', '4']));
  });

  it('deve filtrar com max apenas', () => {
    const filters = { ...DEFAULT_FILTERS, buyinRange: { min: null, max: 100 } };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    // min=null => min defaults to 0
    expect(result).toHaveLength(3);
    expect(result.map((g) => g.id)).toEqual(expect.arrayContaining(['1', '2', '3']));
  });

  it('deve filtrar com min e max', () => {
    const filters = { ...DEFAULT_FILTERS, buyinRange: { min: 50, max: 100 } };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.id)).toEqual(expect.arrayContaining(['2', '3']));
  });

  it('deve retornar todos quando min e max sao null', () => {
    const filters = { ...DEFAULT_FILTERS, buyinRange: { min: null, max: null } };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    expect(result).toHaveLength(4);
  });

  it('deve tratar min=0 como sem filtro minimo efetivo (0 || 0 = 0)', () => {
    // Note: the code uses `filters.buyinRange.min || 0` — so min=0 is falsy, defaults to 0
    // But the outer check `min !== null` is true, so the filter IS applied with min=0
    const filters = { ...DEFAULT_FILTERS, buyinRange: { min: 0, max: 100 } };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    expect(result).toHaveLength(3); // 10, 50, 100
  });
});

// ---------------------------------------------------------------------------
// filterAndSortGroups — ROI filter
// ---------------------------------------------------------------------------

describe('filterAndSortGroups — ROI filter', () => {
  const groups = [
    makeGroup({ id: '1', roi: 25 }),    // high, positive
    makeGroup({ id: '2', roi: 10 }),    // medium, positive
    makeGroup({ id: '3', roi: 0 }),     // medium (0-20 inclusive), edge
    makeGroup({ id: '4', roi: -5 }),    // negative
    makeGroup({ id: '5', roi: 20 }),    // medium (exactly 20), NOT high (>20)
  ];

  it('deve retornar todos com roiFilter "all"', () => {
    const filters = { ...DEFAULT_FILTERS, roiFilter: 'all' };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    expect(result).toHaveLength(5);
  });

  it('deve filtrar apenas ROI positivo (> 0)', () => {
    const filters = { ...DEFAULT_FILTERS, roiFilter: 'positive' };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    expect(result.map((g) => g.id)).toEqual(expect.arrayContaining(['1', '2', '5']));
    expect(result).toHaveLength(3);
  });

  it('deve filtrar apenas ROI negativo (< 0)', () => {
    const filters = { ...DEFAULT_FILTERS, roiFilter: 'negative' };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('4');
  });

  it('deve filtrar ROI alto (> 20)', () => {
    const filters = { ...DEFAULT_FILTERS, roiFilter: 'high' };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('deve filtrar ROI medio (>= 0 e <= 20)', () => {
    const filters = { ...DEFAULT_FILTERS, roiFilter: 'medium' };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    expect(result).toHaveLength(3); // roi: 10, 0, 20
    expect(result.map((g) => g.id)).toEqual(expect.arrayContaining(['2', '3', '5']));
  });

  it('deve excluir ROI = 0 do filtro "positive"', () => {
    const filters = { ...DEFAULT_FILTERS, roiFilter: 'positive' };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    expect(result.map((g) => g.id)).not.toContain('3');
  });

  it('deve excluir ROI = 0 do filtro "negative"', () => {
    const filters = { ...DEFAULT_FILTERS, roiFilter: 'negative' };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    expect(result.map((g) => g.id)).not.toContain('3');
  });
});

// ---------------------------------------------------------------------------
// filterAndSortGroups — Profit filter
// ---------------------------------------------------------------------------

describe('filterAndSortGroups — Profit filter', () => {
  const groups = [
    makeGroup({ id: '1', avgProfit: 10 }),
    makeGroup({ id: '2', avgProfit: 20 }),
    makeGroup({ id: '3', avgProfit: 30 }),
  ];
  // avgProfit average = (10+20+30)/3 = 20

  it('deve retornar todos com profitFilter "all"', () => {
    const filters = { ...DEFAULT_FILTERS, profitFilter: 'all' };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    expect(result).toHaveLength(3);
  });

  it('deve filtrar grupos com avgProfit acima da media', () => {
    const filters = { ...DEFAULT_FILTERS, profitFilter: 'higher' };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    // avg = 20, only group with avgProfit > 20 is id=3 (avgProfit=30)
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('deve filtrar grupos com avgProfit abaixo da media', () => {
    const filters = { ...DEFAULT_FILTERS, profitFilter: 'lower' };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    // avg = 20, only group with avgProfit < 20 is id=1 (avgProfit=10)
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('deve excluir grupo com avgProfit exatamente na media', () => {
    const filters = { ...DEFAULT_FILTERS, profitFilter: 'higher' };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    expect(result.map((g) => g.id)).not.toContain('2');

    const result2 = filterAndSortGroups(groups, '', { ...DEFAULT_FILTERS, profitFilter: 'lower' }, 'icd', 'desc');
    expect(result2.map((g) => g.id)).not.toContain('2');
  });

  it('deve calcular media usando todos os grupos (nao apenas filtrados)', () => {
    // The profit filter uses allGroups to compute average, not just the filtered set
    // If search filters out some, the average is still from allGroups
    const allGroups = [
      makeGroup({ id: '1', groupName: 'A', avgProfit: 10 }),
      makeGroup({ id: '2', groupName: 'B', avgProfit: 20 }),
      makeGroup({ id: '3', groupName: 'B Special', avgProfit: 30 }),
    ];
    // Average of all = 20. Search "B" matches id=2,3. Among those, only id=3 has avgProfit > 20
    const filters = { ...DEFAULT_FILTERS, profitFilter: 'higher' };
    const result = filterAndSortGroups(allGroups, 'B', filters, 'icd', 'desc');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });
});

// ---------------------------------------------------------------------------
// filterAndSortGroups — Volume filter
// ---------------------------------------------------------------------------

describe('filterAndSortGroups — Volume filter', () => {
  const groups = [
    makeGroup({ id: '1', volume: 10 }),
    makeGroup({ id: '2', volume: 50 }),
    makeGroup({ id: '3', volume: 100 }),
  ];
  // avgVolume = (10+50+100)/3 = ~53.33

  it('deve retornar todos com volumeFilter "all"', () => {
    const filters = { ...DEFAULT_FILTERS, volumeFilter: 'all' };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    expect(result).toHaveLength(3);
  });

  it('deve filtrar grupos com volume acima da media', () => {
    const filters = { ...DEFAULT_FILTERS, volumeFilter: 'higher' };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    // avg ~ 53.33, only group with volume > 53.33 is id=3
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('deve filtrar com volume minimo', () => {
    const filters = { ...DEFAULT_FILTERS, volumeFilter: 'minimum', minimumVolume: 50 };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.id)).toEqual(expect.arrayContaining(['2', '3']));
  });

  it('deve ignorar minimumVolume quando volumeFilter nao e "minimum"', () => {
    const filters = { ...DEFAULT_FILTERS, volumeFilter: 'all', minimumVolume: 200 };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    expect(result).toHaveLength(3);
  });

  it('deve ignorar minimumVolume null quando volumeFilter e "minimum"', () => {
    const filters = { ...DEFAULT_FILTERS, volumeFilter: 'minimum', minimumVolume: null };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    // minimumVolume is null, so the condition `filters.minimumVolume !== null` is false
    // Falls through to matchesVolume = true (default)
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// filterAndSortGroups — Sorting
// ---------------------------------------------------------------------------

describe('filterAndSortGroups — Sorting', () => {
  const groups = [
    makeGroup({ id: '1', avgProfit: 5, volume: 10, roi: 30 }),
    makeGroup({ id: '2', avgProfit: 15, volume: 50, roi: 10 }),
    makeGroup({ id: '3', avgProfit: 10, volume: 100, roi: 20 }),
  ];

  it('deve ordenar por ICD descendente (padrao)', () => {
    const result = filterAndSortGroups(groups, '', DEFAULT_FILTERS, 'icd', 'desc');
    const icds = result.map((g) => calculateICD(g.avgProfit, g.volume));
    for (let i = 1; i < icds.length; i++) {
      expect(icds[i - 1]).toBeGreaterThanOrEqual(icds[i]);
    }
  });

  it('deve ordenar por ICD ascendente', () => {
    const result = filterAndSortGroups(groups, '', DEFAULT_FILTERS, 'icd', 'asc');
    const icds = result.map((g) => calculateICD(g.avgProfit, g.volume));
    for (let i = 1; i < icds.length; i++) {
      expect(icds[i - 1]).toBeLessThanOrEqual(icds[i]);
    }
  });

  it('deve ordenar por ROI descendente', () => {
    const result = filterAndSortGroups(groups, '', DEFAULT_FILTERS, 'roi', 'desc');
    expect(result.map((g) => g.id)).toEqual(['1', '3', '2']);
  });

  it('deve ordenar por ROI ascendente', () => {
    const result = filterAndSortGroups(groups, '', DEFAULT_FILTERS, 'roi', 'asc');
    expect(result.map((g) => g.id)).toEqual(['2', '3', '1']);
  });

  it('deve ordenar por volume descendente', () => {
    const result = filterAndSortGroups(groups, '', DEFAULT_FILTERS, 'volume', 'desc');
    expect(result.map((g) => g.id)).toEqual(['3', '2', '1']);
  });

  it('deve ordenar por avgProfit descendente', () => {
    const result = filterAndSortGroups(groups, '', DEFAULT_FILTERS, 'avgProfit', 'desc');
    expect(result.map((g) => g.id)).toEqual(['2', '3', '1']);
  });
});

// ---------------------------------------------------------------------------
// filterAndSortGroups — Combined filters
// ---------------------------------------------------------------------------

describe('filterAndSortGroups — Combined filters', () => {
  const groups = [
    makeGroup({ id: '1', groupName: 'Sunday Million', avgBuyin: 50, roi: 25, avgProfit: 30, volume: 100 }),
    makeGroup({ id: '2', groupName: 'Daily Grind', avgBuyin: 10, roi: 5, avgProfit: 5, volume: 200 }),
    makeGroup({ id: '3', groupName: 'Sunday Warm-Up', avgBuyin: 100, roi: -10, avgProfit: -15, volume: 50 }),
    makeGroup({ id: '4', groupName: 'Nightly Turbo', avgBuyin: 20, roi: 15, avgProfit: 10, volume: 80 }),
  ];

  it('deve aplicar busca + ROI filter juntos', () => {
    const filters = { ...DEFAULT_FILTERS, roiFilter: 'positive' };
    const result = filterAndSortGroups(groups, 'Sunday', filters, 'icd', 'desc');
    // "Sunday" matches id=1,3. positive roi matches id=1,2,4. Intersection: id=1
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('deve aplicar buyinRange + volume filter juntos', () => {
    const filters = {
      ...DEFAULT_FILTERS,
      buyinRange: { min: 10, max: 50 },
      volumeFilter: 'minimum' as string,
      minimumVolume: 100,
    };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    // buyinRange 10-50: id=1(50),2(10),4(20). Volume >= 100: id=1(100),2(200)
    // Intersection: id=1, id=2
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.id)).toEqual(expect.arrayContaining(['1', '2']));
  });
});

// ---------------------------------------------------------------------------
// filterAndSortGroups — Empty array
// ---------------------------------------------------------------------------

describe('filterAndSortGroups — Edge cases', () => {
  it('deve retornar array vazio para input vazio', () => {
    const result = filterAndSortGroups([], '', DEFAULT_FILTERS, 'icd', 'desc');
    expect(result).toEqual([]);
  });

  it('deve retornar array vazio quando filtros excluem tudo', () => {
    const groups = [makeGroup({ roi: -5 })];
    const filters = { ...DEFAULT_FILTERS, roiFilter: 'positive' };
    const result = filterAndSortGroups(groups, '', filters, 'icd', 'desc');
    expect(result).toEqual([]);
  });

  it('deve lidar com grupo unico', () => {
    const groups = [makeGroup({ id: '1' })];
    const result = filterAndSortGroups(groups, '', DEFAULT_FILTERS, 'icd', 'desc');
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// KPI calculations
// ---------------------------------------------------------------------------

describe('computeKPIs', () => {
  it('deve retornar zeros para array vazio', () => {
    const kpis = computeKPIs([]);
    expect(kpis.bestICD).toBe(0);
    expect(kpis.worstICD).toBe(0);
    expect(kpis.bestICDGroup).toBeUndefined();
    expect(kpis.worstICDGroup).toBeUndefined();
    expect(kpis.selectionProfit).toBe(0);
    expect(kpis.filteredTournaments).toBe(0);
  });

  it('deve calcular bestICD e worstICD corretamente', () => {
    const groups = [
      makeGroup({ id: '1', avgProfit: 20, volume: 100 }),  // ICD ~ 20
      makeGroup({ id: '2', avgProfit: -10, volume: 100 }), // ICD ~ -10
      makeGroup({ id: '3', avgProfit: 5, volume: 10 }),    // ICD ~ 3.16
    ];
    const kpis = computeKPIs(groups);

    expect(kpis.bestICD).toBeCloseTo(calculateICD(20, 100), 5);
    expect(kpis.worstICD).toBeCloseTo(calculateICD(-10, 100), 5);
    expect(kpis.bestICDGroup?.id).toBe('1');
    expect(kpis.worstICDGroup?.id).toBe('2');
  });

  it('deve somar totalProfit para selectionProfit', () => {
    const groups = [
      makeGroup({ totalProfit: 100 }),
      makeGroup({ totalProfit: -50 }),
      makeGroup({ totalProfit: 200 }),
    ];
    const kpis = computeKPIs(groups);
    expect(kpis.selectionProfit).toBe(250);
  });

  it('deve somar volume para filteredTournaments', () => {
    const groups = [
      makeGroup({ volume: 10 }),
      makeGroup({ volume: 50 }),
      makeGroup({ volume: 100 }),
    ];
    const kpis = computeKPIs(groups);
    expect(kpis.filteredTournaments).toBe(160);
  });

  it('deve retornar mesmo grupo para best e worst quando ha apenas 1 grupo', () => {
    const groups = [makeGroup({ id: '1', avgProfit: 10, volume: 50 })];
    const kpis = computeKPIs(groups);
    expect(kpis.bestICDGroup?.id).toBe('1');
    expect(kpis.worstICDGroup?.id).toBe('1');
    expect(kpis.bestICD).toBe(kpis.worstICD);
  });

  it('deve encontrar o grupo correto quando dois tem ICD proximo', () => {
    const groups = [
      makeGroup({ id: '1', avgProfit: 10, volume: 100 }), // ICD ~ 10
      makeGroup({ id: '2', avgProfit: 10, volume: 99 }),   // ICD ~ 9.995
    ];
    const kpis = computeKPIs(groups);
    expect(kpis.bestICDGroup?.id).toBe('1');
  });
});
