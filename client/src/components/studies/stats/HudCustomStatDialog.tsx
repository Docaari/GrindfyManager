// =============================================================================
// Sprint Stats-V3 — HudCustomStatDialog (RF-07)
//
// Dialog para criar custom stat (label, group, target range, direction, unit).
//
// Polish round (2026-05-09):
//   - #3 Migrado para Radix Dialog (focus trap + aria-modal + Esc + restore foco).
//   - #5 Tokens UI: removido slate-* / emerald-* hardcoded; usa bg-card,
//     border-border, text-foreground, text-muted-foreground, bg-primary,
//     text-destructive (Docs/conventions/ui-patterns.md).
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
// CRITICAL-1 reviewer: ThemeLinkPicker — passo opcional "Linkar a temas".
import { ThemeLinkPicker } from "@/components/study-themes/ThemeLinkPicker";

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
  // CRITICAL-1 reviewer: temas linkados ao novo custom field (write-through RF-08).
  const [linkedThemes, setLinkedThemes] = React.useState<string[]>([]);
  const { toast } = useToast();

  React.useEffect(() => {
    setGroupId(initialGroupId);
  }, [initialGroupId, open]);

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
      const result: any = await apiRequest(
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

      // CRITICAL-1 reviewer: se user linkou temas, faz PATCH no layout para
      // setar linkedThemes no fieldsJson recem criado. PATCH dispara
      // appendStatToThemes write-through (RF-08.3) automatic.
      if (linkedThemes.length > 0) {
        try {
          // Carrega layout atual para preservar fields existentes + adiciona
          // linkedThemes ao novo custom field.
          const layoutResp: any = await apiRequest(
            "GET",
            `/api/hud-layouts/${layoutId}`,
          );
          const fields = Array.isArray(layoutResp?.fieldsJson)
            ? layoutResp.fieldsJson
            : Array.isArray(layoutResp?.fields_json)
              ? layoutResp.fields_json
              : [];
          // Encontra o field recem-criado pelo id retornado.
          const newFieldId =
            (result && (result.id ?? result?.fieldId)) ?? id;
          const updated = fields.map((f: any) =>
            f?.id === newFieldId
              ? { ...f, linkedThemes: [...linkedThemes] }
              : f,
          );
          await apiRequest("PATCH", `/api/hud-layouts/${layoutId}`, {
            fieldsJson: updated,
          });
        } catch (linkErr: any) {
          // Best effort — custom stat ja criada; user pode editar depois.
          toast({
            title: "Stat criada, mas link com temas falhou",
            description: linkErr?.message ?? "Tente editar depois.",
            variant: "destructive" as any,
          });
        }
      }

      try {
        queryClient.invalidateQueries({ queryKey: ["hud-layouts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/study-themes"] });
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar stat custom</DialogTitle>
          <DialogDescription>
            Crie uma stat personalizada com target range proprio. Opcionalmente
            linke a temas de estudo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Grupo
            <select
              data-testid="custom-stat-group"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value as HudGroupId)}
              className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
            >
              {HUD_GROUP_IDS.map((g) => (
                <option key={g} value={g}>
                  {HUD_GROUP_LABELS[g]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Label
            <input
              type="text"
              data-testid="custom-stat-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
              className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Target min
              <input
                type="number"
                data-testid="custom-stat-target-min"
                value={targetMin}
                onChange={(e) => setTargetMin(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Target max
              <input
                type="number"
                data-testid="custom-stat-target-max"
                value={targetMax}
                onChange={(e) => setTargetMax(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Direction
              <select
                data-testid="custom-stat-direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
              >
                <option value="context">context</option>
                <option value="higher_better">higher_better</option>
                <option value="lower_better">lower_better</option>
                <option value="neutral">neutral</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Unit
              <select
                data-testid="custom-stat-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
              >
                <option value="pct">pct</option>
                <option value="bb">bb</option>
                <option value="count">count</option>
              </select>
            </label>
          </div>

          {/* CRITICAL-1 reviewer: passo opcional "Linkar a temas" (RF-08.6). */}
          <div className="border-t border-border pt-3 mt-1">
            <ThemeLinkPicker
              customStatId="__pending__"
              initialThemeIds={linkedThemes}
              onChange={setLinkedThemes}
            />
          </div>

          {error && (
            <p
              data-testid="custom-stat-error"
              className="text-xs text-destructive"
            >
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 text-xs border border-border bg-transparent text-foreground rounded hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="custom-stat-submit"
            onClick={handleSubmit}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90"
          >
            Criar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
