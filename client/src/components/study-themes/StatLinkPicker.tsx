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
 *
 * Polish round (2026-05-09):
 *   - #1 Migracao Combobox hand-rolled -> cmdk Command + Popover (217 stats).
 *   - #4 add() NAO fecha popover (multi-select friendly + contador inline).
 *   - #8 Toasts educacionais nos caps (variant default + descricao explicativa).
 */

import { useMemo, useState } from "react";
import {
  HUD_STAT_CATALOG,
  HUD_GROUP_LABELS,
  type HudGroupId,
} from "@shared/hud-stat-catalog";
import { useToast } from "@/hooks/use-toast";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

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
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Index todas as stats (catalog + custom) por id para resolver labels rapido.
  const statById = useMemo(() => {
    const map = new Map<
      string,
      { id: string; label: string; group: string; isCustom: boolean }
    >();
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
      // #8 Polish: variant default + descricao explicativa (cap atingido).
      toast({
        title: "Limite atingido",
        description: `Maximo de ${SOFT_CAP} stats por tema (foco perde efeito alem disso). Remova alguma antes de adicionar.`,
      });
      return;
    }
    setIds((cur) => [...cur, id]);
    // #4 Polish: NAO fechar popover; permite multi-select rapido.
  };

  // Agrupa opcoes disponiveis (nao selecionadas) por grupo para CommandGroup.
  // Custom stats ficam em grupo dedicado primeiro.
  const groupedOptions = useMemo(() => {
    const customs: Array<{
      id: string;
      label: string;
      group: string;
      isCustom: boolean;
    }> = [];
    for (const c of customStats) {
      if (ids.includes(c.id)) continue;
      customs.push({
        id: c.id,
        label: c.label ?? c.id,
        group: c.group ?? "basics",
        isCustom: true,
      });
    }
    const byGroup = new Map<
      HudGroupId,
      Array<{ id: string; label: string; group: HudGroupId; isCustom: boolean }>
    >();
    for (const s of HUD_STAT_CATALOG) {
      if (ids.includes(s.id)) continue;
      const arr = byGroup.get(s.group) ?? [];
      arr.push({ id: s.id, label: s.label, group: s.group, isCustom: false });
      byGroup.set(s.group, arr);
    }
    return { customs, byGroup };
  }, [ids, customStats]);

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

      {/* Plus button + Save */}
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="rounded border border-dashed px-3 py-1 text-sm hover:bg-muted"
            >
              + Adicionar stat
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-80 p-0"
            align="start"
            sideOffset={4}
          >
            <Command
              filter={(value, search) => {
                // value contem id|label|groupLabel concatenados — fuzzy busca em tudo.
                const v = value.toLowerCase();
                const q = search.trim().toLowerCase();
                if (!q) return 1;
                return v.includes(q) ? 1 : 0;
              }}
            >
              <div className="border-b px-3 py-1.5 text-xs text-muted-foreground">
                {ids.length} selecionada{ids.length === 1 ? "" : "s"}
              </div>
              <CommandInput placeholder="Buscar stat..." />
              <CommandList>
                <CommandEmpty>Nenhuma stat encontrada.</CommandEmpty>
                {groupedOptions.customs.length > 0 && (
                  <CommandGroup heading="Suas stats custom">
                    {groupedOptions.customs.map((opt) => {
                      const groupLabel =
                        (HUD_GROUP_LABELS as any)[opt.group as HudGroupId] ??
                        opt.group;
                      return (
                        <CommandItem
                          key={opt.id}
                          value={`${opt.id}|${opt.label}|${groupLabel}`}
                          onSelect={() => add(opt.id)}
                          role="option"
                        >
                          <span className="flex-1">{opt.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {groupLabel}
                          </span>
                          <span className="ml-2 rounded bg-blue-500/10 px-1 py-0.5 text-[10px] text-blue-600">
                            Custom
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
                {Array.from(groupedOptions.byGroup.entries()).map(
                  ([groupId, opts]) => (
                    <CommandGroup
                      key={groupId}
                      heading={
                        (HUD_GROUP_LABELS as any)[groupId] ?? String(groupId)
                      }
                    >
                      {opts.map((opt) => {
                        const groupLabel =
                          (HUD_GROUP_LABELS as any)[opt.group] ?? opt.group;
                        return (
                          <CommandItem
                            key={opt.id}
                            value={`${opt.id}|${opt.label}|${groupLabel}`}
                            onSelect={() => add(opt.id)}
                            role="option"
                          >
                            <span className="flex-1">{opt.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {groupLabel}
                            </span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ),
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}

export default StatLinkPicker;
