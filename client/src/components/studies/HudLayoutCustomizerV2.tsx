// =============================================================================
// Sprint Stats-V2 — HudLayoutCustomizerV2 (RF-04, RF-16)
//
// Customizer escalavel para 200+ stats:
//   - Search bar cross-group (filtra id/label)
//   - Filter pills por grupo (16 chips)
//   - Accordion (collapsed default quando layout >50 stats)
//   - Drag-drop affordance via botao test-friendly (move-{id}-to-{group})
//   - Virtual scroll via CSS content-visibility:auto (sem react-window)
//   - Search match auto-expande grupo
//   - Render <500ms para 200 stats
// =============================================================================

import { useMemo, useState, useCallback, type CSSProperties } from "react";
import {
  HUD_GROUP_IDS,
  HUD_GROUP_LABELS,
  type HudGroupId,
} from "../../../../shared/hud-stat-catalog";

interface CatalogEntry {
  id: string;
  label: string;
  group: HudGroupId | string;
  targetMin: number;
  targetMax: number;
  direction: string;
  unit: string;
  subgroup?: string;
}

interface LayoutField {
  id: string;
  group?: HudGroupId | string;
}

interface CustomizerLayout {
  id: string;
  name: string;
  isCustom?: boolean;
  fields: LayoutField[];
}

interface MoveStatPayload {
  statId: string;
  fromGroup: string;
  toGroup: string;
}

interface Props {
  layout: CustomizerLayout;
  catalog: CatalogEntry[];
  onChange: (layout: CustomizerLayout) => void;
  onMoveStat: (payload: MoveStatPayload) => void;
}

const VIRTUAL_THRESHOLD = 50;

