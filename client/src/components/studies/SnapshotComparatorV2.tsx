// =============================================================================
// Sprint Stats-V2 — SnapshotComparatorV2 (RF-06, ADR-063)
//
// Renderiza 200+ stats agrupados, com cores baseadas em direction semantics.
// Compara 2 snapshots (A vs B) e usa o snapshotB para colorir cells.
// =============================================================================

import { useMemo, useState } from "react";
import {
  getStatColor,
  getDirectionTooltip,
  type StatColor,
} from "../../../../shared/stat-direction-logic";
import type { StatDirection } from "../../../../shared/hud-stat-catalog";

interface ComparatorStat {
  id: string;
  label: string;
  targetMin: number;
  targetMax: number;
  direction: StatDirection;
  unit: string;
}

interface ComparatorGroup {
  id: string;
  label: string;
  stats: ComparatorStat[];
}

interface ComparatorLayout {
  id: string;
  name: string;
  groups: ComparatorGroup[];
}

interface ComparatorSnapshot {
  id: string;
  capturedAt: string | Date;
  values: Record<string, number | null>;
}

interface Props {
  layout: ComparatorLayout;
  snapshotA: ComparatorSnapshot;
  snapshotB: ComparatorSnapshot;
}

const COLOR_CLASSES: Record<StatColor, string> = {
  green: "bg-green-700/30 border-green-600 text-green-100",
  red: "bg-red-700/30 border-red-600 text-red-100",
  orange: "bg-orange-700/30 border-orange-600 text-orange-100",
  gray: "bg-gray-700/30 border-gray-600 text-gray-200",
};

function formatValue(
  value: number | null,
  unit: string,
): string {
  if (value === null || value === undefined) return "—";
  if (unit === "pct") return `${value.toFixed(1)}%`;
  if (unit === "bb") return `${value.toFixed(2)}`;
  return String(value);
}

// HIGH-2 UX: classe especial para "nao reportado" — visualmente distinta
// do cinza "neutro on-target" (border-dashed em vez de border solid).
const MISSING_CELL_CLASSES =
  "border-dashed border-2 border-gray-500 bg-transparent text-gray-300";

function StatCell({
  stat,
  valueA,
  valueB,
}: {
  stat: ComparatorStat;
  valueA: number | null;
  valueB: number | null;
}) {
  const isNull = valueA === null || valueB === null;
  // MAJOR-4 reviewer: quando A ou B for null, forca cinza (sem informacao
  // suficiente para colorir target). Tooltip ja diz "Nao reportado".
  const color: StatColor = isNull ? "gray" : getStatColor(stat, valueB);
  // HIGH-2 UX: cell sem reporte usa classe distinta (dashed) em vez de bg-cinza.
  const colorClass = isNull ? MISSING_CELL_CLASSES : COLOR_CLASSES[color];
  const tooltipText = getDirectionTooltip(stat.direction);
  const ariaLabel = isNull
    ? `${stat.label} — Nao reportado (${stat.direction})`
    : `${stat.label} — ${stat.direction}: ${tooltipText}`;
  const titleText = isNull ? "Nao reportado" : tooltipText;
  const status = isNull ? "missing" : "reported";

  return (
    <div
      data-testid={`comparator-cell-${stat.id}`}
      data-stat-color={color}
      data-stat-status={status}
      className={`rounded border p-2 text-xs flex flex-col gap-1 ${colorClass}`}
      aria-label={ariaLabel}
      title={titleText}
      style={{ contentVisibility: "auto" } as React.CSSProperties}
    >
      <div className="font-medium text-sm">{stat.label}</div>
      <div className="flex items-center justify-between gap-2 font-mono">
        <span>{formatValue(valueA, stat.unit)}</span>
        <span aria-hidden="true">→</span>
        <span className="font-bold">{formatValue(valueB, stat.unit)}</span>
      </div>
    </div>
  );
}

// HIGH-2 UX: legenda das 5 cores semanticas + nao-reportado dashed.
function ColorLegend() {
  return (
    <div
      data-testid="comparator-color-legend"
      className="flex flex-wrap items-center gap-3 px-3 py-2 rounded border border-poker-border/40 bg-poker-card/30 text-xs"
      role="note"
      aria-label="Legenda de cores"
    >
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded bg-green-700/50 border border-green-600" />
        <span>On-target</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded bg-red-700/50 border border-red-600" />
        <span>Off-target (critico)</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded bg-orange-700/50 border border-orange-600" />
        <span>Off-target (suave)</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded bg-gray-700/50 border border-gray-600" />
        <span>Neutro</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded border-dashed border-2 border-gray-500 bg-transparent" />
        <span>Nao reportado</span>
      </div>
    </div>
  );
}

export default function SnapshotComparatorV2({
  layout,
  snapshotA,
  snapshotB,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const clearHover = () => setHoveredId(null);

  const hoveredStat = useMemo(() => {
    if (!hoveredId) return null;
    for (const group of layout.groups) {
      const found = group.stats.find((s) => s.id === hoveredId);
      if (found) return found;
    }
    return null;
  }, [hoveredId, layout.groups]);

  return (
    <div className="space-y-4" data-testid="comparator-v2-root">
      {/* HIGH-2 UX: legenda persistente no topo */}
      <ColorLegend />
      {layout.groups.map((group) => (
        <section
          key={group.id}
          data-testid={`comparator-group-${group.id}`}
          className="rounded border border-poker-border/60 p-3 bg-poker-card/40"
        >
          <h3 className="text-sm font-semibold text-poker-accent mb-2">
            {group.label}
          </h3>
          {/* MEDIUM-2 UX: 1 coluna no mobile, escala progressivamente */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {group.stats.map((stat) => (
              <div
                key={stat.id}
                onMouseEnter={() => setHoveredId(stat.id)}
                onMouseLeave={clearHover}
                onFocus={() => setHoveredId(stat.id)}
                onBlur={clearHover}
              >
                <StatCell
                  stat={stat}
                  valueA={snapshotA.values?.[stat.id] ?? null}
                  valueB={snapshotB.values?.[stat.id] ?? null}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
      {hoveredStat ? (
        <div
          role="tooltip"
          data-testid="comparator-tooltip"
          className="fixed bottom-4 right-4 z-50 max-w-xs rounded bg-poker-bg border border-poker-accent p-3 text-xs"
        >
          <div className="font-semibold mb-1">{hoveredStat.label}</div>
          <div>{getDirectionTooltip(hoveredStat.direction)}</div>
        </div>
      ) : null}
    </div>
  );
}
