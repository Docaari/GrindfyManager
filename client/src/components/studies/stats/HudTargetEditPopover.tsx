// =============================================================================
// Sprint Stats-V3 — HudTargetEditPopover (RF-05)
//
// Inline edit de target range (min/max) com validacao + PUT layout.
// =============================================================================

import React from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface HudTargetEditPopoverProps {
  layoutId: string;
  statId: string;
  initialMin: number;
  initialMax: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function HudTargetEditPopover({
  layoutId,
  statId,
  initialMin,
  initialMax,
  open,
  onOpenChange,
}: HudTargetEditPopoverProps) {
  const [minVal, setMinVal] = React.useState<string>(String(initialMin));
  const [maxVal, setMaxVal] = React.useState<string>(String(initialMax));
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    setMinVal(String(initialMin));
    setMaxVal(String(initialMax));
    setError(null);
  }, [initialMin, initialMax, open]);

  if (!open) return null;

  const validate = (): { min: number; max: number } | null => {
    const minN = Number(minVal);
    const maxN = Number(maxVal);
    if (Number.isNaN(minN) || Number.isNaN(maxN)) {
      setError("Valores devem ser numericos.");
      return null;
    }
    if (minN < 0 || maxN > 100) {
      setError("Valores devem estar entre 0 e 100 (pct).");
      return null;
    }
    if (minN >= maxN) {
      setError("min deve ser menor que max.");
      return null;
    }
    setError(null);
    return { min: minN, max: maxN };
  };

  const handleSave = async () => {
    const valid = validate();
    if (!valid) return;
    try {
      await apiRequest("PUT", `/api/hud-layouts/${layoutId}/target-override`, {
        statId,
        min: valid.min,
        max: valid.max,
        targetOverride: { min: valid.min, max: valid.max },
      });
      try {
        queryClient.invalidateQueries({ queryKey: ["hud-layouts"] });
      } catch {
        /* invalidate eh best effort */
      }
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Erro ao salvar target",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive" as any,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  return (
    <div
      role="dialog"
      onKeyDown={handleKeyDown}
      className="bg-slate-900 border border-slate-700 rounded-md p-3 shadow-lg flex flex-col gap-2 w-64"
    >
      <p className="text-xs text-slate-300">Editar target — {statId}</p>
      <div className="flex gap-2 items-center">
        <label className="text-xs text-slate-400">min</label>
        <input
          type="number"
          data-testid="target-min-input"
          value={minVal}
          onChange={(e) => setMinVal(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 text-sm"
        />
        <label className="text-xs text-slate-400">max</label>
        <input
          type="number"
          data-testid="target-max-input"
          value={maxVal}
          onChange={(e) => setMaxVal(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 text-sm"
        />
      </div>
      {error && (
        <p
          data-testid="target-error"
          className="text-xs text-red-400"
        >
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-1">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="px-2 py-1 text-xs bg-slate-700 text-slate-200 rounded hover:bg-slate-600"
        >
          Cancelar
        </button>
        <button
          type="button"
          data-testid="target-save"
          onClick={handleSave}
          className="px-2 py-1 text-xs bg-emerald-700 text-white rounded hover:bg-emerald-600"
        >
          Salvar
        </button>
      </div>
    </div>
  );
}
