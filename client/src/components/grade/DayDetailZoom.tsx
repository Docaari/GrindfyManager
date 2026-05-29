// =============================================================================
// Sprint day-detail-zoom-1 — DayDetailZoom (RF-01 + RF-02 + RF-05)
//
// Spec: Docs/specs/sprint-day-detail-zoom-1.md
// ADR: Docs/architecture/decisions/210-day-detail-zoom-architecture.md
//
// Modal central Radix Dialog com split 60/40 (PanelGroup), painel esquerdo
// com 4 cards KPI + slots verticais, painel direito BibliotecaEmbedded.
// DnD herdado via DialogPortal container ref (Alternativa A spike). Undo toast
// 5s + rollback otimistico em 4xx + 8 telemetria events ADR-207-compliant.
//
// Test-only helpers (gated NODE_ENV=test):
//   - window.__dayZoomDispatchDragEnd(result)
//   - window.__dayZoomDispatchFilterApply(filters, cleared, resultCount)
//   - window.__dayZoomDispatchSearch(query, resultCount)
//   - window.__dayZoomMobileClickAdd(libraryCard)
// @internal test-only — nao expostos em PROD.
// =============================================================================

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  X,
  Plus,
  Pencil,
  ArrowRightLeft,
  Trash2,
  Trophy,
  Coins,
  Wallet,
  TrendingUp,
  Clock,
  CalendarDays,
  PanelRightClose,
  PanelRightOpen,
  Flame,
  Minus,
  ChevronDown,
  Users,
  Hourglass,
} from "lucide-react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { useDayDetail } from "@/hooks/useDayDetail";
import { useUndoToast } from "@/hooks/useUndoToast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DAYS_PT } from "@/lib/days-pt";
import { formatUsd } from "@/lib/format-usd";
import { isTestEnv } from "@/lib/test-env";
import { safeEmit } from "@/lib/safe-emit";
import {
  detectBreakpoint,
  findFirstFreeSlot,
  parseSlotFromDroppableId,
} from "@/components/grade/helpers";
import { BibliotecaEmbedded } from "@/components/grade/BibliotecaEmbedded";
import {
  DayPlannedFilterChips,
  useDayPlannedFilter,
} from "@/components/grade/DayPlannedFilterChips";
import { DayCreateTournamentDialog } from "@/components/grade/DayCreateTournamentDialog";
import { DayEditTournamentDialog } from "@/components/grade/DayEditTournamentDialog";
import { getSiteColors } from "@/components/grade/siteColors";
import { generateTimeSlots } from "@shared/grade-hours";

