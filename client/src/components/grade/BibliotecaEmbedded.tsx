// =============================================================================
// Sprint day-detail-zoom-1 — BibliotecaEmbedded (RF-03)
//
// Spec: Docs/specs/sprint-day-detail-zoom-1.md §RF-03.
// ADR: Docs/architecture/decisions/210-day-detail-zoom-architecture.md §3.
//
// Wrapper enxuto da biblioteca de torneios para uso dentro do DayDetailZoom.
// - useQuery(queryKey ['/api/tournament-library']) — cache compartilhado com
//   BibliotecaPanel.
// - Aplica chips contextuais auto-baseados em `contextFilters` (site, ABI±50%,
//   formato dominante).
// - Input busca debounce 300ms — emit `coach.day_zoom_search`.
// - Banner "biblioteca-too-many" quando >100 cards apos filtros.
// - ErrorBoundary INTERNA com fallback null (lesson #29) para hardening prod +
//   tests standalone sem QueryClientProvider.
// =============================================================================

import * as React from "react";
import { flushSync } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { X, Filter } from "lucide-react";
import { safeEmit } from "@/lib/safe-emit";
import { LibraryCard } from "@/components/grade-planner/LibraryCard";
import { getSiteColors } from "@/components/grade/siteColors";

const TOO_MANY_THRESHOLD = 100;
const SEARCH_DEBOUNCE_MS = 300;

export interface ContextFilters {
  site?: string;
  buyInMin?: number;
  buyInMax?: number;
  format?: string;
}

export interface BibliotecaEmbeddedProps {
  contextFilters: ContextFilters;
  dayOfWeek: number;
  profileLetter: "A" | "B" | "C";
  /** Mobile fallback: callback para click no botao "+" dentro do LibraryCard. */
  onAddToSlot?: (tournament: any) => void;
  /** Quando true, renderiza botao "+" em cada LibraryCard (mobile). */
  showAddInline?: boolean;
}

// ---------------------------------------------------------------------------
// ErrorBoundary local — fallback null silencioso (lesson #29, pattern Sidebar).
// ---------------------------------------------------------------------------
interface EBState {
  hasError: boolean;
}
class LocalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  EBState
> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    // Swallow — biblioteca opcional. Producao: no-op; logs ja capturam.
  }
  render() {
    if (this.state.hasError) return null;
    return <>{this.props.children}</>;
  }
}

