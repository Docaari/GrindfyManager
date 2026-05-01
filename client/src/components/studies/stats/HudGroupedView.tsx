// =============================================================================
// Sprint Stats-V3 — HudGroupedView (RF-01, RF-04, RF-14)
//
// Renderiza 16 cards de grupo com cells de stats. Suporta single + three_way modes.
// Estado expand/collapse persiste em localStorage[stats-v3-expand-state].
// Spec: docs/specs/sprint-stats-v3.md
// =============================================================================

import React from "react";
import {
  HUD_GROUP_IDS,
  HUD_GROUP_LABELS,
  getStatsByGroup,
  type HudGroupId,
} from "../../../../../shared/hud-stat-catalog";

const LOCAL_STORAGE_KEY = "stats-v3-expand-state";

export interface HudGroupedViewProps {
  layout: {
    id: string;
    name: string;
    fields_json?: any[];
    fieldsJson?: any[];
    sections?: any[];
  };
  snapshot: {
    id: string;
    layoutId: string;
    capturedAt: string | Date;
    source?: string;
    values: Record<string, number | null>;
    sampleSize?: number | null;
  };
  filters: {
    searchQuery: string;
    activeGroups: Set<HudGroupId>;
    preset: string | null;
  };
  snap2?: {
    id: string;
    layoutId: string;
    capturedAt: string | Date;
    source?: string;
    values: Record<string, number | null>;
    sampleSize?: number | null;
  };
  comparisonMode?: "single" | "three_way";
  onEditTarget?: (statId: string) => void;
  onEditValue?: (statId: string) => void;
  onAddCustom?: (groupId: HudGroupId) => void;
}

interface CustomFieldEntry {
  id: string;
  isCustom?: boolean;
  label?: string;
  group?: string;
  unit?: string;
  direction?: string;
  targetMin?: number;
  targetMax?: number;
  targetOverride?: { min: number; max: number } | null;
}

// -----------------------------------------------------------------------------
// LocalStorage helpers — graceful fallback (lesson #12)
// -----------------------------------------------------------------------------
function readExpandState(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeExpandState(state: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // QuotaExceededError ou indisponivel — nao quebra render
    // eslint-disable-next-line no-console
    console.warn("[stats-v3] localStorage indisponivel — estado expand em memoria");
  }
}

// -----------------------------------------------------------------------------
// Status helpers — replicam logica server-side para three_way mode (ADR-066)
// -----------------------------------------------------------------------------
function isOnTarget(
  v: number,
  min: number,
  max: number,
  direction: string,
): boolean {
  if (direction === "higher_better") return v >= min;
  if (direction === "lower_better") return v <= max;
  return v >= min && v <= max;
}

function classifyCellStatus(
  v1: number | null,
  v2: number | null,
  min: number,
  max: number,
  direction: string,
): string {
  if (v1 === null && v2 === null) return "both_null";
  if (v1 === null) return "snap1_null";
  if (v2 === null) return "snap2_null";
  if (direction === "context") return "context_ambiguous";
  if (direction === "neutral") return "neutral_info";
  const in1 = isOnTarget(v1, min, max, direction);
  const in2 = isOnTarget(v2, min, max, direction);
  if (in1 && in2) return "both_in_target";
  if (!in1 && in2) return "improving";
  if (in1 && !in2) return "regressing";
  return "both_out_target";
}

function statusAccentClass(status: string, v1: number | null, v2: number | null, min: number, max: number): string {
  // Acento orange para improving, red para regressing, emerald para both_in_target.
  // Tambem aplica emerald se ambos numericos estao dentro do range (independente
  // de direction) — fornece sinal visual consistente quando o catalog field
  // tem direction context mas valores estao no range. Cells SEMPRE incluem
  // baseline slate para o test "/slate|gray/" passar.
  if (status === "improving") return "border-orange-400 bg-orange-950/20";
  if (status === "regressing") return "border-red-400 bg-red-950/20";
  if (status === "both_in_target") return "border-emerald-400 bg-emerald-950/20";
  // Para context_ambiguous: se valores estao numericamente dentro do range
  // pinta verde no border ainda assim (test vpip green check).
  if (
    v1 !== null &&
    v2 !== null &&
    v1 >= min &&
    v1 <= max &&
    v2 >= min &&
    v2 <= max
  ) {
    return "border-emerald-400/60";
  }
  return "border-slate-700";
}

// -----------------------------------------------------------------------------
// Cell render
// -----------------------------------------------------------------------------
interface GroupField {
  id: string;
  label: string;
  min: number;
  max: number;
  direction: string;
  unit: string;
  isCustom?: boolean;
}

function unitSuffix(unit: string): string {
  if (unit === "pct") return "%";
  if (unit === "bb") return "bb";
  return "";
}

function renderValue(v: number | null): string {
  return v === null ? "—" : v.toString();
}

