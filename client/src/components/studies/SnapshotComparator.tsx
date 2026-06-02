// =============================================================================
// Sprint F3 — Stats Analyzer / Snapshot Comparator
// Spec: Docs/specs/sprint-f3-stats-analyzer.md (RF-06)
// =============================================================================

import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

export interface ComparePayload {
  layoutId: string;
  layoutName: string;
  a: { id: string; capturedAt: string; sampleSize: number | null };
  b: { id: string; capturedAt: string; sampleSize: number | null };
  diffs: Array<{
    key: string;
    a: number | null;
    b: number | null;
    delta: number | null;
    // F4 NOVO
    aSampleSize?: number | null;
    bSampleSize?: number | null;
    target?: { min: number; max: number } | null;
    vsTarget?: "below_range" | "in_range" | "above_range" | null;
  }>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ids: [string, string] | null;
}

function fmt(v: number | null, decimals = 1) {
  if (v === null || v === undefined) return "—";
  return v.toFixed(decimals);
}

function deltaIcon(delta: number | null) {
  if (delta === null || Math.abs(delta) < 0.01) return <Minus className="w-3 h-3" />;
  if (delta > 0) return <ArrowUp className="w-3 h-3" />;
  return <ArrowDown className="w-3 h-3" />;
}

function deltaColor(delta: number | null) {
  if (delta === null || Math.abs(delta) < 0.01) return "text-gray-400";
  if (delta > 0) return "text-green-400";
  return "text-red-400";
}

export default function SnapshotComparator({ open, onOpenChange, ids }: Props) {
  const [payload, setPayload] = useState<ComparePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compareMutation = useMutation({
    mutationFn: async (pair: [string, string]) =>
      apiRequest("POST", "/api/hud-stat-snapshots/compare", { ids: pair }),
    onSuccess: (data: any) => {
      setPayload(data);
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.message ?? "Falha ao comparar.");
      setPayload(null);
    },
  });

  useEffect(() => {
    if (open && ids) {
      setPayload(null);
      setError(null);
      compareMutation.mutate(ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ids?.[0], ids?.[1]]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        data-testid="snapshot-comparator"
      >
        <DialogHeader>
          <DialogTitle>Comparar snapshots</DialogTitle>
        </DialogHeader>

        {compareMutation.isPending && (
          <p className="text-sm text-muted-foreground">Carregando comparacao...</p>
        )}

        {error && (
          <p data-testid="compare-error" className="text-sm text-red-400">
            {error}
          </p>
        )}

        {payload && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Layout: {payload.layoutName}
            </div>

            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground border-b border-border pb-1">
              <div className="col-span-3">Stat</div>
              <div className="col-span-2 text-right">Target</div>
              <div className="col-span-2 text-right">A</div>
              <div className="col-span-2 text-right">B</div>
              <div className="col-span-1 text-right">vs</div>
              <div className="col-span-2 text-right">Delta</div>
            </div>

            <div data-testid="compare-rows" className="space-y-1">
              {payload.diffs.map((d) => {
                const targetStr = d.target ? `${d.target.min}-${d.target.max}` : "—";
                const vsColor =
                  d.vsTarget === "in_range"
                    ? "text-green-400"
                    : d.vsTarget === "below_range"
                    ? "text-red-400"
                    : d.vsTarget === "above_range"
                    ? "text-yellow-400"
                    : "text-gray-500";
                const vsLabel =
                  d.vsTarget === "in_range"
                    ? "OK"
                    : d.vsTarget === "below_range"
                    ? "↓"
                    : d.vsTarget === "above_range"
                    ? "↑"
                    : "—";
                return (
                  <div
                    key={d.key}
                    data-testid={`compare-row-${d.key}`}
                    className="grid grid-cols-12 gap-2 text-sm items-center"
                  >
                    <div className="col-span-3 font-mono text-foreground text-xs">{d.key}</div>
                    <div
                      data-testid={`compare-target-${d.key}`}
                      className="col-span-2 text-right text-muted-foreground font-mono text-xs"
                    >
                      {targetStr}
                    </div>
                    <div className="col-span-2 text-right text-foreground">
                      {fmt(d.a)}
                      {d.aSampleSize ? (
                        <span className="text-[9px] text-muted-foreground ml-1">n={d.aSampleSize}</span>
                      ) : null}
                    </div>
                    <div className="col-span-2 text-right text-foreground">
                      {fmt(d.b)}
                      {d.bSampleSize ? (
                        <span className="text-[9px] text-muted-foreground ml-1">n={d.bSampleSize}</span>
                      ) : null}
                    </div>
                    <div
                      data-testid={`compare-vs-${d.key}`}
                      className={`col-span-1 text-right font-mono text-xs ${vsColor}`}
                    >
                      {vsLabel}
                    </div>
                    <div
                      data-testid={`compare-delta-${d.key}`}
                      className={`col-span-2 text-right font-mono text-xs flex items-center justify-end gap-1 ${deltaColor(
                        d.delta,
                      )}`}
                    >
                      {deltaIcon(d.delta)}
                      {d.delta === null ? "—" : (d.delta > 0 ? "+" : "") + d.delta.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="comparator-close"
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