// ---------------------------------------------------------------------------
// Inner — usa useQuery; protegido pelo ErrorBoundary acima.
// ---------------------------------------------------------------------------
function BibliotecaEmbeddedInner({
  contextFilters,
  dayOfWeek,
  profileLetter,
  onAddToSlot,
  showAddInline = false,
}: BibliotecaEmbeddedProps): React.ReactElement | null {
  const [chips, setChips] = React.useState<ContextFilters>(contextFilters);
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  // Filtros interativos manuais (multi-select por site + type).
  const [manualSites, setManualSites] = React.useState<string[]>([]);
  const [manualTypes, setManualTypes] = React.useState<string[]>([]);

  // Mantem chips sincronizados quando contextFilters muda externamente.
  React.useEffect(() => {
    setChips(contextFilters);
  }, [
    contextFilters.site,
    contextFilters.buyInMin,
    contextFilters.buyInMax,
    contextFilters.format,
  ]);

  // Debounce search 300ms. Timer SO atualiza `debouncedQuery`; emit acontece
  // num useEffect derivado de `debouncedQuery` (D7 — evita ref stale com
  // vi.useFakeTimers + setState dentro do timer callback).
  const allRef = React.useRef<any[]>([]);
  const chipsRef = React.useRef(chips);
  chipsRef.current = chips;
  const lastEmittedQueryRef = React.useRef<string>("");
  React.useEffect(() => {
    const t = setTimeout(() => {
      // flushSync garante que o useEffect derivado (que emite safeEmit) rode
      // sincronicamente dentro do mesmo tick do timer — compat com tests que
      // usam vi.useFakeTimers + vi.advanceTimersByTime sem await act().
      try {
        flushSync(() => {
          setDebouncedQuery(query);
        });
      } catch {
        // flushSync pode reclamar dentro de render lifecycle — fallback async.
        setDebouncedQuery(query);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Emit `coach.day_zoom_search` ao confirmar debouncedQuery. Skip emissao
  // inicial vazia (mount) + repeticao identica. Filtros computados aqui usam
  // os valores atuais (chipsRef/allRef) — captura sincrona pos-render.
  React.useEffect(() => {
    if (debouncedQuery === lastEmittedQueryRef.current) return;
    if (debouncedQuery.length === 0 && lastEmittedQueryRef.current === "") {
      lastEmittedQueryRef.current = debouncedQuery;
      return;
    }
    lastEmittedQueryRef.current = debouncedQuery;
    const c = chipsRef.current;
    let out = allRef.current;
    if (c.site) out = out.filter((t) => (t.site ?? "").toLowerCase() === String(c.site).toLowerCase());
    if (typeof c.buyInMin === "number") out = out.filter((t) => parseFloat(t.buyIn ?? "0") >= (c.buyInMin as number));
    if (typeof c.buyInMax === "number") out = out.filter((t) => parseFloat(t.buyIn ?? "0") <= (c.buyInMax as number));
    if (c.format) out = out.filter((t) => (t.type ?? "").toLowerCase() === String(c.format).toLowerCase());
    if (debouncedQuery.trim().length > 0) {
      const q = debouncedQuery.trim().toLowerCase();
      out = out.filter((t) => (t.name ?? t.site ?? "").toLowerCase().includes(q));
    }
    safeEmit("coach.day_zoom_search", {
      feature: "day_zoom",
      dayOfWeek,
      profileLetter,
      query: debouncedQuery,
      resultCount: out.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  const libQuery = useQuery<any[], Error>({
    queryKey: ["/api/tournament-library"],
    // Cache compartilhado com BibliotecaPanel — queryKey identica.
  });

  const all: any[] = Array.isArray((libQuery as any)?.data)
    ? (libQuery as any).data
    : [];
  allRef.current = all;

  // Sites e types disponiveis na biblioteca (derivados de all).
  const availableSites = React.useMemo<
    Array<{ site: string; count: number }>
  >(() => {
    const m = new Map<string, number>();
    for (const t of all) {
      const s = typeof t?.site === "string" ? t.site : null;
      if (!s) continue;
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([site, count]) => ({ site, count }))
      .sort((a, b) => b.count - a.count || a.site.localeCompare(b.site));
  }, [all]);

  const availableTypes = React.useMemo<
    Array<{ type: string; count: number }>
  >(() => {
    const m = new Map<string, number>();
    for (const t of all) {
      const ty = typeof t?.type === "string" ? t.type : null;
      if (!ty) continue;
      m.set(ty, (m.get(ty) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  }, [all]);

  const toggleManualSite = React.useCallback((s: string) => {
    setManualSites((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }, []);
  const toggleManualType = React.useCallback((t: string) => {
    setManualTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }, []);

  const filtered = React.useMemo(() => {
    let out = all;
    if (chips.site) {
      out = out.filter(
        (t) =>
          (t.site ?? "").toLowerCase() === String(chips.site).toLowerCase(),
      );
    }
    if (typeof chips.buyInMin === "number") {
      out = out.filter((t) => {
        const b = parseFloat(t.buyIn ?? "0");
        return !isNaN(b) && b >= (chips.buyInMin as number);
      });
    }
    if (typeof chips.buyInMax === "number") {
      out = out.filter((t) => {
        const b = parseFloat(t.buyIn ?? "0");
        return !isNaN(b) && b <= (chips.buyInMax as number);
      });
    }
    if (chips.format) {
      out = out.filter(
        (t) =>
          (t.type ?? "").toLowerCase() === String(chips.format).toLowerCase(),
      );
    }
    if (manualSites.length > 0) {
      const set = new Set(manualSites.map((s) => s.toLowerCase()));
      out = out.filter((t) => set.has(String(t.site ?? "").toLowerCase()));
    }
    if (manualTypes.length > 0) {
      const set = new Set(manualTypes.map((s) => s.toLowerCase()));
      out = out.filter((t) => set.has(String(t.type ?? "").toLowerCase()));
    }
    if (debouncedQuery.trim().length > 0) {
      const q = debouncedQuery.trim().toLowerCase();
      out = out.filter((t) =>
        (t.name ?? t.site ?? "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [
    all,
    chips.site,
    chips.buyInMin,
    chips.buyInMax,
    chips.format,
    manualSites,
    manualTypes,
    debouncedQuery,
  ]);


  const hasAnyChip =
    !!chips.site ||
    typeof chips.buyInMin === "number" ||
    typeof chips.buyInMax === "number" ||
    !!chips.format;

  const tooMany = filtered.length > TOO_MANY_THRESHOLD;
  const visible = tooMany ? filtered.slice(0, TOO_MANY_THRESHOLD) : filtered;

  const handleClearContext = () => {
    setChips({});
    safeEmit("coach.day_zoom_filter_apply", {
      feature: "day_zoom",
      dayOfWeek,
      profileLetter,
      filters: {},
      cleared: true,
      resultCount: all.length,
    });
  };

  return (
    <div
      data-testid="biblioteca-embedded"
      className="flex flex-col h-full bg-gray-900 border border-gray-800 rounded-lg p-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <input
          data-testid="biblioteca-embedded-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar torneio..."
          className="flex-1 bg-gray-800 border border-gray-700 text-white text-sm rounded-md px-2 py-1.5 focus:outline-none focus:border-emerald-500"
        />
        <span
          data-testid="biblioteca-embedded-count"
          className="text-xs text-gray-400"
        >
          {filtered.length} torneios
        </span>
      </div>

      {/* Filtros manuais (multi-select) */}
      {availableSites.length > 0 && (
        <div
          data-testid="biblioteca-manual-site-filters"
          className="flex flex-wrap gap-1 mb-1.5 items-center"
        >
          <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wide text-gray-500 mr-1">
            <Filter className="w-2.5 h-2.5" />
            Site
          </span>
          {availableSites.slice(0, 8).map(({ site, count }) => {
            const active = manualSites.includes(site);
            const c = getSiteColors(site);
            return (
              <button
                key={site}
                type="button"
                data-testid={`biblioteca-filter-site-${site}`}
                onClick={() => toggleManualSite(site)}
                aria-pressed={active ? "true" : "false"}
                className={
                  "inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full border transition-all " +
                  (active
                    ? `${c.bg} ${c.border} ${c.text}`
                    : "bg-gray-800/60 border-gray-700 text-gray-400 hover:text-gray-200")
                }
              >
                <span className={`w-1 h-1 rounded-full ${active ? c.dot : "bg-gray-500"}`} />
                {site}
                <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}
      {availableTypes.length > 0 && (
        <div
          data-testid="biblioteca-manual-type-filters"
          className="flex flex-wrap gap-1 mb-2 items-center"
        >
          <span className="text-[9px] uppercase tracking-wide text-gray-500 mr-1">
            Tipo
          </span>
          {availableTypes.slice(0, 6).map(({ type, count }) => {
            const active = manualTypes.includes(type);
            return (
              <button
                key={type}
                type="button"
                data-testid={`biblioteca-filter-type-${type}`}
                onClick={() => toggleManualType(type)}
                aria-pressed={active ? "true" : "false"}
                className={
                  "px-1.5 py-0.5 text-[10px] rounded-full border transition-all " +
                  (active
                    ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200"
                    : "bg-gray-800/60 border-gray-700 text-gray-400 hover:text-gray-200")
                }
              >
                {type}
                <span className="ml-1 opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-2 items-center min-h-[20px]">
        {/* Chips contextuais (RF-03) — visiveis quando aplicados. */}
        {chips.site && (
          <span
            data-testid="biblioteca-context-chip-site"
            className="text-[11px] bg-blue-900/40 text-blue-200 px-2 py-0.5 rounded-full"
          >
            {chips.site}
          </span>
        )}
        {(typeof chips.buyInMin === "number" ||
          typeof chips.buyInMax === "number") && (
          <span
            data-testid="biblioteca-context-chip-buyIn"
            className="text-[11px] bg-emerald-900/40 text-emerald-200 px-2 py-0.5 rounded-full"
          >
            ${chips.buyInMin ?? "?"} – ${chips.buyInMax ?? "?"}
          </span>
        )}
        {chips.format && (
          <span
            data-testid="biblioteca-context-chip-format"
            className="text-[11px] bg-amber-900/40 text-amber-200 px-2 py-0.5 rounded-full"
          >
            {chips.format}
          </span>
        )}
        {hasAnyChip && (
          <button
            type="button"
            data-testid="biblioteca-clear-context"
            onClick={handleClearContext}
            className="text-[11px] text-gray-400 hover:text-white inline-flex items-center gap-1 ml-1"
            title="Limpar contexto"
          >
            <X className="w-3 h-3" />
            Limpar
          </button>
        )}
      </div>

      {tooMany && (
        <div
          data-testid="biblioteca-too-many"
          className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-900/40 rounded px-2 py-1 mb-2"
        >
          Muitos torneios — refine os filtros (mostrando {TOO_MANY_THRESHOLD}/
          {filtered.length}).
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {visible.map((t) => (
          <LibraryCard
            key={t.id}
            tournament={t}
            compact
            showAddInlineButton={showAddInline}
            onAddInline={
              showAddInline && onAddToSlot ? () => onAddToSlot(t) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

export function BibliotecaEmbedded(
  props: BibliotecaEmbeddedProps,
): React.ReactElement {
  return (
    <LocalErrorBoundary>
      <BibliotecaEmbeddedInner {...props} />
    </LocalErrorBoundary>
  );
}

export default BibliotecaEmbedded;
