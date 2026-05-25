// =============================================================================
// Sprint day-detail-zoom-1 — useUndoToast hook
//
// Spec: Docs/specs/sprint-day-detail-zoom-1.md §RF-02.
// ADR: Docs/architecture/decisions/210-day-detail-zoom-architecture.md §4.
//
// Hook expoe state minimo para renderizar um toast "Desfazer" auto-dismiss em
// `durationMs` (default 5000). Sem fila — apenas o ultimo. Reusavel pos-sprint.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";

export interface UndoToastState {
  visible: boolean;
  label: string;
  /** Action key — caller usa para diferenciar add/move/remove. */
  action?: string;
}

export interface UndoToastApi {
  state: UndoToastState;
  show: (opts: {
    label: string;
    action?: string;
    undoFn: () => void | Promise<void>;
    durationMs?: number;
  }) => void;
  hide: () => void;
  trigger: () => void;
}

export function useUndoToast(): UndoToastApi {
  const [state, setState] = useState<UndoToastState>({
    visible: false,
    label: "",
    action: undefined,
  });
  const undoFnRef = useRef<(() => void | Promise<void>) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const hide = useCallback(() => {
    clearTimer();
    setState({ visible: false, label: "", action: undefined });
    undoFnRef.current = null;
  }, []);

  const show: UndoToastApi["show"] = useCallback((opts) => {
    clearTimer();
    undoFnRef.current = opts.undoFn;
    setState({ visible: true, label: opts.label, action: opts.action });
    const ms = opts.durationMs ?? 5000;
    timerRef.current = setTimeout(() => {
      setState({ visible: false, label: "", action: undefined });
      undoFnRef.current = null;
    }, ms);
  }, []);

  const trigger = useCallback(() => {
    const fn = undoFnRef.current;
    clearTimer();
    setState({ visible: false, label: "", action: undefined });
    undoFnRef.current = null;
    if (fn) {
      try {
        const r = fn();
        if (r && typeof (r as any).then === "function") {
          (r as Promise<void>).catch(() => {});
        }
      } catch {
        // swallow — undo is best-effort.
      }
    }
  }, []);

  useEffect(() => {
    return () => clearTimer();
  }, []);

  return { state, show, hide, trigger };
}

export default useUndoToast;