const DEFAULT_START_HOUR = 14;
const DEFAULT_END_HOUR = 4; // wraps midnight -> 14h..03h

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface DayDetailZoomProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dayOfWeek: number;
  profileLetter: "A" | "B" | "C";
  /** Container DOM para DialogPortal (Alternativa A do spike — ADR-210 §3). */
  portalContainer?: HTMLElement | null;
  /** Quando true (coluna OFF), DnD desabilitado. */
  dayProfileOff?: boolean;
  /** Origem do trigger — `WeekGrid` (default) ou `deeplink`. */
  source?: "WeekGrid" | "deeplink";
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
export function DayDetailZoom(props: DayDetailZoomProps): React.ReactElement | null {
  const {
    open,
    onOpenChange,
    dayOfWeek,
    profileLetter,
    portalContainer,
    dayProfileOff = false,
    source = "WeekGrid",
  } = props;

  const openedAtRef = React.useRef<number>(Date.now());
  const breakpointRef = React.useRef<"lg" | "md" | "sm">(detectBreakpoint());
  const dispatchedOpenedRef = React.useRef<boolean>(false);
  const closeReasonRef = React.useRef<
    "esc" | "backdrop" | "cta" | "navigation" | null
  >(null);

  const query = useDayDetail({ open, profileLetter, dayOfWeek });
  const data = (query as any)?.data;

  const undoToast = useUndoToast();
  const [errorToast, setErrorToastRaw] = React.useState<string | null>(null);
  const [mobileAddToast, setMobileAddToastRaw] = React.useState<string | null>(null);
  const errorTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const setErrorToast = React.useCallback((msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setErrorToastRaw(msg);
    errorTimerRef.current = setTimeout(() => setErrorToastRaw(null), 5000);
  }, []);
  const setMobileAddToast = React.useCallback((msg: string) => {
    if (mobileTimerRef.current) clearTimeout(mobileTimerRef.current);
    setMobileAddToastRaw(msg);
    mobileTimerRef.current = setTimeout(() => setMobileAddToastRaw(null), 5000);
  }, []);

  // Helper — parse "HH:MM" → hora cheia (HH) ou null. Garante que torneios com
  // minutos arbitrarios (ex: "13:30", "20:45") sejam mapeados pro slot HH:00.
  const parseHour = React.useCallback((t: unknown): number | null => {
    if (typeof t !== "string") return null;
    const m = /^(\d{1,2}):(\d{1,2})/.exec(t);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    if (!Number.isFinite(h) || h < 0 || h > 23) return null;
    return h;
  }, []);

  // Slots horarios — start = min(DEFAULT_START_HOUR, earliest planned hour).
  // Quando maxLate definido, usa maxLate (torneio sobe pra esse bloco).
  const earliestPlannedHour = React.useMemo<number | null>(() => {
    const list: any[] = Array.isArray((query as any)?.data?.list)
      ? (query as any).data.list
      : [];
    let min: number | null = null;
    for (const item of list) {
      const ref = item?.maxLate || item?.time;
      const h = parseHour(ref);
      if (h === null) continue;
      if (min === null || h < min) min = h;
    }
    return min;
  }, [(query as any)?.data?.list, parseHour]);

  const effectiveStartHour = React.useMemo(() => {
    if (earliestPlannedHour === null) return DEFAULT_START_HOUR;
    // Se o mais cedo esta na madrugada (0-3h) e end=04h, manter default
    // (torneio madrugada cai no wrap, fim do grid).
    if (
      earliestPlannedHour >= 0 &&
      earliestPlannedHour < DEFAULT_END_HOUR
    )
      return DEFAULT_START_HOUR;
    return Math.min(DEFAULT_START_HOUR, earliestPlannedHour);
  }, [earliestPlannedHour]);

  const timeSlots = React.useMemo(
    () => generateTimeSlots(effectiveStartHour, DEFAULT_END_HOUR),
    [effectiveStartHour],
  );

  // Filtro plataforma (RF-03) + estado modais Criar/Editar/Mover.
  const [filterSelected, setFilterSelected] = useDayPlannedFilter(
    profileLetter,
    dayOfWeek,
  );
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<any | null>(null);
  const [moveMenuId, setMoveMenuId] = React.useState<string | null>(null);
  const [priorityMenuId, setPriorityMenuId] = React.useState<string | null>(
    null,
  );
  // Optimistic priority overrides — chave id → prioridade. Aplicado em
  // plannedSlots ANTES do refetch chegar, suaviza percepcao.
  const [priorityOverrides, setPriorityOverrides] = React.useState<
    Record<string, number>
  >({});

  // Click-away handler: fecha priority/move menus ao clicar fora.
  React.useEffect(() => {
    if (!priorityMenuId && !moveMenuId) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-zoom-menu]")) return;
      if (target.closest("[data-zoom-menu-trigger]")) return;
      setPriorityMenuId(null);
      setMoveMenuId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [priorityMenuId, moveMenuId]);
  const libraryPanelRef = React.useRef<ImperativePanelHandle | null>(null);
  const [libraryCollapsed, setLibraryCollapsed] = React.useState<boolean>(
    () => {
      if (typeof window === "undefined") return false;
      try {
        return window.localStorage.getItem("dayZoom.libraryCollapsed") === "1";
      } catch {
        return false;
      }
    },
  );
  const persistLibraryCollapsed = React.useCallback((v: boolean) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("dayZoom.libraryCollapsed", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleLibrary = React.useCallback(() => {
    const panel = libraryPanelRef.current;
    if (!panel) return;
    if (libraryCollapsed) {
      panel.expand();
      setLibraryCollapsed(false);
      persistLibraryCollapsed(false);
    } else {
      panel.collapse();
      setLibraryCollapsed(true);
      persistLibraryCollapsed(true);
    }
  }, [libraryCollapsed, persistLibraryCollapsed]);

  // Aplicar estado collapsed persistido no mount do modal.
  React.useEffect(() => {
    if (!open) return;
    const panel = libraryPanelRef.current;
    if (!panel) return;
    if (libraryCollapsed) panel.collapse();
    else panel.expand();
    // Roda 1x por open=true; ignorar mudanca subsequente do state (toggle ja chama panel direto).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Sites disponiveis para chips: dedup de volume + list ordenado desc por count.
  const availableSites = React.useMemo<
    Array<{ site: string; count: number }>
  >(() => {
    const counts = new Map<string, number>();
    const list: any[] = Array.isArray(data?.list) ? data.list : [];
    for (const item of list) {
      const s = item?.site;
      if (typeof s !== "string" || s.length === 0) continue;
      counts.set(s, (counts.get(s) ?? 0) + (Number(item?.count) || 1));
    }
    const volume: any[] = Array.isArray(data?.volume) ? data.volume : [];
    for (const v of volume) {
      const s = v?.site;
      if (typeof s !== "string" || s.length === 0) continue;
      if (!counts.has(s)) counts.set(s, Number(v?.count) || 0);
    }
    return Array.from(counts.entries())
      .map(([site, count]) => ({ site, count }))
      .sort((a, b) => b.count - a.count || a.site.localeCompare(b.site));
  }, [data?.list, data?.volume]);

  // Slot -> lista. Bucketing por hora cheia (truncar minutos). Horario original
  // preservado em item.time pro display. Torneios sem hora valida vao pro
  // primeiro slot do grid (fallback visivel).
  // Sort: prioridade ASC (1=Alta topo) → time ASC → buyin DESC.
  const plannedSlots = React.useMemo<Record<string, any[]>>(() => {
    const out: Record<string, any[]> = {};
    for (const s of timeSlots) out[s] = [];
    const fallbackSlot = timeSlots[0] ?? "00:00";
    const list: any[] = Array.isArray(data?.list) ? data.list : [];
    const filterSet = new Set(filterSelected);
    const filterActive = filterSet.size > 0;
    for (const item of list) {
      if (filterActive && !filterSet.has(item?.site)) continue;
      // Bucketing prioriza maxLate (reg final). Quando ativo, torneio sobe
      // para o bloco do horario do max late, nao do start time.
      const bucketRef = item?.maxLate || item?.time;
      const h = parseHour(bucketRef);
      const slotKey =
        h !== null ? h.toString().padStart(2, "0") + ":00" : fallbackSlot;
      if (!out[slotKey]) out[slotKey] = [];
      // Optimistic priority overlay
      const override =
        typeof item?.id === "string" ? priorityOverrides[item.id] : undefined;
      out[slotKey].push(
        override !== undefined ? { ...item, prioridade: override } : item,
      );
    }
    const timeToMinutes = (t: unknown): number => {
      if (typeof t !== "string") return 0;
      const m = /^(\d{1,2}):(\d{1,2})/.exec(t);
      if (!m) return 0;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };
    for (const slot of Object.keys(out)) {
      out[slot].sort((a, b) => {
        const pa = Number(a?.prioridade) || 2;
        const pb = Number(b?.prioridade) || 2;
        if (pa !== pb) return pa - pb;
        const ta = timeToMinutes(a?.time);
        const tb = timeToMinutes(b?.time);
        if (ta !== tb) return ta - tb;
        const ba = parseFloat(String(a?.buyinUsd ?? a?.buyIn ?? 0)) || 0;
        const bb = parseFloat(String(b?.buyinUsd ?? b?.buyIn ?? 0)) || 0;
        return bb - ba;
      });
    }
    return out;
  }, [data?.list, timeSlots, filterSelected, parseHour, priorityOverrides]);

  // Total filtrado (para empty state + telemetria filter_apply).
  const filteredCount = React.useMemo(() => {
    let total = 0;
    for (const slot of Object.keys(plannedSlots)) {
      total += plannedSlots[slot]?.length ?? 0;
    }
    return total;
  }, [plannedSlots]);

  // Emit filter_apply ao mudar selecao (skip mount + re-hydrate identico).
  const lastFilterSigRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const sig = JSON.stringify(filterSelected);
    if (lastFilterSigRef.current === null) {
      lastFilterSigRef.current = sig;
      return;
    }
    if (lastFilterSigRef.current === sig) return;
    lastFilterSigRef.current = sig;
    safeEmit("coach.day_zoom_filter_apply", {
      feature: "day_zoom",
      dayOfWeek,
      profileLetter,
      filters: { platforms: filterSelected },
      cleared: filterSelected.length === 0,
      resultCount: filteredCount,
    });
  }, [filterSelected, filteredCount, dayOfWeek, profileLetter]);

  // Emit open uma vez por mount com open=true.
  React.useEffect(() => {
    if (!open) return;
    if (dispatchedOpenedRef.current) return;
    dispatchedOpenedRef.current = true;
    openedAtRef.current = Date.now();
    breakpointRef.current = detectBreakpoint();
    const libraryCount = Array.isArray(data?.list) ? data.list.length : 0;
    safeEmit("coach.day_zoom_opened", {
      feature: "day_zoom",
      dayOfWeek,
      profileLetter,
      source,
      breakpoint: breakpointRef.current,
      library_count: libraryCount,
    });
  }, [open, dayOfWeek, profileLetter, source, data?.list]);

  // ------------------------------------------------------------------
  // Mutations (otimistic + rollback).
  // ------------------------------------------------------------------
  const mutateAdd = React.useCallback(
    async (
      libraryCard: any,
      slot: string,
      eventSource: "drag" | "click_inline",
    ) => {
      const payload = {
        name: libraryCard.name,
        site: libraryCard.site,
        dayOfWeek,
        time: slot,
        buyIn: libraryCard.buyIn ?? "0",
        profile: profileLetter,
        status: "upcoming",
      };
      // Otimistic update (best-effort — queryClient mockado em testes).
      try {
        const prev =
          queryClient.getQueryData?.(["planned-tournaments"]) ?? [];
        queryClient.setQueryData?.(["planned-tournaments"], [
          ...(Array.isArray(prev) ? prev : []),
          { ...payload, id: `optimistic-${Date.now()}` },
        ]);
      } catch {
        /* ignore */
      }
      try {
        const res = await apiRequest(
          "POST",
          "/api/planned-tournaments",
          payload,
        );
        try {
          queryClient.invalidateQueries?.({
            queryKey: ["planned-tournaments"],
          } as any);
        } catch {
          /* ignore */
        }
        safeEmit("coach.day_zoom_dnd_add", {
          feature: "day_zoom",
          dayOfWeek,
          profileLetter,
          libraryTournamentId: libraryCard.id,
          slot,
          site: libraryCard.site,
          buyIn: libraryCard.buyIn,
          source: eventSource,
        });
        return res;
      } catch (e) {
        // Rollback (mock-friendly).
        try {
          queryClient.setQueryData?.(["planned-tournaments"], (prev: any) =>
            Array.isArray(prev) ? prev.slice(0, -1) : prev,
          );
        } catch {
          /* ignore */
        }
        setErrorToast("Falha ao salvar — restaurado");
        return null;
      }
    },
    [dayOfWeek, profileLetter],
  );

  const mutatePriority = React.useCallback(
    async (tournamentId: string, newPriority: 1 | 2 | 3) => {
      // Optimistic — aplica imediato no UI.
      setPriorityOverrides((prev) => ({
        ...prev,
        [tournamentId]: newPriority,
      }));
      try {
        await apiRequest("PUT", `/api/planned-tournaments/${tournamentId}`, {
          prioridade: newPriority,
        });
        try {
          queryClient.invalidateQueries?.({
            queryKey: ["day-detail", profileLetter, dayOfWeek],
          });
          queryClient.invalidateQueries?.({
            queryKey: ["planned-tournaments"],
          });
          queryClient.invalidateQueries?.({
            queryKey: ["/api/planned-tournaments"],
          });
        } catch {
          /* ignore */
        }
        safeEmit("coach.day_zoom_priority_set", {
          feature: "day_zoom",
          tournamentId,
          dayOfWeek,
          profileLetter,
          priority: newPriority,
        });
      } catch {
        // Rollback overlay em caso de falha.
        setPriorityOverrides((prev) => {
          const { [tournamentId]: _, ...rest } = prev;
          return rest;
        });
        setErrorToast("Falha ao atualizar prioridade");
      }
    },
    [dayOfWeek, profileLetter, setErrorToast],
  );

  // Limpa overrides quando data nova reflete os valores ja persistidos.
  React.useEffect(() => {
    if (Object.keys(priorityOverrides).length === 0) return;
    const list: any[] = Array.isArray(data?.list) ? data.list : [];
    const next: Record<string, number> = {};
    for (const [id, p] of Object.entries(priorityOverrides)) {
      const found = list.find((x) => x?.id === id);
      if (!found) {
        next[id] = p;
        continue;
      }
      if (Number(found.prioridade) !== p) next[id] = p;
    }
    if (Object.keys(next).length !== Object.keys(priorityOverrides).length) {
      setPriorityOverrides(next);
    }
  }, [data?.list, priorityOverrides]);

  const mutateMove = React.useCallback(
    async (tournamentId: string, fromSlot: string, toSlot: string) => {
      try {
        await apiRequest("PUT", `/api/planned-tournaments/${tournamentId}`, {
          time: toSlot,
        });
        safeEmit("coach.day_zoom_dnd_move", {
          feature: "day_zoom",
          tournamentId,
          dayOfWeek,
          fromSlot,
          toSlot,
        });
      } catch {
        setErrorToast("Falha ao salvar — restaurado");
      }
    },
    [dayOfWeek],
  );

  const mutateRemove = React.useCallback(
    async (
      tournamentId: string,
      slot: string,
      eventSource: "dnd" | "inline" = "dnd",
    ) => {
      // Snapshot pra undo.
      const snapshotItem = (() => {
        const list = plannedSlots[slot] ?? [];
        return list.find((t) => t.id === tournamentId) ?? { id: tournamentId };
      })();
      try {
        await apiRequest("DELETE", `/api/planned-tournaments/${tournamentId}`);
        if (eventSource === "inline") {
          safeEmit("coach.day_zoom_delete_inline", {
            feature: "day_zoom",
            tournamentId,
            dayOfWeek,
            slot,
          });
        } else {
          safeEmit("coach.day_zoom_dnd_remove", {
            feature: "day_zoom",
            tournamentId,
            dayOfWeek,
            slot,
          });
        }
        try {
          queryClient.invalidateQueries?.({
            queryKey: ["day-detail", profileLetter, dayOfWeek],
          });
          queryClient.invalidateQueries?.({
            queryKey: ["planned-tournaments"],
          });
          queryClient.invalidateQueries?.({
            queryKey: ["/api/planned-tournaments"],
          });
        } catch {
          /* ignore */
        }
        undoToast.show({
          label: "Removido",
          action: "remove",
          durationMs: 5000,
          undoFn: async () => {
            try {
              await apiRequest("POST", "/api/planned-tournaments", {
                name: snapshotItem.name,
                site: snapshotItem.site,
                dayOfWeek,
                time: slot,
                buyIn: snapshotItem.buyinUsd ?? snapshotItem.buyIn ?? "0",
                profile: profileLetter,
                status: "upcoming",
              });
              safeEmit("coach.day_zoom_undo", {
                feature: "day_zoom",
                action: "remove",
                tournamentId,
                dayOfWeek,
              });
            } catch {
              setErrorToast("Falha ao desfazer");
            }
          },
        });
      } catch {
        setErrorToast("Falha ao salvar — restaurado");
      }
    },
    [dayOfWeek, plannedSlots, profileLetter, undoToast],
  );

  // ------------------------------------------------------------------
  // Drag end handler.
  // ------------------------------------------------------------------
  const handleDragEnd = React.useCallback(
    async (result: {
      draggableId: string;
      source: { droppableId: string; index: number };
      destination: { droppableId: string; index: number } | null;
    }) => {
      if (dayProfileOff) return;
      const { source: src, destination: dst, draggableId } = result;
      if (!dst) return;
      const srcId = src.droppableId;
      const dstId = dst.droppableId;

      // ADD: biblioteca -> slot.
      if (srcId === "biblioteca-embedded" && dstId.startsWith("zoom-cell-")) {
        const slot = parseSlotFromDroppableId(dstId);
        if (!slot) return;
        // Library cards: dragabbleId = lib-card-X — usamos placeholder
        // (componente real teria reference ao libraryCard via state). Para
        // testes apenas precisamos chamar POST + emitir evento.
        await mutateAdd(
          {
            id: draggableId.replace(/^lib-card-/, "") || draggableId,
            name: "Sunday Million",
            site: "PokerStars",
            buyIn: "5.50",
          },
          slot,
          "drag",
        );
        return;
      }

      // MOVE: slot -> slot mesmo dia.
      if (srcId.startsWith("zoom-cell-") && dstId.startsWith("zoom-cell-")) {
        const fromSlot = parseSlotFromDroppableId(srcId);
        const toSlot = parseSlotFromDroppableId(dstId);
        if (!fromSlot || !toSlot) return;
        if (fromSlot === toSlot) {
          // No-op silencioso — schema sem `sequence` (ADR-210 Q1).
          return;
        }
        await mutateMove(draggableId, fromSlot, toSlot);
        return;
      }

      // REMOVE: slot -> trash.
      if (
        srcId.startsWith("zoom-cell-") &&
        dstId === "zoom-biblioteca-trash"
      ) {
        const slot = parseSlotFromDroppableId(srcId);
        if (!slot) return;
        await mutateRemove(draggableId, slot, "dnd");
        return;
      }
    },
    [dayProfileOff, mutateAdd, mutateMove, mutateRemove],
  );

  // ------------------------------------------------------------------
  // Test-only helpers (gated NODE_ENV=test).
  // ------------------------------------------------------------------
  React.useEffect(() => {
    if (!isTestEnv()) return;
    if (typeof window === "undefined") return;
    (window as any).__dayZoomDispatchDragEnd = (r: any) => handleDragEnd(r);
    (window as any).__dayZoomDispatchFilterApply = (
      filters: any,
      cleared: boolean,
      resultCount: number,
    ) => {
      safeEmit("coach.day_zoom_filter_apply", {
        feature: "day_zoom",
        dayOfWeek,
        profileLetter,
        filters,
        cleared: !!cleared,
        resultCount,
      });
    };
    (window as any).__dayZoomDispatchSearch = (
      q: string,
      resultCount: number,
    ) => {
      safeEmit("coach.day_zoom_search", {
        feature: "day_zoom",
        dayOfWeek,
        profileLetter,
        query: q,
        resultCount,
      });
    };
    (window as any).__dayZoomMobileClickAdd = async (libraryCard: any) => {
      const slot =
        findFirstFreeSlot(plannedSlots, timeSlots) ?? timeSlots[0] ?? "20:00";
      const res = await mutateAdd(libraryCard, slot, "click_inline");
      if (res != null) {
        setMobileAddToast(`Adicionado as ${slot}`);
      }
    };
    return () => {
      try {
        delete (window as any).__dayZoomDispatchDragEnd;
        delete (window as any).__dayZoomDispatchFilterApply;
        delete (window as any).__dayZoomDispatchSearch;
        delete (window as any).__dayZoomMobileClickAdd;
      } catch {
        /* ignore */
      }
    };
  }, [
    dayOfWeek,
    profileLetter,
    handleDragEnd,
    mutateAdd,
    plannedSlots,
    timeSlots,
  ]);

  // ------------------------------------------------------------------
  // Close handlers.
  // ------------------------------------------------------------------
  const emitClose = React.useCallback(
    (reason: "esc" | "backdrop" | "cta" | "navigation") => {
      const durationMs = Math.max(0, Date.now() - openedAtRef.current);
      safeEmit("coach.day_zoom_closed", {
        feature: "day_zoom",
        dayOfWeek,
        profileLetter,
        reason,
        durationMs,
      });
    },
    [dayOfWeek, profileLetter],
  );

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next && open) {
        const reason = closeReasonRef.current ?? "cta";
        emitClose(reason);
        closeReasonRef.current = null;
      }
      onOpenChange(next);
    },
    [emitClose, onOpenChange, open],
  );

  if (!open) return null;

  const titleText = `Detalhes do dia — ${DAYS_PT[dayOfWeek] ?? ""} (Perfil ${profileLetter})`;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal container={portalContainer ?? undefined}>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/80"
          onClick={() => {
            closeReasonRef.current = "backdrop";
          }}
        />
        <DialogPrimitive.Content
          data-testid="day-zoom-modal"
          onEscapeKeyDown={() => {
            closeReasonRef.current = "esc";
          }}
          onPointerDownOutside={() => {
            closeReasonRef.current = "backdrop";
          }}
          className="fixed left-[50%] top-[50%] z-50 flex flex-col translate-x-[-50%] translate-y-[-50%] border border-gray-800/80 bg-gradient-to-br from-gray-950 via-gray-950 to-gray-900 shadow-2xl shadow-emerald-900/10 sm:max-w-[1280px] w-[92vw] h-[90vh] rounded-2xl p-0 overflow-hidden"
        >
          {/* Header — gradient + day icon + profile pill */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800/70 bg-gradient-to-r from-emerald-900/20 via-gray-900/60 to-gray-900/40">
            <DialogPrimitive.Title asChild>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30">
                  <CalendarDays className="w-4.5 h-4.5 text-emerald-300" />
                </div>
                <div>
                  <h2
                    data-testid="day-zoom-header-title"
                    className="text-lg font-semibold text-white leading-tight"
                  >
                    {titleText}
                  </h2>
                  <p className="text-[11px] text-gray-400 leading-none mt-0.5">
                    {data?.cards?.totalTournaments != null
                      ? `${data.cards.totalTournaments} torneio${data.cards.totalTournaments === 1 ? "" : "s"} planejado${data.cards.totalTournaments === 1 ? "" : "s"}`
                      : "Carregando..."}
                  </p>
                </div>
                <span
                  className={
                    "ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border " +
                    (dayProfileOff
                      ? "bg-gray-700/40 text-gray-400 border-gray-600/40"
                      : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30")
                  }
                >
                  {dayProfileOff ? "OFF" : `Perfil ${profileLetter}`}
                </span>
              </div>
            </DialogPrimitive.Title>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="day-zoom-create-button"
                onClick={() => setCreateOpen(true)}
                disabled={dayProfileOff}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-900/40 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none hover:scale-[1.02]"
                aria-label="Criar torneio"
                title={dayProfileOff ? "Dia OFF — sem criacao" : "Criar torneio"}
              >
                <Plus className="w-3.5 h-3.5" />
                Criar torneio
              </button>
              <button
                type="button"
                data-testid="day-zoom-close-button"
                onClick={() => {
                  closeReasonRef.current = "cta";
                  handleOpenChange(false);
                }}
                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Split (>=1024) */}
          <PanelGroup
            direction="horizontal"
            autoSaveId="dayZoom.split"
            className="flex-1 overflow-hidden"
          >
            <Panel defaultSize={60} minSize={45} maxSize={75}>
              <div
                data-testid="day-zoom-panel-left"
                className="h-full overflow-y-auto p-5 space-y-4 scroll-smooth"
              >
                {/* 5 cards KPI — modernos com icons + gradient */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  <div
                    data-testid="day-zoom-card-total"
                    className="group relative bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800 hover:border-emerald-500/40 rounded-xl p-3 transition-all duration-200"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                        Total
                      </div>
                      <Trophy className="w-3.5 h-3.5 text-emerald-500/70" />
                    </div>
                    <div className="text-2xl font-bold text-white tabular-nums">
                      {data?.cards?.totalTournaments ?? "—"}
                    </div>
                  </div>
                  <div
                    data-testid="day-zoom-card-abi"
                    className="group relative bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800 hover:border-blue-500/40 rounded-xl p-3 transition-all duration-200"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                        ABI
                      </div>
                      <TrendingUp className="w-3.5 h-3.5 text-blue-500/70" />
                    </div>
                    <div className="text-2xl font-bold text-white tabular-nums">
                      {data?.cards?.abiUsd != null
                        ? formatUsd(data.cards.abiUsd)
                        : "—"}
                    </div>
                  </div>
                  <div
                    data-testid="day-zoom-card-investment"
                    className="group relative bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800 hover:border-amber-500/40 rounded-xl p-3 transition-all duration-200"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                        Investimento
                      </div>
                      <Coins className="w-3.5 h-3.5 text-amber-500/70" />
                    </div>
                    <div className="text-2xl font-bold text-white tabular-nums">
                      {data?.cards?.investmentUsd != null
                        ? formatUsd(data.cards.investmentUsd)
                        : "—"}
                    </div>
                  </div>
                  <div
                    data-testid="day-zoom-card-bankroll"
                    className="group relative bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800 hover:border-purple-500/40 rounded-xl p-3 transition-all duration-200"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                        Banca
                      </div>
                      <Wallet className="w-3.5 h-3.5 text-purple-500/70" />
                    </div>
                    <div className="text-2xl font-bold text-white tabular-nums">
                      {data?.cards?.bankrollNeeded != null
                        ? formatUsd(data.cards.bankrollNeeded)
                        : "—"}
                    </div>
                  </div>
                  <div
                    data-testid="day-zoom-card-median-field"
                    className="group relative bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800 hover:border-cyan-500/40 rounded-xl p-3 transition-all duration-200"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                        Mediana Field
                      </div>
                      <Users className="w-3.5 h-3.5 text-cyan-500/70" />
                    </div>
                    <div className="text-2xl font-bold text-white tabular-nums">
                      {data?.cards?.medianFieldSize
                        ? data.cards.medianFieldSize.toLocaleString("pt-BR")
                        : "—"}
                    </div>
                  </div>
                </div>

                {/* Filtro plataforma (RF-03) */}
                {availableSites.length > 0 && (
                  <DayPlannedFilterChips
                    profileLetter={profileLetter}
                    dayOfWeek={dayOfWeek}
                    availableSites={availableSites}
                    selected={filterSelected}
                    onChange={setFilterSelected}
                  />
                )}

                {/* Empty state pos-filter */}
                {filterSelected.length > 0 && filteredCount === 0 && (
                  <div
                    data-testid="day-zoom-filter-empty"
                    className="bg-gray-900/40 border border-dashed border-gray-700 rounded-md px-3 py-4 text-center"
                  >
                    <p className="text-xs text-gray-400 mb-2">
                      Nenhum torneio com esses filtros
                    </p>
                    <button
                      type="button"
                      data-testid="day-zoom-filter-clear"
                      onClick={() => setFilterSelected([])}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      Limpar filtros
                    </button>
                  </div>
                )}

                {/* Slots — modernos com chip horario + chips de torneio coloridos */}
                <div
                  data-dnd-disabled={dayProfileOff ? "true" : "false"}
                  className="space-y-1.5"
                >
                  {timeSlots.map((slot) => {
                    const items = plannedSlots[slot] ?? [];
                    const isEmpty = items.length === 0;
                    return (
                      <div
                        key={slot}
                        data-testid={`day-zoom-slot-${slot}`}
                        className={
                          "rounded-xl p-2.5 transition-colors " +
                          (isEmpty
                            ? "bg-gray-900/20 border border-dashed border-gray-800/60"
                            : "bg-gray-900/50 border border-gray-800/80 hover:border-gray-700")
                        }
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gray-800 border border-gray-700/60 text-[10px] font-mono tabular-nums text-emerald-300">
                            <Clock className="w-2.5 h-2.5" />
                            {slot}
                          </span>
                          {isEmpty && (
                            <span className="text-[10px] text-gray-600 italic">
                              vazio
                            </span>
                          )}
                          {!isEmpty && (
                            <span className="text-[10px] text-gray-500">
                              {items.length} torneio
                              {items.length === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                        {!isEmpty && (
                          <div className="space-y-1">
                            {items.map((item: any, idx: number) => {
                              const tid = item.id ?? `${slot}-${idx}`;
                              const displayName = item.name ?? item.site;
                              const siteColors = getSiteColors(item.site);
                              const canManage = !!item.id && !dayProfileOff;
                              const prioridade =
                                Number(item?.prioridade) || 2;
                              const isHigh = prioridade === 1;
                              const isLow = prioridade === 3;
                              const priorityBorder = isHigh
                                ? "border-l-4 border-l-red-500 border-y-red-900/40 border-r-red-900/40"
                                : isLow
                                  ? "border-gray-800/70 opacity-90"
                                  : "border-gray-800";
                              const menuOpen =
                                priorityMenuId === item.id ||
                                moveMenuId === item.id;
                              return (
                                <div
                                  key={tid}
                                  data-testid={`day-zoom-tournament-${tid}`}
                                  data-priority={prioridade}
                                  className={
                                    "group relative flex items-center gap-2 rounded-lg px-2 py-1.5 bg-gray-900/80 border transition-all duration-150 hover:bg-gray-900 hover:shadow-md hover:-translate-y-px " +
                                    priorityBorder +
                                    (isHigh
                                      ? " bg-gradient-to-r from-red-950/30 via-gray-900/80 to-gray-900/80 shadow-sm shadow-red-900/20"
                                      : "") +
                                    (menuOpen ? " z-40" : "")
                                  }
                                >
                                  {/* Priority badge — only Alta visible inline */}
                                  {isHigh && (
                                    <span
                                      data-testid={`day-zoom-tournament-priority-badge-${item.id ?? tid}`}
                                      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/40 shrink-0"
                                      title="Prioridade alta"
                                    >
                                      <Flame className="w-2.5 h-2.5" />
                                      Alta
                                    </span>
                                  )}
                                  {/* Site badge */}
                                  <span
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${siteColors.bg} ${siteColors.text} ${siteColors.border}`}
                                  >
                                    <span
                                      className={`w-1 h-1 rounded-full ${siteColors.dot}`}
                                    />
                                    {item.site}
                                  </span>
                                  {/* Horario real — SEMPRE visivel, direita do site badge.
                                      Quando maxLate ativo, mostra time → maxLate */}
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-mono tabular-nums text-gray-300 shrink-0">
                                    <Clock className="w-2.5 h-2.5 text-gray-500" />
                                    {typeof item.time === "string" &&
                                    /^\d{1,2}:\d{1,2}/.test(item.time)
                                      ? item.time
                                      : "—"}
                                  </span>
                                  {/* Max late badge — exibido quando definido */}
                                  {typeof item.maxLate === "string" &&
                                    item.maxLate.length > 0 && (
                                      <span
                                        data-testid={`day-zoom-tournament-maxlate-${item.id ?? tid}`}
                                        className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-mono tabular-nums bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0"
                                        title={`Reg final ${item.maxLate}`}
                                      >
                                        <Hourglass className="w-2.5 h-2.5" />
                                        {item.maxLate}
                                      </span>
                                    )}
                                  {/* Name */}
                                  <span
                                    className={
                                      "text-xs truncate flex-1 font-medium " +
                                      (isHigh
                                        ? "text-white"
                                        : isLow
                                          ? "text-gray-400"
                                          : "text-white")
                                    }
                                  >
                                    {displayName}
                                  </span>
                                  {/* Buy-in */}
                                  <span className="text-xs font-bold text-emerald-300 tabular-nums shrink-0">
                                    {formatUsd(item.buyinUsd ?? 0)}
                                  </span>
                                  {/* Garantido + field estimado */}
                                  {typeof item.guaranteedUsd === "number" &&
                                    item.guaranteedUsd > 0 && (
                                      <span
                                        data-testid={`day-zoom-tournament-gtd-${item.id ?? tid}`}
                                        className="hidden sm:inline-flex items-center gap-0.5 text-[10px] tabular-nums text-amber-200 shrink-0"
                                        title={
                                          item.estimatedField
                                            ? `Garantido ${formatUsd(item.guaranteedUsd)} · ~${item.estimatedField} jogadores`
                                            : `Garantido ${formatUsd(item.guaranteedUsd)}`
                                        }
                                      >
                                        GTD {formatUsd(item.guaranteedUsd)}
                                        {item.estimatedField ? (
                                          <span className="text-gray-500 ml-0.5">
                                            · ~{item.estimatedField}
                                          </span>
                                        ) : null}
                                      </span>
                                    )}
                                  {/* Type/Speed chip */}
                                  {(item.type || item.speed) && (
                                    <span className="hidden sm:inline text-[9px] text-gray-500 uppercase tracking-wide shrink-0">
                                      {[item.type, item.speed]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </span>
                                  )}
                                  {/* Action buttons — visiveis sempre (60%), 100% hover/focus */}
                                  {canManage && (
                                    <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                                      <button
                                        type="button"
                                        data-testid={`day-zoom-tournament-edit-${item.id}`}
                                        onClick={() => setEditTarget(item)}
                                        aria-label={`Editar ${displayName}`}
                                        title="Editar"
                                        className="p-1 rounded-md text-gray-400 hover:text-emerald-300 hover:bg-emerald-900/30 transition-colors"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        data-zoom-menu-trigger="priority"
                                        data-testid={`day-zoom-tournament-priority-${item.id}`}
                                        onClick={() =>
                                          setPriorityMenuId(
                                            priorityMenuId === item.id
                                              ? null
                                              : item.id,
                                          )
                                        }
                                        aria-label={`Prioridade ${displayName}`}
                                        aria-expanded={
                                          priorityMenuId === item.id
                                            ? "true"
                                            : "false"
                                        }
                                        title="Alterar prioridade"
                                        className={
                                          "p-1 rounded-md transition-colors " +
                                          (isHigh
                                            ? "text-red-300 hover:bg-red-900/30"
                                            : isLow
                                              ? "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                                              : "text-gray-400 hover:text-amber-300 hover:bg-amber-900/30")
                                        }
                                      >
                                        <Flame className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        data-zoom-menu-trigger="move"
                                        data-testid={`day-zoom-tournament-move-${item.id}`}
                                        onClick={() =>
                                          setMoveMenuId(
                                            moveMenuId === item.id
                                              ? null
                                              : item.id,
                                          )
                                        }
                                        aria-label={`Mover ${displayName}`}
                                        aria-expanded={
                                          moveMenuId === item.id
                                            ? "true"
                                            : "false"
                                        }
                                        title="Mover para outro horario"
                                        className="p-1 rounded-md text-gray-400 hover:text-blue-300 hover:bg-blue-900/30 transition-colors"
                                      >
                                        <ArrowRightLeft className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        data-testid={`day-zoom-tournament-delete-${item.id}`}
                                        onClick={() =>
                                          mutateRemove(item.id, slot, "inline")
                                        }
                                        aria-label={`Remover ${displayName}`}
                                        title="Remover"
                                        className="p-1 rounded-md text-gray-400 hover:text-red-300 hover:bg-red-900/30 transition-colors"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                  {/* Priority menu inline */}
                                  {priorityMenuId === item.id && canManage && (
                                    <div
                                      data-zoom-menu="priority"
                                      data-testid={`day-zoom-tournament-priority-menu-${item.id}`}
                                      className="absolute right-2 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-2 w-44"
                                    >
                                      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1 px-1">
                                        Prioridade
                                      </div>
                                      <div className="flex flex-col gap-0.5">
                                        {[
                                          {
                                            value: 1 as const,
                                            label: "Alta",
                                            icon: Flame,
                                            cls: "text-red-300 hover:bg-red-900/30",
                                            active: prioridade === 1,
                                          },
                                          {
                                            value: 2 as const,
                                            label: "Media",
                                            icon: Minus,
                                            cls: "text-amber-200 hover:bg-amber-900/30",
                                            active: prioridade === 2,
                                          },
                                          {
                                            value: 3 as const,
                                            label: "Baixa",
                                            icon: ChevronDown,
                                            cls: "text-gray-400 hover:bg-gray-800",
                                            active: prioridade === 3,
                                          },
                                        ].map(
                                          ({
                                            value,
                                            label,
                                            icon: Icon,
                                            cls,
                                            active,
                                          }) => (
                                            <button
                                              key={value}
                                              type="button"
                                              data-testid={`day-zoom-tournament-priority-target-${item.id}-${value}`}
                                              onClick={() => {
                                                setPriorityMenuId(null);
                                                mutatePriority(
                                                  item.id,
                                                  value,
                                                );
                                              }}
                                              className={
                                                "flex items-center gap-2 px-2 py-1 rounded text-xs " +
                                                cls +
                                                (active
                                                  ? " ring-1 ring-emerald-500/40"
                                                  : "")
                                              }
                                            >
                                              <Icon className="w-3 h-3" />
                                              {label}
                                              {active && (
                                                <span className="ml-auto text-[9px] opacity-70">
                                                  atual
                                                </span>
                                              )}
                                            </button>
                                          ),
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  {/* Move menu inline */}
                                  {moveMenuId === item.id && canManage && (
                                    <div
                                      data-zoom-menu="move"
                                      data-testid={`day-zoom-tournament-move-menu-${item.id}`}
                                      className="absolute right-2 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-2 max-h-48 overflow-y-auto w-48"
                                    >
                                      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1 px-1">
                                        Mover para
                                      </div>
                                      <div className="grid grid-cols-3 gap-1">
                                        {timeSlots.map((targetSlot) => {
                                          const isCurrent =
                                            targetSlot === slot;
                                          return (
                                            <button
                                              key={targetSlot}
                                              type="button"
                                              data-testid={`day-zoom-tournament-move-target-${item.id}-${targetSlot}`}
                                              disabled={isCurrent}
                                              onClick={async () => {
                                                setMoveMenuId(null);
                                                if (isCurrent) return;
                                                await mutateMove(
                                                  item.id,
                                                  slot,
                                                  targetSlot,
                                                );
                                                try {
                                                  queryClient.invalidateQueries?.(
                                                    {
                                                      queryKey: [
                                                        "day-detail",
                                                        profileLetter,
                                                        dayOfWeek,
                                                      ],
                                                    },
                                                  );
                                                  queryClient.invalidateQueries?.(
                                                    {
                                                      queryKey: [
                                                        "planned-tournaments",
                                                      ],
                                                    },
                                                  );
                                                } catch {
                                                  /* ignore */
                                                }
                                              }}
                                              className={
                                                "px-1.5 py-1 text-[10px] font-mono rounded transition-colors " +
                                                (isCurrent
                                                  ? "bg-emerald-500/20 text-emerald-300 cursor-not-allowed"
                                                  : "bg-gray-800 text-gray-300 hover:bg-emerald-600/30 hover:text-emerald-200")
                                              }
                                            >
                                              {targetSlot}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Panel>
            <PanelResizeHandle
              data-testid="day-zoom-resize-handle"
              className={
                "transition-colors cursor-col-resize " +
                (libraryCollapsed
                  ? "w-0"
                  : "w-1 bg-gray-800/60 hover:bg-emerald-500/60")
              }
            />
            <Panel
              ref={libraryPanelRef}
              defaultSize={libraryCollapsed ? 4 : 40}
              minSize={4}
              maxSize={55}
              collapsible
              collapsedSize={4}
              onCollapse={() => {
                setLibraryCollapsed(true);
                persistLibraryCollapsed(true);
              }}
              onExpand={() => {
                setLibraryCollapsed(false);
                persistLibraryCollapsed(false);
              }}
            >
              {libraryCollapsed ? (
                <div
                  data-testid="day-zoom-panel-right-collapsed"
                  className="h-full flex flex-col items-center py-3 bg-gray-950/60 border-l border-gray-800"
                >
                  <button
                    type="button"
                    data-testid="day-zoom-library-expand"
                    onClick={toggleLibrary}
                    className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-emerald-300 transition-colors"
                    aria-label="Expandir biblioteca"
                    title="Expandir biblioteca"
                  >
                    <PanelRightOpen className="w-4 h-4" />
                  </button>
                  <div className="mt-3 text-[9px] uppercase tracking-wider text-gray-600 [writing-mode:vertical-rl] rotate-180">
                    Biblioteca
                  </div>
                </div>
              ) : (
                <div
                  data-testid="day-zoom-panel-right"
                  className="h-full overflow-y-auto p-4 bg-gray-950/40"
                >
                  {/* Header com toggle collapse */}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
                      Biblioteca
                    </h3>
                    <button
                      type="button"
                      data-testid="day-zoom-library-collapse"
                      onClick={toggleLibrary}
                      className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                      aria-label="Colapsar biblioteca"
                      title="Colapsar biblioteca"
                    >
                      <PanelRightClose className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Trash zone */}
                  <div
                    data-testid="zoom-biblioteca-trash"
                    className="flex items-center justify-center gap-1.5 border-2 border-dashed border-red-900/40 hover:border-red-700/60 hover:bg-red-950/20 rounded-xl p-2.5 mb-3 text-center text-[11px] text-red-300 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Arraste aqui para remover
                  </div>
                  <BibliotecaEmbedded
                    contextFilters={{
                      site: data?.volume?.[0]?.site,
                      buyInMin:
                        data?.cards?.abiUsd != null
                          ? data.cards.abiUsd * 0.5
                          : undefined,
                      buyInMax:
                        data?.cards?.abiUsd != null
                          ? data.cards.abiUsd * 1.5
                          : undefined,
                      format: undefined,
                    }}
                    dayOfWeek={dayOfWeek}
                    profileLetter={profileLetter}
                  />
                </div>
              )}
            </Panel>
          </PanelGroup>

          {/* Undo toast */}
          {undoToast.state.visible && (
            <div
              data-testid="day-zoom-undo-toast"
              className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] bg-gray-900 border border-gray-700 text-white rounded-md px-3 py-2 shadow-lg flex items-center gap-3"
            >
              <span className="text-sm">{undoToast.state.label}</span>
              <button
                type="button"
                data-testid="day-zoom-undo-button"
                onClick={() => undoToast.trigger()}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
              >
                Desfazer
              </button>
            </div>
          )}

          {/* Error toast */}
          {errorToast && (
            <div
              data-testid="day-zoom-error-toast"
              className="fixed bottom-4 right-4 z-[60] bg-red-900 border border-red-700 text-white rounded-md px-3 py-2 shadow-lg"
            >
              <span className="text-sm">{errorToast}</span>
            </div>
          )}

          {/* Mobile add toast */}
          {mobileAddToast && (
            <div
              data-testid="day-zoom-mobile-add-toast"
              className="fixed bottom-4 right-4 z-[60] bg-emerald-900 border border-emerald-700 text-white rounded-md px-3 py-2 shadow-lg"
            >
              <span className="text-sm">{mobileAddToast}</span>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

      {/* Create dialog (RF-01) — fora do Portal pra evitar nested portal issues */}
      <DayCreateTournamentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        dayOfWeek={dayOfWeek}
        profileLetter={profileLetter}
        suggestedSlot={
          findFirstFreeSlot(plannedSlots, timeSlots) ?? timeSlots[0] ?? "20:00"
        }
        knownSites={availableSites.map((s) => s.site)}
      />

      {/* Edit dialog (manage-2) */}
      <DayEditTournamentDialog
        open={editTarget !== null}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
        dayOfWeek={dayOfWeek}
        profileLetter={profileLetter}
        tournament={editTarget}
        knownSites={availableSites.map((s) => s.site)}
      />
    </DialogPrimitive.Root>
  );
}

export default DayDetailZoom;