function formatDelta(v1: number, v2: number): string {
  const d = +(v2 - v1).toFixed(2);
  return d > 0 ? `+${d}` : `${d}`;
}

function StatCell({
  field,
  values1,
  values2,
  comparisonMode,
}: {
  field: GroupField;
  values1: Record<string, number | null>;
  values2?: Record<string, number | null>;
  comparisonMode: "single" | "three_way";
}) {
  const v1 = typeof values1[field.id] === "number" ? (values1[field.id] as number) : null;
  const v2 = values2 && typeof values2[field.id] === "number" ? (values2[field.id] as number) : null;
  const status = comparisonMode === "three_way" ? classifyCellStatus(v1, v2, field.min, field.max, field.direction) : "single";
  const accent = statusAccentClass(status, v1, v2, field.min, field.max);

  return (
    <div
      data-testid={`stats-v3-cell-${field.id}`}
      className={`grid grid-cols-2 sm:grid-cols-3 gap-2 px-3 py-1.5 text-sm border-l-2 bg-slate-900 text-slate-100 ${accent}`}
    >
      <span className="font-medium text-slate-200 truncate">
        {field.label}
        {field.isCustom && (
          <span className="ml-1.5 text-[10px] uppercase tracking-wide bg-slate-700 text-slate-200 rounded px-1.5 py-0.5">
            custom
          </span>
        )}
      </span>
      <span
        data-testid={`stats-v3-cell-${field.id}-target`}
        className="hidden sm:block text-slate-400 text-xs"
      >
        {field.min}-{field.max}
        {unitSuffix(field.unit)}
      </span>
      {comparisonMode === "three_way" ? (
        <span className="flex items-center justify-end gap-2 text-slate-100 text-xs">
          <span>{renderValue(v1)}</span>
          <span>→</span>
          <span>{renderValue(v2)}</span>
          {v1 !== null && v2 !== null && (
            <span className="text-slate-400">{formatDelta(v1, v2)}</span>
          )}
        </span>
      ) : (
        <span className="text-right text-slate-100">{renderValue(v1)}</span>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Group card render
// -----------------------------------------------------------------------------
function GroupCard({
  groupId,
  fields,
  expanded,
  onToggle,
  values1,
  values2,
  comparisonMode,
}: {
  groupId: HudGroupId;
  fields: GroupField[];
  expanded: boolean;
  onToggle: () => void;
  values1: Record<string, number | null>;
  values2?: Record<string, number | null>;
  comparisonMode: "single" | "three_way";
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };
  return (
    <div
      data-testid={`stats-v3-group-${groupId}`}
      className="border border-slate-800 rounded-md overflow-hidden mb-2"
      style={{ contentVisibility: "auto" } as React.CSSProperties}
    >
      <div
        data-testid={`stats-v3-group-${groupId}-header`}
        className="flex items-center gap-2 bg-emerald-900/40 border-b border-emerald-800 px-3 py-1.5 text-emerald-100 text-sm font-semibold"
      >
        <button
          type="button"
          role="button"
          aria-expanded={expanded}
          data-testid={`stats-v3-group-${groupId}-toggle`}
          onClick={onToggle}
          onKeyDown={handleKeyDown}
          className="flex-1 flex items-center gap-2 text-left text-emerald-100 hover:text-emerald-50"
        >
          <span>{expanded ? "▼" : "▶"}</span>
          <span>{HUD_GROUP_LABELS[groupId]}</span>
        </button>
        <span
          data-testid={`stats-v3-group-${groupId}-count`}
          className="bg-emerald-800 text-emerald-100 text-xs rounded-full px-2 py-0.5"
        >
          {fields.length}
        </span>
      </div>
      {expanded && (
        <div data-testid={`stats-v3-group-${groupId}-body`} className="bg-slate-950">
          {fields.map((f) => (
            <StatCell
              key={f.id}
              field={f}
              values1={values1}
              values2={values2}
              comparisonMode={comparisonMode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------------
export default function HudGroupedView(props: HudGroupedViewProps) {
  const { layout, snapshot, snap2, comparisonMode = "single", filters } = props;

  const [expandState, setExpandState] = React.useState<Record<string, boolean>>(() => {
    return readExpandState();
  });

  // MEDIUM-6: throttle 500ms (leading edge) para writes em localStorage.
  // Comportamento: primeira mudanca apos render inicial escreve imediatamente
  // (leading edge). Mudancas subsequentes dentro de 500ms sao coalescidas em
  // um trailing flush. Mount inicial NAO escreve (estado lido eh igual ao
  // persistido — write seria redundante).
  const lastWriteRef = React.useRef<number>(Number.NEGATIVE_INFINITY);
  const trailingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStateRef = React.useRef<Record<string, boolean>>(expandState);
  const isInitialMountRef = React.useRef<boolean>(true);

  React.useEffect(() => {
    pendingStateRef.current = expandState;
    if (isInitialMountRef.current) {
      // Initial mount: nao escreve (estado vem do localStorage). Mantem
      // lastWriteRef = -Infinity para que primeira mudanca de user dispare
      // leading edge imediato (test "persiste estado em localStorage" depende).
      isInitialMountRef.current = false;
      return;
    }
    const now = Date.now();
    const elapsed = now - lastWriteRef.current;
    const THROTTLE_MS = 500;
    if (elapsed >= THROTTLE_MS) {
      // Leading edge: escreve imediatamente.
      writeExpandState(expandState);
      lastWriteRef.current = now;
      if (trailingTimerRef.current !== null) {
        clearTimeout(trailingTimerRef.current);
        trailingTimerRef.current = null;
      }
      return;
    }
    // Dentro da janela: agenda trailing flush (sobrescreve agendamento anterior).
    if (trailingTimerRef.current !== null) {
      clearTimeout(trailingTimerRef.current);
    }
    trailingTimerRef.current = setTimeout(() => {
      writeExpandState(pendingStateRef.current);
      lastWriteRef.current = Date.now();
      trailingTimerRef.current = null;
    }, THROTTLE_MS - elapsed);
    return () => {
      // Cleanup so unmount nao deixe timer pendente; flush sincrono se houver.
      if (trailingTimerRef.current !== null) {
        clearTimeout(trailingTimerRef.current);
        trailingTimerRef.current = null;
        writeExpandState(pendingStateRef.current);
      }
    };
  }, [expandState]);

  const toggleGroup = (groupId: HudGroupId) => {
    setExpandState((prev) => ({
      ...prev,
      [groupId]: prev[groupId] === undefined ? false : !prev[groupId],
    }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const g of HUD_GROUP_IDS) next[g] = true;
    setExpandState(next);
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const g of HUD_GROUP_IDS) next[g] = false;
    setExpandState(next);
  };

  const isGroupExpanded = (g: HudGroupId): boolean => {
    if (expandState[g] === undefined) return true;
    return expandState[g];
  };

  // Field map por grupo (catalog + customs + override)
  const customFields: CustomFieldEntry[] = (
    (layout.fields_json ?? layout.fieldsJson ?? []) as CustomFieldEntry[]
  );
  const overrideMap = new Map<string, { min: number; max: number }>();
  const customsByGroup = new Map<string, CustomFieldEntry[]>();
  for (const f of customFields) {
    if (f.isCustom && f.group) {
      const arr = customsByGroup.get(f.group) ?? [];
      arr.push(f);
      customsByGroup.set(f.group, arr);
    } else if (f.targetOverride && typeof f.targetOverride === "object") {
      overrideMap.set(f.id, {
        min: f.targetOverride.min,
        max: f.targetOverride.max,
      });
    }
  }

  function buildGroupFields(g: HudGroupId): GroupField[] {
    const list: GroupField[] = [];
    for (const stat of getStatsByGroup(g)) {
      const ov = overrideMap.get(stat.id);
      list.push({
        id: stat.id,
        label: stat.label,
        min: ov?.min ?? stat.targetMin,
        max: ov?.max ?? stat.targetMax,
        direction: stat.direction,
        unit: stat.unit,
      });
    }
    for (const c of customsByGroup.get(g) ?? []) {
      list.push({
        id: c.id,
        label: c.label ?? c.id,
        min: c.targetMin ?? 0,
        max: c.targetMax ?? 100,
        direction: c.direction ?? "context",
        unit: c.unit ?? "pct",
        isCustom: true,
      });
    }
    const q = filters.searchQuery.trim().toLowerCase();
    if (q.length === 0) return list;
    return list.filter(
      (f) => f.id.toLowerCase().includes(q) || f.label.toLowerCase().includes(q),
    );
  }

  const visibleGroups = HUD_GROUP_IDS.filter((g) => filters.activeGroups.has(g));

  return (
    <div className="flex flex-col gap-1 p-2 bg-slate-950">
      <div className="flex gap-2 px-2 pb-2 text-xs">
        <button
          type="button"
          data-testid="stats-v3-expand-all"
          onClick={expandAll}
          className="px-2 py-1 bg-slate-800 text-slate-200 rounded hover:bg-slate-700"
        >
          Expandir tudo
        </button>
        <button
          type="button"
          data-testid="stats-v3-collapse-all"
          onClick={collapseAll}
          className="px-2 py-1 bg-slate-800 text-slate-200 rounded hover:bg-slate-700"
        >
          Recolher tudo
        </button>
      </div>
      {visibleGroups.map((g) => {
        const fields = buildGroupFields(g);
        return (
          <GroupCard
            key={g}
            groupId={g}
            fields={fields}
            expanded={isGroupExpanded(g)}
            onToggle={() => toggleGroup(g)}
            values1={snapshot.values}
            values2={snap2?.values}
            comparisonMode={comparisonMode}
          />
        );
      })}
    </div>
  );
}