export default function HudLayoutCustomizerV2({
  layout,
  catalog,
  onChange,
  onMoveStat,
}: Props) {
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [manualExpanded, setManualExpanded] = useState<Set<string>>(new Set());

  const totalCatalogStats = catalog.length;
  const collapsedDefault = totalCatalogStats > VIRTUAL_THRESHOLD;

  // Index catalog by group
  const catalogByGroup = useMemo(() => {
    const map = new Map<string, CatalogEntry[]>();
    for (const entry of catalog) {
      const groupId = String(entry.group);
      if (!map.has(groupId)) map.set(groupId, []);
      map.get(groupId)!.push(entry);
    }
    return map;
  }, [catalog]);

  const allGroupIds = useMemo(() => {
    const set = new Set<string>();
    for (const entry of catalog) set.add(String(entry.group));
    // Mantem ordem do catalog default
    const ordered: string[] = [];
    for (const g of HUD_GROUP_IDS) {
      if (set.has(g)) ordered.push(g);
    }
    for (const g of set) {
      if (!ordered.includes(g)) ordered.push(g);
    }
    return ordered;
  }, [catalog]);

  const normalizedSearch = search.trim().toLowerCase();

  // Stats que matcham search
  const filteredCatalogByGroup = useMemo(() => {
    const map = new Map<string, CatalogEntry[]>();
    for (const groupId of allGroupIds) {
      const entries = catalogByGroup.get(groupId) ?? [];
      let visible = entries;
      if (normalizedSearch) {
        visible = entries.filter(
          (e) =>
            e.id.toLowerCase().includes(normalizedSearch) ||
            e.label.toLowerCase().includes(normalizedSearch),
        );
      }
      map.set(groupId, visible);
    }
    return map;
  }, [allGroupIds, catalogByGroup, normalizedSearch]);

  // Grupos visiveis depois de aplicar filter pills
  const visibleGroups = useMemo(() => {
    if (activeFilters.size === 0) return allGroupIds;
    return allGroupIds.filter((g) => activeFilters.has(g));
  }, [allGroupIds, activeFilters]);

  // Total de matches (para empty state)
  const totalMatches = useMemo(() => {
    let n = 0;
    for (const g of visibleGroups) {
      n += filteredCatalogByGroup.get(g)?.length ?? 0;
    }
    return n;
  }, [visibleGroups, filteredCatalogByGroup]);

  // Auto-expande grupo quando search match
  const isGroupExpanded = useCallback(
    (groupId: string): boolean => {
      if (manualExpanded.has(groupId)) return true;
      if (normalizedSearch) {
        const matches = filteredCatalogByGroup.get(groupId) ?? [];
        if (matches.length > 0) return true;
      }
      // basics expandido por default mesmo com >50 stats
      if (groupId === "basics" && !collapsedDefault) return true;
      return !collapsedDefault;
    },
    [manualExpanded, normalizedSearch, filteredCatalogByGroup, collapsedDefault],
  );

  const toggleGroup = useCallback((groupId: string) => {
    setManualExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const toggleFilter = useCallback((groupId: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const handleMoveStat = useCallback(
    (statId: string, fromGroup: string, toGroup: string) => {
      onMoveStat({ statId, fromGroup, toGroup });
      // Atualiza layout local (move stat de grupo)
      const fields = layout.fields.map((f) =>
        f.id === statId ? { ...f, group: toGroup } : f,
      );
      onChange({ ...layout, fields });
    },
    [onChange, onMoveStat, layout],
  );

  return (
    <div className="space-y-3" data-testid="customizer-v2-root">
      {/* Search bar */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          data-testid="customizer-search-input"
          placeholder="Buscar stat..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm"
          aria-label="Buscar stats"
        />
      </div>

      {/* Filter pills — MEDIUM-2 UX: collapsible em mobile via <details> */}
      <details
        className="sm:hidden border border-border/40 rounded"
        data-testid="customizer-filters-mobile"
      >
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium select-none">
          Filtros ({HUD_GROUP_IDS.length})
        </summary>
        <div className="flex flex-wrap gap-2 p-2">
          {HUD_GROUP_IDS.map((groupId) => {
            const active = activeFilters.has(groupId);
            return (
              <button
                key={groupId}
                type="button"
                data-testid={`customizer-group-filter-${groupId}-mobile`}
                onClick={() => toggleFilter(groupId)}
                className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                  active
                    ? "bg-primary text-background border-primary"
                    : "bg-transparent text-foreground border-border"
                }`}
                aria-pressed={active}
              >
                {HUD_GROUP_LABELS[groupId]}
              </button>
            );
          })}
        </div>
      </details>
      <div className="hidden sm:flex flex-wrap gap-2">
        {HUD_GROUP_IDS.map((groupId) => {
          const active = activeFilters.has(groupId);
          return (
            <button
              key={groupId}
              type="button"
              data-testid={`customizer-group-filter-${groupId}`}
              onClick={() => toggleFilter(groupId)}
              className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                active
                  ? "bg-primary text-background border-primary"
                  : "bg-transparent text-foreground border-border"
              }`}
              aria-pressed={active}
            >
              {HUD_GROUP_LABELS[groupId]}
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {totalMatches === 0 && normalizedSearch ? (
        <div
          data-testid="customizer-empty-state"
          className="text-sm text-muted-foreground py-8 text-center"
        >
          Nenhum stat encontrado para "{search}".
        </div>
      ) : null}

      {/* Groups */}
      <div className="space-y-2">
        {allGroupIds.map((groupId) => {
          const isHiddenByFilter =
            activeFilters.size > 0 && !activeFilters.has(groupId);
          const expanded = isGroupExpanded(groupId);
          const entries = filteredCatalogByGroup.get(groupId) ?? [];
          const enableVirtual = entries.length > VIRTUAL_THRESHOLD;

          // Quando search ativo e nao ha matches, esconde grupo
          if (normalizedSearch && entries.length === 0) {
            return null;
          }

          const groupLabel =
            HUD_GROUP_LABELS[groupId as HudGroupId] ?? groupId;

          const groupStyle: CSSProperties = enableVirtual
            ? { contentVisibility: "auto" as any }
            : {};

          return (
            <section
              key={groupId}
              data-testid={`customizer-group-${groupId}`}
              data-customizer-group=""
              data-collapsed={expanded ? "false" : "true"}
              data-virtual={enableVirtual ? "true" : "false"}
              aria-expanded={expanded ? "true" : "false"}
              hidden={isHiddenByFilter}
              data-hidden={isHiddenByFilter ? "true" : "false"}
              className="rounded border border-border/60 bg-card/40"
              style={groupStyle}
            >
              <header
                className="flex items-center justify-between px-3 py-2 cursor-pointer"
                onClick={() => toggleGroup(groupId)}
              >
                <h3 className="text-sm font-semibold">{groupLabel}</h3>
                <span className="text-xs text-muted-foreground">
                  {entries.length} stats {expanded ? "▼" : "▶"}
                </span>
              </header>
              {expanded ? (
                <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      data-testid={`customizer-stat-${entry.id}`}
                      className="rounded border border-border/40 px-2 py-1 text-xs flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{entry.label}</span>
                      {/* HIGH-1 UX: dropdown para mover stat para qualquer grupo */}
                      <select
                        value={String(entry.group)}
                        onChange={(e) => {
                          e.stopPropagation();
                          const toGroup = e.target.value;
                          if (toGroup !== String(entry.group)) {
                            handleMoveStat(entry.id, String(entry.group), toGroup);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`customizer-move-${entry.id}-select`}
                        aria-label={`Mover ${entry.label} para outro grupo`}
                        className="bg-background border border-border rounded text-xs px-1 py-0.5 max-w-[7rem] text-foreground"
                      >
                        {HUD_GROUP_IDS.map((g) => (
                          <option key={g} value={g}>
                            {HUD_GROUP_LABELS[g]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
