/**
 * useWarmupTimer — Sprint W-1 (T-07, RNF mitigation R-4)
 *
 * Countdown baseado em timestamp absoluto + setInterval (jsdom-friendly em testes).
 * Em producao real, podemos trocar para requestAnimationFrame, mas em vitest
 * useFakeTimers nao avanca rAF — entao usamos setInterval para garantir testes.
 *
 * API:
 *   const { remaining, paused, pause, resume, reset } = useWarmupTimer({
 *     seconds: 120,
 *     paused?: boolean,
 *     onComplete?: () => void,
 *   });
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseWarmupTimerOptions {
  seconds: number;
  paused?: boolean;
  onComplete?: () => void;
}

export function useWarmupTimer({
  seconds,
  paused: pausedProp = false,
  onComplete,
}: UseWarmupTimerOptions) {
  const [remaining, setRemaining] = useState<number>(seconds);
  const [paused, setPaused] = useState<boolean>(pausedProp);

  // Tracking
  const initialSecondsRef = useRef<number>(seconds);
  const startedAtRef = useRef<number | null>(null);
  const pausedAccumRef = useRef<number>(0);
  const pausedAtRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  const completedRef = useRef<boolean>(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Inicializa start time
  useEffect(() => {
    startedAtRef.current = Date.now();
    pausedAccumRef.current = 0;
    pausedAtRef.current = paused ? Date.now() : null;
    completedRef.current = false;
    initialSecondsRef.current = seconds;
    setRemaining(seconds);
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick loop
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      if (completedRef.current) return;
      const start = startedAtRef.current ?? Date.now();
      const elapsedMs = Date.now() - start - pausedAccumRef.current;
      const elapsed = Math.floor(elapsedMs / 1000);
      const next = Math.max(initialSecondsRef.current - elapsed, 0);
      setRemaining(next);
      if (next <= 0 && !completedRef.current) {
        completedRef.current = true;
        if (onCompleteRef.current) {
          try {
            onCompleteRef.current();
          } catch {
            /* ignore */
          }
        }
      }
    }, 100);
    return () => clearInterval(id);
  }, [paused]);

  const pause = useCallback(() => {
    setPaused((prev) => {
      if (prev) return prev;
      pausedAtRef.current = Date.now();
      return true;
    });
  }, []);

  const resume = useCallback(() => {
    setPaused((prev) => {
      if (!prev) return prev;
      if (pausedAtRef.current != null) {
        pausedAccumRef.current += Date.now() - pausedAtRef.current;
        pausedAtRef.current = null;
      }
      return false;
    });
  }, []);

  const reset = useCallback(() => {
    startedAtRef.current = Date.now();
    pausedAccumRef.current = 0;
    pausedAtRef.current = paused ? Date.now() : null;
    completedRef.current = false;
    setRemaining(initialSecondsRef.current);
  }, [paused]);

  return { remaining, paused, pause, resume, reset };
}
