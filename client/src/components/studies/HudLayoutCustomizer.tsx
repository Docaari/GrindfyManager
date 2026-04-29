// =============================================================================
// Sprint F3 — Stats Analyzer / Layout Customizer
// Spec: Docs/specs/sprint-f3-stats-analyzer.md (RF-05)
//
// V1 simplificado: CRUD layout, add/remove section, add/remove stat field,
// rename, set default. Sem drag/drop sofisticado — usa botoes "↑/↓" para
// reordenar.
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import type { HudLayout, HudSection, HudStatField } from "./StatsSnapshotEditor";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: HudLayout | null;
  mode: "create" | "edit";
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "stat";

function emptyLayout(): HudLayout {
  return {
    id: "",
    name: "",
    isDefault: false,
    sections: [
      {
        label: "Pre-flop",
        sortOrder: 0,
        stats: [{ key: "vpip", label: "VPIP", decimals: 1, suffix: "%" }],
      },
    ],
  };
}

export default function HudLayoutCustomizer({
  open,
  onOpenChange,
  layout,
  mode,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<HudLayout>(emptyLayout());

  useEffect(() => {
    if (open) {
      setDraft(layout ? structuredClone(layout) : emptyLayout());
    }
  }, [open, layout]);

  const allKeys = useMemo(() => {
    const keys: string[] = [];
    for (const s of draft.sections) for (const stat of s.stats) keys.push(stat.key);
    return keys;
  }, [draft.sections]);

  const hasDuplicateKeys = useMemo(() => {
    const seen = new Set<string>();
    for (const k of allKeys) {
      if (seen.has(k)) return true;
      seen.add(k);
    }
    return false;
  }, [allKeys]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: draft.name,
        isDefault: draft.isDefault,
        sections: draft.sections,
      };
      if (mode === "create") {
        return apiRequest("POST", "/api/hud-layouts", payload);
      }
      return apiRequest("PUT", `/api/hud-layouts/${draft.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hud-layouts"] });
      toast({ title: mode === "create" ? "Layout criado" : "Layout atualizado" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: "Erro",
        description: err?.message ?? "Falha ao salvar layout.",
        variant: "destructive",
      });
    },
  });

  const updateSection = (idx: number, patch: Partial<HudSection>) => {
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= draft.sections.length) return;
    setDraft((d) => {
      const sections = [...d.sections];
      [sections[idx], sections[next]] = [sections[next], sections[idx]];
      return {
        ...d,
        sections: sections.map((s, i) => ({ ...s, sortOrder: i })),
      };
    });
  };

  const addSection = () => {
    setDraft((d) => ({
      ...d,
      sections: [
        ...d.sections,
        {
          label: "Nova secao",
          sortOrder: d.sections.length,
          stats: [{ key: `stat_${d.sections.length}`, label: "Stat", decimals: 1 }],
        },
      ],
    }));
  };

  const removeSection = (idx: number) => {
    if (draft.sections.length <= 1) {
      toast({
        title: "Nao permitido",
        description: "Layout precisa de pelo menos 1 secao.",
        variant: "destructive",
      });
      return;
    }
    setDraft((d) => ({
      ...d,
      sections: d.sections.filter((_, i) => i !== idx).map((s, i) => ({
        ...s,
        sortOrder: i,
      })),
    }));
  };

  const addStat = (sectionIdx: number) => {
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) =>
        i === sectionIdx
          ? {
              ...s,
              stats: [
                ...s.stats,
                { key: `stat_${s.stats.length}_${sectionIdx}`, label: "Nova stat", decimals: 1 },
              ],
            }
          : s,
      ),
    }));
  };

  const updateStat = (
    sectionIdx: number,
    statIdx: number,
    patch: Partial<HudStatField>,
  ) => {
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) =>
        i === sectionIdx
          ? {
              ...s,
              stats: s.stats.map((st, j) =>
                j === statIdx ? { ...st, ...patch } : st,
              ),
            }
          : s,
      ),
    }));
  };

  const removeStat = (sectionIdx: number, statIdx: number) => {
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) =>
        i === sectionIdx
          ? { ...s, stats: s.stats.filter((_, j) => j !== statIdx) }
          : s,
      ),
    }));
  };

  const handleSave = () => {
    if (!draft.name.trim()) {
      toast({
        title: "Nome obrigatorio",
        variant: "destructive",
      });
      return;
    }
    if (draft.sections.some((s) => s.stats.length === 0)) {
      toast({
        title: "Secao vazia",
        description: "Cada secao precisa de pelo menos 1 stat.",
        variant: "destructive",
      });
      return;
    }
    if (hasDuplicateKeys) {
      toast({
        title: "Keys duplicadas",
        description: "Cada stat precisa de uma key unica.",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        data-testid="hud-layout-customizer"
      >
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Novo layout" : `Editar: ${layout?.name ?? ""}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="sm:col-span-2 space-y-1">
              <Label htmlFor="layout-name">Nome</Label>
              <Input
                id="layout-name"
                data-testid="layout-name-input"
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value }))
                }
                placeholder="Ex: Custom MTT"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={draft.isDefault}
                onCheckedChange={(v) =>
                  setDraft((d) => ({ ...d, isDefault: v }))
                }
                data-testid="layout-default-toggle"
              />
              <Label className="text-sm">Default</Label>
            </div>
          </div>

          <div className="space-y-3">
            {draft.sections.map((section, sIdx) => (
              <div
                key={sIdx}
                data-testid={`section-${sIdx}`}
                className="bg-gray-800/60 border border-gray-700/40 rounded-md p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Input
                    data-testid={`section-label-${sIdx}`}
                    value={section.label}
                    onChange={(e) =>
                      updateSection(sIdx, { label: e.target.value })
                    }
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moveSection(sIdx, -1)}
                    disabled={sIdx === 0}
                    data-testid={`section-up-${sIdx}`}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moveSection(sIdx, 1)}
                    disabled={sIdx === draft.sections.length - 1}
                    data-testid={`section-down-${sIdx}`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-400"
                    onClick={() => removeSection(sIdx)}
                    data-testid={`section-remove-${sIdx}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  {section.stats.map((stat, stIdx) => (
                    <div
                      key={stIdx}
                      data-testid={`stat-${sIdx}-${stIdx}`}
                      className="grid grid-cols-12 gap-2 items-center"
                    >
                      <Input
                        data-testid={`stat-label-${sIdx}-${stIdx}`}
                        value={stat.label}
                        onChange={(e) => {
                          const label = e.target.value;
                          updateStat(sIdx, stIdx, {
                            label,
                            key: stat.key || slugify(label),
                          });
                        }}
                        placeholder="Label"
                        className="col-span-3"
                      />
                      <Input
                        data-testid={`stat-key-${sIdx}-${stIdx}`}
                        value={stat.key}
                        onChange={(e) =>
                          updateStat(sIdx, stIdx, { key: slugify(e.target.value) })
                        }
                        placeholder="key"
                        className="col-span-3 font-mono text-xs"
                      />
                      <Input
                        type="number"
                        value={stat.decimals}
                        onChange={(e) =>
                          updateStat(sIdx, stIdx, { decimals: Number(e.target.value) })
                        }
                        placeholder="dec"
                        className="col-span-1"
                      />
                      <Input
                        value={stat.suffix ?? ""}
                        onChange={(e) =>
                          updateStat(sIdx, stIdx, { suffix: e.target.value })
                        }
                        placeholder="%"
                        className="col-span-1"
                      />
                      <Input
                        type="number"
                        value={stat.min ?? ""}
                        onChange={(e) =>
                          updateStat(sIdx, stIdx, {
                            min: e.target.value === "" ? undefined : Number(e.target.value),
                          })
                        }
                        placeholder="min"
                        className="col-span-1"
                      />
                      <Input
                        type="number"
                        value={stat.max ?? ""}
                        onChange={(e) =>
                          updateStat(sIdx, stIdx, {
                            max: e.target.value === "" ? undefined : Number(e.target.value),
                          })
                        }
                        placeholder="max"
                        className="col-span-2"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 col-span-1"
                        onClick={() => removeStat(sIdx, stIdx)}
                        data-testid={`stat-remove-${sIdx}-${stIdx}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => addStat(sIdx)}
                    data-testid={`stat-add-${sIdx}`}
                    className="text-xs"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Adicionar stat
                  </Button>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              onClick={addSection}
              data-testid="section-add"
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova secao
            </Button>
          </div>

          {hasDuplicateKeys && (
            <p
              data-testid="duplicate-keys-warn"
              className="text-xs text-red-400"
            >
              Existem keys duplicadas. Cada stat precisa de uma key unica.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending || hasDuplicateKeys}
            data-testid="layout-save"
          >
            {saveMutation.isPending ? "Salvando..." : "Salvar layout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
