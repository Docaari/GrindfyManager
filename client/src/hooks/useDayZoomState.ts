// =============================================================================
// Sprint day-detail-zoom-1 — useDayZoomState hook
//
// Spec: Docs/specs/sprint-day-detail-zoom-1.md §RF-04.
// ADR: Docs/architecture/decisions/210-day-detail-zoom-architecture.md §5.
//
// Decide entre 'zoom' (default) e 'drawer' (feature-flag rollback) baseado em
// query string `?detail=drawer`. Conflito `?detail=drawer&day=Tue` -> drawer
// ganha (rollback total).
// =============================================================================

import { useEffect, useState } from "react";

export type DayDetailMode = "zoom" | "drawer";

export interface DayZoomState {
  mode: DayDetailMode;
}

function parseMode(search: string): DayDetailMode {
  try {
    const params = new URLSearchParams(search ?? "");
    const detail = params.get("detail");
    if (detail === "drawer") return "drawer";
    return "zoom";
  } catch {
    return "zoom";
  }
}

/**
 * Read current ?detail= flag. Re-reads on window popstate/hashchange events.
 */
export function useDayZoomState(): DayZoomState {
  const initial =
    typeof window !== "undefined" ? parseMode(window.location.search) : "zoom";
  const [mode, setMode] = useState<DayDetailMode>(initial);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setMode(parseMode(window.location.search));
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  return { mode };
}

export default useDayZoomState;
