// =============================================================================
// Sprint F3 — Stats Analyzer / Snapshot Editor
// Spec: Docs/specs/sprint-f3-stats-analyzer.md (RF-03)
// =============================================================================

import { useState, useMemo, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface HudStatField {
  key: string;
  label: string;
  decimals: number;
  suffix?: string;
  // F3 legado
  min?: number;
  max?: number;
  // F4 NOVO — input validation explicit
  inputMin?: number;
  inputMax?: number;
  // F4 NOVO — target estrategico
  targetMin?: number;
  targetMax?: number;
  targetRef?: string;
  group?: string;
  subGroup?: string;
}

export interface HudSection {
  label: string;
  stats: HudStatField[];
  sortOrder: number;
}

export function getInputRange(field: HudStatField): { min: number; max: number } {
  return {
    min: field.inputMin ?? field.min ?? 0,
    max: field.inputMax ?? field.max ?? 100,
  };
}

export function getInlineTarget(field: HudStatField): { min: number; max: number } | null {
  if (typeof field.targetMin === "number" && typeof field.targetMax === "number") {
    return { min: field.targetMin, max: field.targetMax };
  }
  return null;
}

export function classifyVsInlineTarget(
  value: number | null,
  field: HudStatField,
): "below_range" | "in_range" | "above_range" | null {
  if (typeof value !== "number") return null;
  const t = getInlineTarget(field);
  if (!t) return null;
  if (value < t.min) return "below_range";
  if (value > t.max) return "above_range";
  return "in_range";
}

export interface HudLayout {
  id: string;
  name: string;
  isDefault: boolean;
  sections: HudSection[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: HudLayout | null;
  onSaved?: () => void;
}

export default function StatsSnapshotEditor({
  open,
  onOpenChange,
  layout,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  // F4: sample size por stat (em adicao ao global).
  const [sampleSizesPerStat, setSampleSizesPerStat] = useState<Record<string, string>>(
    {},
  );
  const [sampleSize, setSampleSize] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (open) {
      setValues({});
      setSampleSizesPerStat({});
      setSampleSize("");
      setNotes("");
    }
  }, [open, layout?.id]);

  const allStats = useMemo(() => {
    if (!layout) return [];
    return [...layout.sections]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .flatMap((s) => s.stats.map((stat) => ({ ...stat, sectionLabel: s.label })));
  }, [layout]);

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      return apiRequest("POST", "/api/hud-stat-snapshots", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hud-stat-snapshots"] });
      toast({ title: "Snapshot salvo", description: "Stats registradas." });
      onOpenChange(false);
      onSaved?.();
    },
    onError: (err: any) => {
      toast({
        title: "Erro",
        description: err?.message ?? "Falha ao salvar snapshot.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!layout) return;
    // F4: values envia formato hibrido. Se sampleSize por stat preenchido,
    // envia { value, sampleSize }; senao envia number puro.
    const finalValues: Record<string, number | null | { value: number | null; sampleSize: number | null }> = {};
    let hasAny = false;
    for (const stat of allStats) {
      const rawValue = values[stat.key];
      const rawN = rawValue === undefined || rawValue === "" ? null : Number(rawValue);
      if (rawValue !== undefined && rawValue !== "" && Number.isNaN(rawN as number)) {
        toast({
          title: "Valor invalido",
          description: `${stat.label} nao e numero.`,
          variant: "destructive",
        });
        return;
      }
      const { min, max } = getInputRange(stat);
      if (typeof rawN === "number" && (rawN < min || rawN > max)) {
        toast({
          title: "Valor fora do range",
          description: `${stat.label}: ${min}-${max}`,
          variant: "destructive",
        });
        return;
      }
      const rawSize = sampleSizesPerStat[stat.key];
      const sizeN = rawSize ? Number(rawSize) : null;
      if (rawSize && (Number.isNaN(sizeN as number) || (sizeN as number) < 0)) {
        toast({
          title: "Sample size invalido",
          description: `${stat.label}: deve ser numero >= 0`,
          variant: "destructive",
        });
        return;
      }
      if (rawN === null && sizeN === null) {
        // Stat nao preenchida — pula.
        continue;
      }
      if (sizeN !== null) {
        finalValues[stat.key] = { value: rawN, sampleSize: sizeN };
      } else {
        finalValues[stat.key] = rawN;
      }
      if (rawN !== null) hasAny = true;
    }
    if (!hasAny) {
      toast({
        title: "Snapshot vazio",
        description: "Preencha pelo menos uma stat.",
        variant: "destructive",
      });
      return;
    }
    mutation.mutate({
      layoutId: layout.id,
      values: finalValues,
      sampleSize: sampleSize ? Number(sampleSize) : undefined,
      notes: notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        data-testid="stats-snapshot-editor"
      >
        <DialogHeader>
          <DialogTitle>Novo Snapshot</DialogTitle>
          <DialogDescription>
            {layout ? `Layout: ${layout.name}` : "Selecione um layout."}
          </DialogDescription>
        </DialogHeader>

        {layout && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {allStats.map((stat) => {
                const inputRange = getInputRange(stat);
                const target = getInlineTarget(stat);
                const valueNum =
                  values[stat.key] !== undefined && values[stat.key] !== ""
                    ? Number(values[stat.key])
                    : null;
                const status = classifyVsInlineTarget(
                  Number.isFinite(valueNum as number) ? (valueNum as number) : null,
                  stat,
                );
                const valueColor =
                  status === "in_range"
                    ? "border-green-600/60"
                    : status === "below_range"
                    ? "border-red-600/60"
                    : status === "above_range"
                    ? "border-yellow-600/60"
                    : "";
                return (
                  <div key={stat.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`stat-${stat.key}`} className="text-sm">
                        {stat.label}
                        {stat.suffix ? ` (${stat.suffix})` : ""}
                      </Label>
                      {target && (
                        <span
                          data-testid={`stat-target-${stat.key}`}
                          className="text-[10px] text-gray-500 font-mono"
                        >
                          target: {target.min}-{target.max}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        id={`stat-${stat.key}`}
                        data-testid={`stat-input-${stat.key}`}
                        type="number"
                        step={
                          stat.decimals === 0
                            ? "1"
                            : `0.${"0".repeat(Math.max(0, stat.decimals - 1))}1`
                        }
                        min={inputRange.min}
                        max={inputRange.max}
                        value={values[stat.key] ?? ""}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [stat.key]: e.target.value }))
                        }
                        placeholder={`${inputRange.min}-${inputRange.max}`}
                        className={`flex-1 ${valueColor}`}
                      />
                      <Input
                        data-testid={`stat-sample-${stat.key}`}
                        type="number"
                        min={0}
                        value={sampleSizesPerStat[stat.key] ?? ""}
                        onChange={(e) =>
                          setSampleSizesPerStat((s) => ({
                            ...s,
                            [stat.key]: e.target.value,
                          }))
                        }
                        placeholder="n"
                        className="w-20 text-xs"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="space-y-1">
                <Label htmlFor="sampleSize">Sample size (maos)</Label>
                <Input
                  id="sampleSize"
                  data-testid="sample-size-input"
                  type="number"
                  min={1}
                  value={sampleSize}
                  onChange={(e) => setSampleSize(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                data-testid="notes-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contexto, periodo, observacoes..."
                rows={2}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="snapshot-cancel"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!layout || mutation.isPending}
            data-testid="snapshot-save"
          >
            {mutation.isPending ? "Salvando..." : "Salvar snapshot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
