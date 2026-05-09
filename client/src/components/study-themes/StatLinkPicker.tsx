/**
 * Sprint stats-themes-linking-1 — RF-04 StatLinkPicker.
 *
 * Multi-select de stats HUD para vincular a um tema. Usado em config drawer.
 * Spec: Docs/specs/stats-themes-linking-1.md §RF-04.
 *
 * Props:
 *   - themeId
 *   - initialStatIds: string[]
 *   - onSave: (ids: string[]) => Promise<void>
 *   - customStats?: HudLayoutFieldEntry[]
 *
 * Comportamento:
 *   - Render chips com botao X (aria-label "Remover {label}").
 *   - Combobox para adicionar (filtra por label/grupo).
 *   - Cap soft 30 (toast warning + bloqueio).
 *   - Save chama onSave(ids).
 *   - Backend 400 invalidIds: toast com lista, remove chips invalidos visualmente.
 *   - Custom stats com badge "Custom".
 */

import { useMemo, useState } from "react";
import {
  HUD_STAT_CATALOG,
  HUD_GROUP_LABELS,
  type StatField,
  type HudGroupId,
} from "@shared/hud-stat-catalog";
import { useToast } from "@/hooks/use-toast";

interface CustomStatLite {
  id: string;
  label?: string;
  group?: string;
  isCustom?: boolean;
  unit?: string;
  direction?: string;
  targetMin?: number;
  targetMax?: number;
}

interface StatLinkPickerProps {
  themeId: string;
  initialStatIds: string[];
  onSave: (ids: string[]) => Promise<void>;
  customStats?: CustomStatLite[];
}

const SOFT_CAP = 30;

export function StatLinkPicker({
  themeId: _themeId,
  initialStatIds,
  onSave,
  customStats = [],
}: StatLinkPickerProps) {
  const { toast } = useToast();
  const [ids, setIds] = useState<string[]>(initialStatIds);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Index todas as stats (catalog + custom) por id para resolver labels rapido.
  const statById = useMemo(() => {
    const map = new Map<string, { id: string; label: string; group: string; isCustom: boolean }>();
    for (const s of HUD_STAT_CATALOG) {
      map.set(s.id, { id: s.id, label: s.label, group: s.group, isCustom: false });
    }
    for (const c of customStats) {
      map.set(c.id, {
        id: c.id,
        label: c.label ?? c.id,
        group: c.group ?? "basics",
        isCustom: true,
      });
    }
    return map;
  }, [customStats]);

  const remove = (id: string) => {
    setIds((cur) => cur.filter((s) => s !== id));
  };

  const add = (id: string) => {
    if (ids.includes(id)) return;
    if (ids.length >= SOFT_CAP) {
      toast({
        title: "Limite atingido",
        description: `Maximo de ${SOFT_CAP} stats por tema.`,
        variant: "destructive",
      });
      return;
    }
    setIds((cur) => [...cur, id]);
    setSearch("");
    setOpen(false);
  };

  // Filter Combobox options.
  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all: Array<{ id: string; label: string; group: string; isCustom: boolean }> = [];
    // Custom primeiro.
    for (const c of customStats) {
      if (ids.includes(c.id)) continue;
      all.push({
        id: c.id,
        label: c.label ?? c.id,
        group: c.group ?? "basics",
        isCustom: true,
      });
    }
    for (const s of HUD_STAT_CATALOG) {
      if (ids.includes(s.id)) continue;
      all.push({ id: s.id, label: s.label, group: s.group, isCustom: false });
    }
    if (!q) return all;
    return all.filter((opt) => {
      if (opt.label.toLowerCase().includes(q)) return true;
      if (opt.id.toLowerCase().includes(q)) return true;
      const gLabel =
        (HUD_GROUP_LABELS as any)[opt.group as HudGroupId] ?? opt.group;
      return String(gLabel).toLowerCase().includes(q);
    });
  }, [search, ids, customStats]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(ids);
      toast({ title: "Stats vinculadas atualizadas" });
    } catch (err: any) {
      const invalidIds: string[] | undefined = err?.invalidIds;
      if (Array.isArray(invalidIds) && invalidIds.length > 0) {
        toast({
          title: "Stats invalidas",
          description: invalidIds.join(", "),
          variant: "destructive",
        });
        setIds((cur) => cur.filter((s) => !invalidIds.includes(s)));
      } else {
        toast({
          title: "Erro ao salvar",
          description: err?.message ?? "Tente novamente.",
          variant: "destructive",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="stat-link-picker" className="space-y-3">
      <div className="text-sm text-muted-foreground">
        Stats foco do tema ({ids.length}/{SOFT_CAP})
      </div>
      {/* Chips de stats selecionadas */}
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => {
          const stat = statById.get(id) ?? {
            id,
            label: id,
            group: "basics",
            isCustom: false,
          };
          const groupLabel =
            (HUD_GROUP_LABELS as any)[stat.group as HudGroupId] ?? stat.group;
          return (
            <div
              key={id}
              data-testid={`stat-chip-${id}`}
              className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-sm"
            >
              <span className="font-medium">{stat.label}</span>
              <span className="text-xs text-muted-foreground">{groupLabel}</span>
              {stat.isCustom && (
                <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-600">
                  Custom
                </span>
              )}
              <button
                type="button"
                aria-label={`Remover stat ${stat.label}`}
                onClick={() => remove(id)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace") remove(id);
                }}
                className="ml-1 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* Plus button para abrir Combobox */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded border border-dashed px-3 py-1 text-sm hover:bg-muted"
        >
          + Adicionar stat
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>

      {open && (
        <div className="rounded border bg-card p-2">
          <input
            type="text"
            placeholder="Buscar stat ou grupo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2 w-full rounded border px-2 py-1 text-sm"
          />
          <div role="listbox" className="max-h-64 overflow-auto">
            {filteredOptions.slice(0, 50).map((opt) => {
              const groupLabel =
                (HUD_GROUP_LABELS as any)[opt.group as HudGroupId] ?? opt.group;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => add(opt.id)}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-muted"
                >
                  <span>{opt.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {groupLabel}
                    {opt.isCustom && (
                      <span className="ml-2 rounded bg-blue-500/10 px-1 py-0.5 text-[10px] text-blue-600">
                        Custom
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <div className="p-2 text-sm text-muted-foreground">
                Nenhuma stat encontrada.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default StatLinkPicker;
