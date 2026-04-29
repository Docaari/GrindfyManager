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
          <p className="text-sm text-gray-400">Carregando comparacao...</p>
        )}

        {error && (
          <p data-testid="compare-error" className="text-sm text-red-400">
            {error}
          </p>
        )}

        {payload && (
          <div className="space-y-3">
            <div className="text-xs text-gray-400">
              Layout: {payload.layoutName}
            </div>

            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-400 border-b border-gray-700/40 pb-1">
              <div className="col-span-4">Stat</div>
              <div className="col-span-3 text-right">Snapshot A</div>
              <div className="col-span-3 text-right">Snapshot B</div>
              <div className="col-span-2 text-right">Delta</div>
            </div>

            <div data-testid="compare-rows" className="space-y-1">
              {payload.diffs.map((d) => (
                <div
                  key={d.key}
                  data-testid={`compare-row-${d.key}`}
                  className="grid grid-cols-12 gap-2 text-sm items-center"
                >
                  <div className="col-span-4 font-mono text-gray-300">{d.key}</div>
                  <div className="col-span-3 text-right text-gray-200">
                    {fmt(d.a)}
                  </div>
                  <div className="col-span-3 text-right text-gray-200">
                    {fmt(d.b)}
                  </div>
                  <div
                    data-testid={`compare-delta-${d.key}`}
                    className={`col-span-2 text-right font-mono flex items-center justify-end gap-1 ${deltaColor(
                      d.delta,
                    )}`}
                  >
                    {deltaIcon(d.delta)}
                    {d.delta === null ? "—" : (d.delta > 0 ? "+" : "") + d.delta.toFixed(2)}
                  </div>
                </div>
              ))}
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
