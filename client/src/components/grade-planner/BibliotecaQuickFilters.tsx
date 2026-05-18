/**
 * BibliotecaQuickFilters — chips multi-select de plataforma.
 * Render acima dos filtros avancados em `BibliotecaPanel`.
 */

import { useMemo } from 'react';
import { usePlatformsByPopularity } from '@/hooks/usePlatformsByPopularity';

export interface BibliotecaQuickFiltersProps {
  /** Override da ordem de plataformas (default: hook usePlatformsByPopularity). */
  platforms?: string[];
  /** Sites selecionados (controlado). */
  filterSites: string[];
  /** Callback ao toggle plataforma. */
  onFilterSitesChange: (sites: string[]) => void;
}

/** Slug usado no testId. Ex: "888poker" -> "888poker"; "PokerStars" -> "pokerstars". */
function siteSlug(site: string): string {
  return site.toLowerCase().replace(/\s+/g, '-');
}

const CHIP_BASE = 'rounded-full border px-3 py-1 text-xs transition-colors';

const CHIP_ON =
  'border-emerald-500 bg-emerald-500/20 font-medium text-emerald-200';
const CHIP_OFF =
  'border-gray-700 bg-gray-800 text-gray-300 hover:border-emerald-500/60 hover:text-emerald-200';

interface FilterChipProps {
  testId: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}

function FilterChip({ testId, label, selected, onClick }: FilterChipProps): JSX.Element {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onClick}
      className={`${CHIP_BASE} ${selected ? CHIP_ON : CHIP_OFF}`}
    >
      {label}
    </button>
  );
}

export function BibliotecaQuickFilters(props: BibliotecaQuickFiltersProps): JSX.Element {
  const { platforms, filterSites, onFilterSitesChange } = props;

  // Hook hidrata ordem default. Sempre chamamos (lesson #1).
  const { sites: hookSites } = usePlatformsByPopularity();

  // Override quando prop platforms vem com array nao-vazio.
  const effectivePlatforms = useMemo(
    () => (Array.isArray(platforms) && platforms.length > 0 ? platforms : hookSites),
    [platforms, hookSites]
  );

  const togglePlatform = (site: string) => {
    if (filterSites.includes(site)) {
      onFilterSitesChange(filterSites.filter((s) => s !== site));
    } else {
      onFilterSitesChange([...filterSites, site]);
    }
  };

  return (
    <div
      data-testid="biblioteca-quick-filters-platforms"
      role="group"
      aria-label="Filtrar por plataforma"
      className="flex flex-wrap items-center gap-1.5 overflow-x-auto"
    >
      {effectivePlatforms.map((site) => (
        <FilterChip
          key={site}
          testId={`biblioteca-quick-filter-platform-${siteSlug(site)}`}
          label={site}
          selected={filterSites.includes(site)}
          onClick={() => togglePlatform(site)}
        />
      ))}
    </div>
  );
}

export default BibliotecaQuickFilters;
