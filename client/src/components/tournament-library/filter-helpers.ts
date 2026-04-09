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

type EmptyStateType = 'no-data' | 'no-results-with-filters';

export function getDefaultFilters(): TournamentLibraryFilters {
  return {
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
}

export function hasActiveFilters(
  filters: TournamentLibraryFilters,
  searchTerm: string,
): boolean {
  if (searchTerm.length > 0) return true;
  if (filters.period !== 'all') return true;
  if (filters.sites.length > 0) return true;
  if (filters.categories.length > 0) return true;
  if (filters.speeds.length > 0) return true;
  if (filters.buyinRange.min !== null) return true;
  if (filters.buyinRange.max !== null) return true;
  if (filters.roiFilter !== 'all') return true;
  if (filters.profitFilter !== 'all') return true;
  if (filters.volumeFilter !== 'all') return true;
  if (filters.minimumVolume !== null) return true;
  return false;
}

export function getEmptyStateType(
  resultCount: number,
  filters: TournamentLibraryFilters,
  searchTerm: string,
): EmptyStateType | null {
  if (resultCount > 0) return null;
  if (hasActiveFilters(filters, searchTerm)) return 'no-results-with-filters';
  return 'no-data';
}
