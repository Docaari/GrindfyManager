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
  min?: number;
  max?: number;
  group?: string;
}

export interface HudSection {
  label: string;
  stats: HudStatField[];
  sortOrder: number;
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
  const [sampleSize, setSampleSize] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (open) {
      setValues({});
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
    const numericValues: Record<string, number | null> = {};
    let hasAny = false;
    for (const stat of allStats) {
      const raw = values[stat.key];
      if (raw === undefined || raw === "") {
        numericValues[stat.key] = null;
      } else {
        const n = Number(raw);
        if (Number.isNaN(n)) {
          toast({
            title: "Valor invalido",
            description: `${stat.label} nao e numero.`,
            variant: "destructive",
          });
          return;
        }
        const min = stat.min ?? 0;
        const max = stat.max ?? 100;
        if (n < min || n > max) {
          toast({
            title: "Valor fora do range",
            description: `${stat.label}: ${min}-${max}`,
            variant: "destructive",
          });
          return;
        }
        numericValues[stat.key] = n;
        hasAny = true;
      }
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
      values: numericValues,
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
              {allStats.map((stat) => (
                <div key={stat.key} className="space-y-1">
                  <Label htmlFor={`stat-${stat.key}`} className="text-sm">
                    {stat.label}
                    {stat.suffix ? ` (${stat.suffix})` : ""}
                  </Label>
                  <Input
                    id={`stat-${stat.key}`}
                    data-testid={`stat-input-${stat.key}`}
                    type="number"
                    step={stat.decimals === 0 ? "1" : `0.${"0".repeat(Math.max(0, stat.decimals - 1))}1`}
                    min={stat.min ?? 0}
                    max={stat.max ?? 100}
                    value={values[stat.key] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [stat.key]: e.target.value }))
                    }
                    placeholder={`${stat.min ?? 0}-${stat.max ?? 100}`}
                  />
                </div>
              ))}
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
