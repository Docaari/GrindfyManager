// =============================================================================
// Sprint Stats-V3 — HudValueEditInput (RF-06)
//
// Inline edit de hero value com validacao por unit + PUT snapshot.
// =============================================================================

import React from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface HudValueEditInputProps {
  snapshotId: string;
  statId: string;
  initialValue: number | null;
  unit: "pct" | "bb" | "count";
  onComplete?: () => void;
}

function validateValue(value: number, unit: "pct" | "bb" | "count"): string | null {
  if (Number.isNaN(value)) return "Valor invalido.";
  if (unit === "pct") {
    if (value < 0 || value > 100) return "pct deve estar entre 0 e 100.";
  } else if (unit === "bb") {
    if (value < 0) return "bb deve ser >= 0.";
  } else if (unit === "count") {
    if (value < 0 || !Number.isFinite(value)) return "count deve ser >= 0.";
  }
  return null;
}

export default function HudValueEditInput({
  snapshotId,
  statId,
  initialValue,
  unit,
  onComplete,
}: HudValueEditInputProps) {
  const [value, setValue] = React.useState<string>(
    initialValue === null ? "" : String(initialValue),
  );
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  const submit = async () => {
    const num = Number(value);
    const err = validateValue(num, unit);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    try {
      await apiRequest(
        "PUT",
        `/api/stats-analyzer/snapshots/${snapshotId}`,
        { values: { [statId]: num } },
      );
      try {
        queryClient.invalidateQueries({ queryKey: ["hud-stat-snapshots"] });
      } catch {
        /* best effort */
      }
      onComplete?.();
    } catch (e: any) {
      toast({
        title: "Erro ao atualizar valor",
        description: e?.message ?? "Tente novamente.",
        variant: "destructive" as any,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setValue(initialValue === null ? "" : String(initialValue));
      setError(null);
      onComplete?.();
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <input
        type="number"
        step="0.1"
        data-testid="value-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 text-sm w-24"
      />
      {error && (
        <p
          data-testid="value-error"
          className="text-xs text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}
