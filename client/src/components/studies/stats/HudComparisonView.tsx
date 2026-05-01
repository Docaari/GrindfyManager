// =============================================================================
// Sprint Stats-V3 — HudComparisonView (RF-13, RF-14, RF-15)
//
// Selector duplo + 4-col layout (target | snap1 | snap2 | delta) + cor-coding.
// Consome compareResponse server-side (RF-16) — nao computa logica client.
// Spec: docs/specs/sprint-stats-v3.md
// =============================================================================

import React from "react";

interface CompareStat {
  id: string;
  label: string;
  target: { min: number; max: number };
  snap1Value: number | null;
  snap2Value: number | null;
  delta: number | null;
  direction: string;
  unit: string;
  status: string;
  trend: string;
  trendIcon: string | null;
}

interface CompareGroup {
  id: string;
  name: string;
  stats: CompareStat[];
}

export interface CompareResponse {
  layoutId: string;
  snap1: { id: string; capturedAt: string; captureMethod: string; sampleSize: number | null };
  snap2: { id: string; capturedAt: string; captureMethod: string; sampleSize: number | null };
  groups: CompareGroup[];
  summary: {
    snap1OffTarget: number;
    snap2OffTarget: number;
    improvingCount: number;
    regressingCount: number;
    stableCount: number;
  };
}

interface SnapshotMeta {
  id: string;
  capturedAt: string;
  source?: string;
}

export interface HudComparisonViewProps {
  layoutId: string;
  snapshots: SnapshotMeta[];
  selectedSnap1Id: string;
  selectedSnap2Id: string;
  onSelectSnap1: (id: string) => void;
  onSelectSnap2: (id: string) => void;
  compareResponse: CompareResponse | null;
}

function statusAccent(status: string): string {
  // Sempre inclui slate baseline; acentos por status.
  if (status === "improving") return "border-l-orange-400 bg-orange-950/20 text-slate-100";
  if (status === "regressing") return "border-l-red-400 bg-red-950/20 text-slate-100";
  if (status === "both_in_target") return "border-l-emerald-400 bg-emerald-950/20 text-slate-100";
  // gray defaults
  return "border-l-slate-700 bg-slate-900 text-slate-300";
}

export default function HudComparisonView(props: HudComparisonViewProps) {
  const {
    layoutId,
    snapshots,
    selectedSnap1Id,
    selectedSnap2Id,
    onSelectSnap1,
    onSelectSnap2,
    compareResponse,
  } = props;

  if (!snapshots || snapshots.length === 0) {
    return (
      <div
        data-testid="compare-empty-state"
        className="p-6 text-center text-slate-400"
      >
        <p className="text-sm">Nenhum snapshot disponivel para comparar.</p>
        <p className="text-xs mt-2">Crie seu primeiro snapshot para ativar o comparador.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 bg-slate-950 p-2">
      {/* Selector duplo */}
      <div className="flex gap-3 px-3 py-2 bg-slate-900 border-b border-slate-800">
        <label className="flex items-center gap-2 text-xs text-slate-300">
          Antes:
          <select
            data-testid="compare-snap1-select"
            value={selectedSnap1Id}
            onChange={(e) => onSelectSnap1(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs"
          >
            {snapshots.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.capturedAt).toLocaleDateString()} ({s.source ?? "manual"})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          Agora:
          <select
            data-testid="compare-snap2-select"
            value={selectedSnap2Id}
            onChange={(e) => onSelectSnap2(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs"
          >
            {snapshots.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.capturedAt).toLocaleDateString()} ({s.source ?? "manual"})
              </option>
            ))}
          </select>
        </label>
      </div>

      {compareResponse && (
        <div className="flex flex-col gap-2">
          {compareResponse.groups.map((group) => (
            <div key={group.id} className="border border-slate-800 rounded-md overflow-hidden">
              <div className="bg-emerald-900/40 border-b border-emerald-800 px-3 py-1.5 text-emerald-100 text-sm font-semibold">
                {group.name}
              </div>
              <div className="bg-slate-950 divide-y divide-slate-800">
                {group.stats.map((s) => (
                  <div
                    key={s.id}
                    data-testid={`compare-cell-${s.id}`}
                    className={`grid grid-cols-5 gap-2 px-3 py-1.5 text-xs border-l-2 ${statusAccent(s.status)}`}
                  >
                    <span className="font-medium truncate">{s.label}</span>
                    <span className="text-slate-400">
                      {s.target.min}-{s.target.max}
                      {s.unit === "pct" ? "%" : ""}
                    </span>
                    <span className="text-right">
                      {s.snap1Value === null ? "—" : s.snap1Value.toString()}
                    </span>
                    <span className="text-right">
                      {s.snap2Value === null ? "—" : s.snap2Value.toString()}
                    </span>
                    <span
                      data-testid={`compare-trend-${s.id}`}
                      className="text-right tabular-nums"
                    >
                      {s.trendIcon ?? "—"}
                      {s.delta !== null && (
                        <span className="text-slate-400 ml-1">
                          {s.delta > 0 ? `+${s.delta}` : `${s.delta}`}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
