/**
 * Sprint stats-themes-linking-1 — RF-08.6 ThemeLinkPicker.
 *
 * Multi-select de temas do user para vincular a um custom field do HUD.
 * Spec: Docs/specs/stats-themes-linking-1.md §RF-08.6.
 *
 * Props:
 *   - customStatId: string
 *   - initialThemeIds: string[]
 *   - onChange: (ids: string[]) => void
 *
 * Cap soft 10 (toast warning); hard cap 20 backend.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface ThemeLite {
  id: string;
  name: string;
  slug?: string;
  category?: string | null;
}

type ThemeLinkSaveStatus = "idle" | "saving" | "saved" | "error";

interface ThemeLinkPickerProps {
  customStatId: string;
  initialThemeIds: string[];
  onChange: (ids: string[]) => void;
  // Polish #9: parent com mutation async pode espelhar status aqui pra
  // feedback inline (saving/saved/error). Default "idle" — picker continua
  // funcionando como controlled puro quando parent nao precisa do indicador.
  saveStatus?: ThemeLinkSaveStatus;
  saveError?: string | null;
}

const SOFT_CAP = 10;
const HARD_CAP = 20;

export function ThemeLinkPicker({
  customStatId: _customStatId,
  initialThemeIds,
  onChange,
  saveStatus = "idle",
  saveError = null,
}: ThemeLinkPickerProps) {
  const { toast } = useToast();
  const [ids, setIds] = useState<string[]>(initialThemeIds);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery<ThemeLite[]>({
    queryKey: ["/api/study-themes"],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const themes: ThemeLite[] = Array.isArray(data) ? data : [];

  const themeById = useMemo(() => {
    const map = new Map<string, ThemeLite>();
    for (const t of themes) map.set(t.id, t);
    return map;
  }, [themes]);

  const update = (next: string[]) => {
    setIds(next);
    onChange(next);
  };

  const remove = (id: string) => {
    update(ids.filter((x) => x !== id));
  };

  const add = (id: string) => {
    if (ids.includes(id)) return;
    if (ids.length >= HARD_CAP) {
      // #8 Polish: descricao explicativa.
      toast({
        title: "Limite atingido",
        description: `Maximo de ${HARD_CAP} temas por stat custom. Mais que isso e a stat perde contexto.`,
        variant: "destructive",
      });
      return;
    }
    if (ids.length >= SOFT_CAP) {
      // #8 Polish: descricao educacional.
      toast({
        title: "Aviso",
        description: `Voce ja vinculou ${ids.length} temas. Considerar consolidar para manter foco.`,
      });
    }
    update([...ids, id]);
    setSearch("");
    // #4 Polish: NAO fechar popover apos add — multi-select rapido.
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = themes.filter((t) => !ids.includes(t.id));
    if (!q) return out;
    return out.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.category ?? "").toLowerCase().includes(q),
    );
  }, [themes, ids, search]);

  // Polish #9: indicador inline (texto + ponto colorido) reage a saveStatus.
  // Parent passa estado da mutation; idle = sem indicador.
  const indicator = (() => {
    if (saveStatus === "saving") {
      return { dot: "bg-amber-500", text: "Salvando...", color: "text-muted-foreground" };
    }
    if (saveStatus === "saved") {
      return { dot: "bg-emerald-500", text: "Salvo", color: "text-emerald-600" };
    }
    if (saveStatus === "error") {
      return {
        dot: "bg-destructive",
        text: saveError ?? "Erro ao salvar",
        color: "text-destructive",
      };
    }
    return null;
  })();

  return (
    <div data-testid="theme-link-picker" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Linkar a temas ({ids.length}/{HARD_CAP})
        </div>
        {indicator && (
          <div
            data-testid="theme-link-save-indicator"
            data-status={saveStatus}
            role="status"
            aria-live="polite"
            className={`inline-flex items-center gap-1.5 text-[11px] ${indicator.color}`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${indicator.dot}${
                saveStatus === "saving" ? " animate-pulse" : ""
              }`}
            />
            <span>{indicator.text}</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => {
          const theme = themeById.get(id);
          const label = theme?.name ?? id;
          return (
            <div
              key={id}
              data-testid={`theme-chip-${id}`}
              className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-sm"
            >
              <span>{label}</span>
              {theme?.category && (
                <span className="rounded bg-background px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                  {theme.category}
                </span>
              )}
              <button
                type="button"
                aria-label={`Remover ${label}`}
                onClick={() => remove(id)}
                className="ml-1 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-dashed px-3 py-1 text-sm hover:bg-muted"
      >
        + Adicionar tema
      </button>

      {open && (
        <div className="rounded border bg-card p-2">
          {/* #4 Polish: contador inline acima do input. */}
          <div className="mb-1 px-1 text-[10px] text-muted-foreground">
            {ids.length} selecionada{ids.length === 1 ? "" : "s"}
          </div>
          <input
            type="text"
            placeholder="Buscar tema…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2 w-full rounded border px-2 py-1 text-sm"
          />
          {isLoading && (
            <div className="p-2 text-sm text-muted-foreground">Carregando…</div>
          )}
          <div role="listbox" className="max-h-48 overflow-auto">
            {filtered.slice(0, 50).map((t) => (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => add(t.id)}
                className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-muted"
              >
                <span>{t.name}</span>
                {t.category && (
                  <span className="text-xs text-muted-foreground">
                    {t.category}
                  </span>
                )}
              </button>
            ))}
            {filtered.length === 0 && !isLoading && (
              <div className="p-2 text-sm text-muted-foreground">
                Nenhum tema encontrado.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ThemeLinkPicker;
