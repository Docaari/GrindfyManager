// =============================================================================
// Sprint Stats-V3 — HudCustomStatDialog (RF-07)
//
// Dialog para criar custom stat (label, group, target range, direction, unit).
// =============================================================================

import React from "react";
import { customAlphabet } from "nanoid";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  HUD_GROUP_IDS,
  HUD_GROUP_LABELS,
  type HudGroupId,
} from "../../../../../shared/hud-stat-catalog";

const NANOID_ALPHABET_LOWER = "abcdefghijklmnopqrstuvwxyz0123456789";
const generateCustomId = customAlphabet(NANOID_ALPHABET_LOWER, 8);

export interface HudCustomStatDialogProps {
  layoutId: string;
  groupId: HudGroupId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (field: any) => void;
}

export default function HudCustomStatDialog({
  layoutId,
  groupId: initialGroupId,
  open,
  onOpenChange,
  onCreated,
}: HudCustomStatDialogProps) {
  const [groupId, setGroupId] = React.useState<HudGroupId>(initialGroupId);
  const [label, setLabel] = React.useState<string>("");
  const [targetMin, setTargetMin] = React.useState<string>("0");
  const [targetMax, setTargetMax] = React.useState<string>("100");
  const [direction, setDirection] = React.useState<string>("context");
  const [unit, setUnit] = React.useState<string>("pct");
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    setGroupId(initialGroupId);
  }, [initialGroupId, open]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (label.trim().length < 3) {
      setError("Label precisa ter no minimo 3 caracteres.");
      return;
    }
    if (label.trim().length > 60) {
      setError("Label maximo 60 caracteres.");
      return;
    }
    const minN = Number(targetMin);
    const maxN = Number(targetMax);
    if (Number.isNaN(minN) || Number.isNaN(maxN) || minN >= maxN) {
      setError("Target invalido (min < max).");
      return;
    }
    setError(null);
    const id = `custom_${generateCustomId()}`;
    try {
      const result = await apiRequest(
        "POST",
        `/api/hud-layouts/${layoutId}/custom-stats`,
        {
          id,
          isCustom: true,
          groupId,
          label: label.trim(),
          targetMin: minN,
          targetMax: maxN,
          direction,
          unit,
        },
      );
      try {
        queryClient.invalidateQueries({ queryKey: ["hud-layouts"] });
      } catch {
        /* best effort */
      }
      onCreated?.(result);
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Erro ao criar custom stat",
        description: e?.message ?? "Tente novamente.",
        variant: "destructive" as any,
      });
    }
  };

  return (
    <div
      role="dialog"
      className="bg-slate-900 border border-slate-700 rounded-md p-4 shadow-lg flex flex-col gap-3 w-80"
    >
      <h3 className="text-sm font-semibold text-slate-100">Adicionar stat custom</h3>

      <label className="flex flex-col gap-1 text-xs text-slate-300">
        Grupo
        <select
          data-testid="custom-stat-group"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value as HudGroupId)}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100"
        >
          {HUD_GROUP_IDS.map((g) => (
            <option key={g} value={g}>
              {HUD_GROUP_LABELS[g]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-300">
        Label
        <input
          type="text"
          data-testid="custom-stat-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-slate-300">
          Target min
          <input
            type="number"
            data-testid="custom-stat-target-min"
            value={targetMin}
            onChange={(e) => setTargetMin(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-300">
          Target max
          <input
            type="number"
            data-testid="custom-stat-target-max"
            value={targetMax}
            onChange={(e) => setTargetMax(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-slate-300">
          Direction
          <select
            data-testid="custom-stat-direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100"
          >
            <option value="context">context</option>
            <option value="higher_better">higher_better</option>
            <option value="lower_better">lower_better</option>
            <option value="neutral">neutral</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-300">
          Unit
          <select
            data-testid="custom-stat-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100"
          >
            <option value="pct">pct</option>
            <option value="bb">bb</option>
            <option value="count">count</option>
          </select>
        </label>
      </div>

      {error && (
        <p
          data-testid="custom-stat-error"
          className="text-xs text-red-400"
        >
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 mt-1">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="px-3 py-1.5 text-xs bg-slate-700 text-slate-200 rounded hover:bg-slate-600"
        >
          Cancelar
        </button>
        <button
          type="button"
          data-testid="custom-stat-submit"
          onClick={handleSubmit}
          className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded hover:bg-emerald-600"
        >
          Criar
        </button>
      </div>
    </div>
  );
}
