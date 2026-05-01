/**
 * Sprint Bankroll-Reports-Detail (RF-14, D10) — filter persistido em localStorage.
 *
 * Compartilhado entre SessionHistoryUnified (toggle) e GrindProfitHeader (que
 * espelha o filter para somar profit). String-key estavel evita drift silencioso.
 *
 * SSR-safe: try/catch protege acesso a window/localStorage. Default "all".
 */
export type GrindHistoryFilter = "all" | "sessions" | "reports";

export const GRIND_HISTORY_FILTER_STORAGE_KEY = "grind-history-filter";

export function loadGrindHistoryFilter(): GrindHistoryFilter {
  try {
    const v = typeof window !== "undefined"
      ? window.localStorage.getItem(GRIND_HISTORY_FILTER_STORAGE_KEY)
      : null;
    if (v === "sessions" || v === "reports" || v === "all") return v;
  } catch {
    // ignore — fallback graceful
  }
  return "all";
}

export function persistGrindHistoryFilter(f: GrindHistoryFilter): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(GRIND_HISTORY_FILTER_STORAGE_KEY, f);
    }
  } catch {
    // ignore
  }
}
