// =============================================================================
// Sprint F3 — Stats Analyzer / Snapshot List
// Spec: Docs/specs/sprint-f3-stats-analyzer.md (RF-04)
// =============================================================================

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, BarChart3 } from "lucide-react";
import type { HudLayout } from "./StatsSnapshotEditor";

export interface HudStatSnapshot {
  id: string;
  layoutId: string;
  capturedAt: string;
  source: string;
  values: Record<string, number | null>;
  sampleSize: number | null;
  notes: string | null;
}

interface Props {
  snapshots: HudStatSnapshot[];
  layouts: HudLayout[];
  onDelete?: (id: string) => void;
  onCompare?: (id: string) => void;
  selectedForCompare?: string[];
}

function formatDateBR(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function StatsSnapshotList({
  snapshots,
  layouts,
  onDelete,
  onCompare,
  selectedForCompare = [],
}: Props) {
  const layoutById = useMemo(() => {
    const m = new Map<string, HudLayout>();
    for (const l of layouts) m.set(l.id, l);
    return m;
  }, [layouts]);

  if (snapshots.length === 0) {
    return (
      <div
        data-testid="snapshots-empty"
        className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6 text-center"
      >
        <BarChart3 className="w-8 h-8 text-gray-500 mx-auto mb-2" />
        <p className="text-gray-400 text-sm">
          Nenhum snapshot ainda. Salve seu primeiro acima.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="snapshots-list">
      {snapshots.map((snap) => {
        const layout = layoutById.get(snap.layoutId);
        const previewKeys = layout
          ? layout.sections
              .flatMap((s) => s.stats)
              .slice(0, 4)
              .map((s) => s.key)
          : Object.keys(snap.values).slice(0, 4);
        const isSelected = selectedForCompare.includes(snap.id);
        return (
          <Card
            key={snap.id}
            className={`bg-gray-800/80 border-gray-700/50 ${
              isSelected ? "border-poker-accent" : ""
            }`}
            data-testid={`snapshot-${snap.id}`}
          >
            <CardContent className="p-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-white">
                    {layout?.name ?? "Layout removido"}
                  </span>
                  <Badge variant="outline" className="text-[9px]">
                    {snap.source}
                  </Badge>
                  {snap.sampleSize && (
                    <Badge
                      variant="outline"
                      className="text-[9px] text-blue-400 border-blue-600/40"
                    >
                      {snap.sampleSize} maos
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-2">
                  {formatDateBR(snap.capturedAt)}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {previewKeys.map((k) => {
                    const v = snap.values[k];
                    return (
                      <span key={k} className="text-gray-300">
                        <span className="text-gray-500">{k}:</span>{" "}
                        <span className="font-mono">
                          {v === null || v === undefined ? "—" : v.toFixed(1)}
                        </span>
                      </span>
                    );
                  })}
                </div>
                {snap.notes && (
                  <p className="text-[11px] text-gray-500 italic mt-1 line-clamp-1">
                    {snap.notes}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {onCompare && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7"
                    onClick={() => onCompare(snap.id)}
                    data-testid={`snapshot-compare-${snap.id}`}
                  >
                    {isSelected ? "Selecionado" : "Comparar"}
                  </Button>
                )}
                {onDelete && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7 text-red-400 hover:text-red-300"
                    onClick={() => onDelete(snap.id)}
                    data-testid={`snapshot-delete-${snap.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
