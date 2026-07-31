// =============================================================================
// bibliotecaFilters
//
// Persistencia localStorage dos filtros do painel Biblioteca de Torneios
// (client/src/components/grade-planner/BibliotecaPanel.tsx). Ao reabrir a
// pagina, os filtros voltam exatamente como o jogador deixou.
//
// `search` NAO persiste — busca textual e transiente por design.
// Padrao de persistencia espelha lib/grindPagePreferences.ts (objeto JSON
// tipado + DEFAULT_* + SSR guard + try/catch + merge defensivo).
// =============================================================================

export interface BibliotecaPersistedFilters {
  filterType: string;
  filterSpeed: string;
  filterSites: string[];
  filterCurrency: string;
  filterMinBuyIn: string;
  filterMaxBuyIn: string;
  filterTimeFrom: string;
  filterTimeTo: string;
  sortMode: string;
}

const STORAGE_KEY = "grindfy.biblioteca.filters";

export const DEFAULT_BIBLIOTECA_FILTERS: BibliotecaPersistedFilters = {
  filterType: "",
  filterSpeed: "",
  filterSites: [],
  filterCurrency: "",
  filterMinBuyIn: "",
  filterMaxBuyIn: "",
  filterTimeFrom: "",
  filterTimeTo: "",
  sortMode: "platform-buyin",
};

/** Le os filtros persistidos. Sempre retorna um objeto valido (defaults). */
export function readBibliotecaFilters(): BibliotecaPersistedFilters {
  if (typeof window === "undefined") return { ...DEFAULT_BIBLIOTECA_FILTERS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BIBLIOTECA_FILTERS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_BIBLIOTECA_FILTERS };
    }
    const asStr = (v: unknown, fallback: string): string =>
      typeof v === "string" ? v : fallback;
    return {
      filterType: asStr(parsed.filterType, ""),
      filterSpeed: asStr(parsed.filterSpeed, ""),
      filterSites: Array.isArray(parsed.filterSites)
        ? parsed.filterSites.filter((s: unknown): s is string => typeof s === "string")
        : [],
      filterCurrency: asStr(parsed.filterCurrency, ""),
      filterMinBuyIn: asStr(parsed.filterMinBuyIn, ""),
      filterMaxBuyIn: asStr(parsed.filterMaxBuyIn, ""),
      filterTimeFrom: asStr(parsed.filterTimeFrom, ""),
      filterTimeTo: asStr(parsed.filterTimeTo, ""),
      sortMode: asStr(parsed.sortMode, DEFAULT_BIBLIOTECA_FILTERS.sortMode),
    };
  } catch {
    return { ...DEFAULT_BIBLIOTECA_FILTERS };
  }
}

/** Grava os filtros. Silencioso em caso de falha (quota / SSR). */
export function writeBibliotecaFilters(filters: BibliotecaPersistedFilters): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // ignore — quota cheia ou storage indisponivel
  }
}
