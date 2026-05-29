// =============================================================================
// Sprint day-detail-manage RF-03 — Filtro plataforma chips multi-select
//
// Renderizado entre os 4 cards KPI e os slots horarios no painel esquerdo de
// DayDetailZoom. Persistencia em localStorage por (profileLetter, dayOfWeek).
// Aplicacao downstream em plannedSlots. SSR-safe.
// =============================================================================

import * as React from "react";
import { Filter } from "lucide-react";
import { getSiteColors } from "@/components/grade/siteColors";

const STORAGE_PREFIX = "dayZoom.filter";

function storageKey(profile: string, day: number): string {
  return `${STORAGE_PREFIX}.${profile}.${day}.platforms`;
}

function loadFromStorage(profile: string, day: number): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(profile, day));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x: any): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function saveToStorage(profile: string, day: number, sites: string[]): void {
  if (typeof window === "undefined") return;
  try {
    if (sites.length === 0) {
      window.localStorage.removeItem(storageKey(profile, day));
    } else {
      window.localStorage.setItem(storageKey(profile, day), JSON.stringify(sites));
    }
  } catch {
    /* ignore quota / disabled */
  }
}

export interface DayPlannedFilterChipsProps {
  profileLetter: "A" | "B" | "C";
  dayOfWeek: number;
  /** Sites com count agregado (volume + list dedup). */
  availableSites: Array<{ site: string; count: number }>;
  selected: string[];
  onChange: (next: string[]) => void;
}

export function DayPlannedFilterChips(
  props: DayPlannedFilterChipsProps,
): React.ReactElement | null {
  const { availableSites, selected, onChange } = props;

  if (availableSites.length === 0) return null;

  const allActive = selected.length === 0;

  const toggleSite = React.useCallback(
    (site: string) => {
      if (selected.includes(site)) {
        onChange(selected.filter((s) => s !== site));
      } else {
        onChange([...selected, site]);
      }
    },
    [onChange, selected],
  );

  const clearAll = React.useCallback(() => onChange([]), [onChange]);

  return (
    <div
      data-testid="day-zoom-filter-chips"
      className="flex flex-wrap gap-1.5 items-center"
      role="group"
      aria-label="Filtrar torneios planejados por plataforma"
    >
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-500 mr-1">
        <Filter className="w-3 h-3" />
        Filtrar
      </span>
      <button
        type="button"
        data-testid="day-zoom-filter-chip-all"
        onClick={clearAll}
        aria-pressed={allActive ? "true" : "false"}
        className={
          "px-2.5 py-1 text-xs rounded-full border transition-all duration-150 " +
          (allActive
            ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200 shadow-sm shadow-emerald-900/30"
            : "bg-gray-800/80 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200")
        }
      >
        Todas
      </button>
      {availableSites.map(({ site, count }) => {
        const active = selected.includes(site);
        const colors = getSiteColors(site);
        return (
          <button
            key={site}
            type="button"
            data-testid={`day-zoom-filter-chip-${site}`}
            onClick={() => toggleSite(site)}
            aria-pressed={active ? "true" : "false"}
            className={
              "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-all duration-150 " +
              (active
                ? `${colors.bg} ${colors.border} ${colors.text} shadow-sm`
                : "bg-gray-800/80 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200")
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${active ? colors.dot : "bg-gray-500"}`}
            />
            {site}
            <span className="text-[10px] opacity-70">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Hook helper — estado + persistencia localStorage. */
export function useDayPlannedFilter(
  profileLetter: "A" | "B" | "C",
  dayOfWeek: number,
): [string[], (next: string[]) => void] {
  const [selected, setSelected] = React.useState<string[]>(() =>
    loadFromStorage(profileLetter, dayOfWeek),
  );

  // Reidrata ao mudar profile/day (modal reabre com outro contexto).
  React.useEffect(() => {
    setSelected(loadFromStorage(profileLetter, dayOfWeek));
  }, [profileLetter, dayOfWeek]);

  const update = React.useCallback(
    (next: string[]) => {
      setSelected(next);
      saveToStorage(profileLetter, dayOfWeek, next);
    },
    [profileLetter, dayOfWeek],
  );

  return [selected, update];
}

export default DayPlannedFilterChips;
