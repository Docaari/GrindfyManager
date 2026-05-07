/**
 * BibliotecaQuickFilters — Sprint coach-page-reform-1 RF-05.
 * Spec: Docs/specs/sprint-coach-page-reform-1.md §RF-05.
 * UX audit: Docs/ux-audit-2026-05-07/biblioteca-quick-filters.md.
 *
 * Chips multi-select de plataforma (ordem por popularidade do user) +
 * chips dia da semana (Seg-Dom + atalho "Hoje" amber).
 */

import { useMemo } from 'react';
import { usePlatformsByPopularity } from '@/hooks/usePlatformsByPopularity';

export interface BibliotecaQuickFiltersProps {
  /** Override da ordem de plataformas (default: hook usePlatformsByPopularity). */
  platforms?: string[];
  /** Sites selecionados (controlado). */
  filterSites: string[];
  /** Dias da semana selecionados (0=Domingo .. 6=Sabado). */
  filterDaysOfWeek: number[];
  /** Callback ao toggle plataforma. */
  onFilterSitesChange: (sites: string[]) => void;
  /** Callback ao toggle dia. */
  onFilterDaysOfWeekChange: (days: number[]) => void;
  /** Override do dia atual (default: new Date().getDay()). Util para testes. */
  todayDow?: number;
}

/** Slug usado no testId. Ex: "888poker" -> "888poker"; "PokerStars" -> "pokerstars". */
function siteSlug(site: string): string {
  return site.toLowerCase().replace(/\s+/g, '-');
}

const CHIP_BASE = 'rounded-full border px-3 py-1 text-xs transition-colors';

const CHIP_TONES = {
  emerald: {
    on: 'border-emerald-500 bg-emerald-500/20 font-medium text-emerald-200',
    off: 'border-gray-700 bg-gray-800 text-gray-300 hover:border-emerald-500/60 hover:text-emerald-200',
  },
  blue: {
    on: 'border-blue-500 bg-blue-500/20 font-medium text-blue-200',
    off: 'border-gray-700 bg-gray-800 text-gray-300 hover:border-blue-500/60 hover:text-blue-200',
  },
} as const;

interface FilterChipProps {
  testId: string;
  label: string;
  selected: boolean;
  tone: keyof typeof CHIP_TONES;
  onClick: () => void;
}

function FilterChip({ testId, label, selected, tone, onClick }: FilterChipProps): JSX.Element {
  const palette = CHIP_TONES[tone];
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onClick}
      className={`${CHIP_BASE} ${selected ? palette.on : palette.off}`}
    >
      {label}
    </button>
  );
}

/** Ordem PT-BR Seg-Dom: 1, 2, 3, 4, 5, 6, 0. */
const DAY_ORDER: { dow: number; label: string }[] = [
  { dow: 1, label: 'Seg' },
  { dow: 2, label: 'Ter' },
  { dow: 3, label: 'Qua' },
  { dow: 4, label: 'Qui' },
  { dow: 5, label: 'Sex' },
  { dow: 6, label: 'Sab' },
  { dow: 0, label: 'Dom' },
];

export function BibliotecaQuickFilters(props: BibliotecaQuickFiltersProps): JSX.Element {
  const {
    platforms,
    filterSites,
    filterDaysOfWeek,
    onFilterSitesChange,
    onFilterDaysOfWeekChange,
    todayDow,
  } = props;

  // Hook hidrata ordem default. Sempre chamamos (lesson #1).
  const { sites: hookSites } = usePlatformsByPopularity();

  // Override quando prop platforms vem com array nao-vazio.
  const effectivePlatforms = useMemo(
    () => (Array.isArray(platforms) && platforms.length > 0 ? platforms : hookSites),
    [platforms, hookSites]
  );

  const resolvedTodayDow =
    typeof todayDow === 'number' && todayDow >= 0 && todayDow <= 6
      ? todayDow
      : new Date().getDay();

  const togglePlatform = (site: string) => {
    if (filterSites.includes(site)) {
      onFilterSitesChange(filterSites.filter((s) => s !== site));
    } else {
      onFilterSitesChange([...filterSites, site]);
    }
  };

  const toggleDay = (dow: number) => {
    if (filterDaysOfWeek.includes(dow)) {
      onFilterDaysOfWeekChange(filterDaysOfWeek.filter((d) => d !== dow));
    } else {
      onFilterDaysOfWeekChange([...filterDaysOfWeek, dow]);
    }
  };

  const clickToday = () => {
    onFilterDaysOfWeekChange([resolvedTodayDow]);
  };

  return (
    <div className="space-y-2">
      {/* Plataformas */}
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
            tone="emerald"
            onClick={() => togglePlatform(site)}
          />
        ))}
      </div>

      {/* Dias da semana */}
      <div
        data-testid="biblioteca-quick-filters-days"
        role="group"
        aria-label="Filtrar por dia da semana"
        className="flex flex-wrap items-center gap-1.5"
      >
        <button
          type="button"
          data-testid="biblioteca-quick-filter-day-today"
          aria-pressed={
            filterDaysOfWeek.length === 1 && filterDaysOfWeek[0] === resolvedTodayDow
          }
          onClick={clickToday}
          className="rounded-full border-2 border-amber-500 bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/30"
        >
          Hoje
        </button>
        {DAY_ORDER.map(({ dow, label }) => (
          <FilterChip
            key={dow}
            testId={`biblioteca-quick-filter-day-${dow}`}
            label={label}
            selected={filterDaysOfWeek.includes(dow)}
            tone="blue"
            onClick={() => toggleDay(dow)}
          />
        ))}
      </div>
    </div>
  );
}

export default BibliotecaQuickFilters;
