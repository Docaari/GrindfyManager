// =============================================================================
// Sprint Stats-V3 — HudFilters (RF-03)
//
// Filter pills (16 grupos) + search global + presets (off-target, top leaks, groupOnly).
// Spec: docs/specs/sprint-stats-v3.md (RF-03)
// =============================================================================

import React from "react";
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
  const togglePill = (g: HudGroupId) => {
    const next = new Set(filters.activeGroups);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    onChange({ ...filters, activeGroups: next });
  };

  const onSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...filters, searchQuery: e.target.value });
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

  return (
    <div className="flex flex-col gap-3 p-3 border-b border-slate-800 bg-slate-900">
      {/* Search */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          data-testid="stats-v3-search"
          value={filters.searchQuery}
          onChange={onSearch}
          placeholder="Buscar stat por nome..."
          className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-slate-100 text-sm"
        />
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

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
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
