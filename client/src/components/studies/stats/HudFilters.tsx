// =============================================================================
// Sprint Stats-V3 — HudFilters (RF-03)
//
// Filter pills (16 grupos) + search global + presets (off-target, top leaks, groupOnly).
// Spec: docs/specs/sprint-stats-v3.md (RF-03)
// =============================================================================

import React from "react";
import { Search, X } from "lucide-react";
import {
  HUD_GROUP_IDS,
  HUD_GROUP_LABELS,
  type HudGroupId,
} from "../../../../../shared/hud-stat-catalog";

export interface HudFiltersState {
  searchQuery: string;
  activeGroups: Set<HudGroupId>;
  preset: string | null;
}

export interface HudFiltersProps {
  filters: HudFiltersState;
  onChange: (next: HudFiltersState) => void;
  snapshot?: { values: Record<string, number | null> } | null;
}

export default function HudFilters({ filters, onChange, snapshot }: HudFiltersProps) {
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const togglePill = (g: HudGroupId) => {
    const next = new Set(filters.activeGroups);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    onChange({ ...filters, activeGroups: next });
  };

  const onSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...filters, searchQuery: e.target.value });
  };

  const clearSearch = () => {
    onChange({ ...filters, searchQuery: "" });
    searchInputRef.current?.focus();
  };

  const setAll = () => {
    onChange({ ...filters, activeGroups: new Set(HUD_GROUP_IDS) });
  };

  const clearAll = () => {
    onChange({ ...filters, activeGroups: new Set() });
  };

  const setPreset = (preset: string) => {
    onChange({ ...filters, preset });
  };

  // WIN 4 — Ctrl+K (ou Cmd+K) foca o search input.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }
    return undefined;
  }, []);

  const hasQuery = filters.searchQuery.length > 0;

  return (
    <div className="flex flex-col gap-3 p-3 border-b border-slate-800 bg-slate-900">
      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
            aria-hidden="true"
          />
          <input
            ref={searchInputRef}
            type="text"
            data-testid="stats-v3-search"
            value={filters.searchQuery}
            onChange={onSearch}
            placeholder="Buscar stat... (Ctrl+K)"
            className="w-full bg-slate-800 border border-slate-700 rounded pl-8 pr-7 py-1.5 text-slate-100 text-sm"
          />
          {hasQuery && (
            <button
              type="button"
              data-testid="stats-v3-search-clear"
              onClick={clearSearch}
              aria-label="Limpar busca"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-200 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          data-testid="stats-v3-filter-all"
          onClick={setAll}
          className="px-2 py-1 text-xs bg-emerald-700 text-white rounded hover:bg-emerald-600"
        >
          Todos
        </button>
        <button
          type="button"
          data-testid="stats-v3-filter-clear"
          onClick={clearAll}
          className="px-2 py-1 text-xs bg-slate-700 text-slate-200 rounded hover:bg-slate-600"
        >
          Limpar
        </button>
      </div>

      {/* WIN 5 — Counter de grupos ativos */}
      <span
        className="text-xs text-slate-400"
        data-testid="stats-v3-active-counter"
      >
        Grupos: {filters.activeGroups.size}/{HUD_GROUP_IDS.length}
      </span>

      {/* Filter pills — mobile colapsavel via <details>, desktop sempre visivel */}
      <details
        className="sm:hidden"
        data-testid="stats-v3-pills-mobile-collapse"
      >
        <summary className="cursor-pointer text-xs text-slate-300 select-none">
          Grupos ativos ({filters.activeGroups.size})
        </summary>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {HUD_GROUP_IDS.map((g) => {
            const active = filters.activeGroups.has(g);
            return (
              <button
                key={g}
                type="button"
                role="checkbox"
                aria-checked={active}
                data-testid={`stats-v3-filter-pill-${g}`}
                onClick={() => togglePill(g)}
                className={`px-2 py-1 text-xs rounded-full border transition ${
                  active
                    ? "bg-emerald-900/50 border-emerald-500 text-emerald-200"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                {HUD_GROUP_LABELS[g]}
              </button>
            );
          })}
        </div>
      </details>

      <div className="hidden sm:flex flex-wrap gap-1.5">
        {HUD_GROUP_IDS.map((g) => {
          const active = filters.activeGroups.has(g);
          return (
            <button
              key={g}
              type="button"
              role="checkbox"
              aria-checked={active}
              data-testid={`stats-v3-filter-pill-${g}-desktop`}
              onClick={() => togglePill(g)}
              className={`px-2 py-1 text-xs rounded-full border transition ${
                active
                  ? "bg-emerald-900/50 border-emerald-500 text-emerald-200"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              }`}
            >
              {HUD_GROUP_LABELS[g]}
            </button>
          );
        })}
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          data-testid="stats-v3-preset-offTargetOnly"
          onClick={() => setPreset("offTargetOnly")}
          className={`px-2 py-1 rounded border ${
            filters.preset === "offTargetOnly"
              ? "bg-orange-900/50 border-orange-500 text-orange-200"
              : "bg-slate-800 border-slate-700 text-slate-400"
          }`}
        >
          Apenas off-target
        </button>
        <button
          type="button"
          data-testid="stats-v3-preset-topTenLeaks"
          onClick={() => setPreset("topTenLeaks")}
          className={`px-2 py-1 rounded border ${
            filters.preset === "topTenLeaks"
              ? "bg-red-900/50 border-red-500 text-red-200"
              : "bg-slate-800 border-slate-700 text-slate-400"
          }`}
        >
          Top 10 leaks
        </button>
        <button
          type="button"
          data-testid="stats-v3-preset-clear"
          onClick={() => setPreset(null as any)}
          className="px-2 py-1 rounded border bg-slate-800 border-slate-700 text-slate-400"
        >
          Limpar preset
        </button>
      </div>
    </div>
  );
}
