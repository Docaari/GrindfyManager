/**
 * useStudyLiveTimer — Sprint Estudos-Habito-1 (RF-1.5).
 *
 * Hook do cronometro live: start/pause/resume/stop + auto-pause smart via
 * visibilitychange (idle > 60s).
 *
 * Estado: idle -> running -> paused -> running -> stopped (idempotent).
 *
 * stop() retorna { startedAt, endedAt, durationMinutes, idlePeriods }.
 *
 * Lessons:
 *   #1  hooks first
 *   #30 hook test em .test.ts roda em jsdom (config)
 */

import * as React from "react";

export type TimerState = "idle" | "running" | "paused" | "stopped";

export interface IdlePeriod {
  start: string;
  end: string;
}

export interface StopResult {
  startedAt: Date | null;
  endedAt: Date;
  durationMinutes: number;
  durationSeconds: number;
  idlePeriods: IdlePeriod[];
}

export interface UseStudyLiveTimerReturn {
  state: TimerState;
  elapsed: number;
  startedAt: Date | null;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => StopResult;
}

export function useStudyLiveTimer(): UseStudyLiveTimerReturn {
  const [state, setState] = React.useState<TimerState>("idle");
  const [elapsed, setElapsed] = React.useState<number>(0);
  const [startedAt, setStartedAt] = React.useState<Date | null>(null);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const idleStartRef = React.useRef<Date | null>(null);
  const idlePeriodsRef = React.useRef<IdlePeriod[]>([]);
  const stateRef = React.useRef<TimerState>("idle");

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const tick = React.useCallback(() => {
    setElapsed((e) => e + 1);
  }, []);

  const startTicking = React.useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      tick();
    }, 1000);
  }, [tick]);

  const stopTicking = React.useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = React.useCallback(() => {
    if (stateRef.current !== "idle") return;
    const now = new Date();
    setStartedAt(now);
    setState("running");
    setElapsed(0);
    idlePeriodsRef.current = [];
    startTicking();
  }, [startTicking]);

  const pause = React.useCallback(() => {
    if (stateRef.current !== "running") return;
    stopTicking();
    idleStartRef.current = new Date();
    setState("paused");
  }, [stopTicking]);

  const resume = React.useCallback(() => {
    if (stateRef.current !== "paused") return;
    if (idleStartRef.current) {
      idlePeriodsRef.current.push({
        start: idleStartRef.current.toISOString(),
        end: new Date().toISOString(),
      });
      idleStartRef.current = null;
    }
    setState("running");
    startTicking();
  }, [startTicking]);

  const stop = React.useCallback((): StopResult => {
    stopTicking();
    const endedAt = new Date();
    if (stateRef.current === "paused" && idleStartRef.current) {
      idlePeriodsRef.current.push({
        start: idleStartRef.current.toISOString(),
        end: endedAt.toISOString(),
      });
      idleStartRef.current = null;
    }
    setState("stopped");
    const durationSeconds = Math.max(0, elapsed);
    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
    return {
      startedAt,
      endedAt,
      durationMinutes,
      durationSeconds,
      idlePeriods: [...idlePeriodsRef.current],
    };
  }, [elapsed, startedAt, stopTicking]);

  // Auto-pause smart via visibilitychange (RF-1.5).
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    let hiddenAt: Date | null = null;
    function onVisibility() {
      if (typeof document === "undefined") return;
      if (document.hidden) {
        hiddenAt = new Date();
      } else if (hiddenAt) {
        const idleMs = Date.now() - hiddenAt.getTime();
        if (idleMs > 60_000 && stateRef.current === "running") {
          // Marca idle period e pausa.
          idlePeriodsRef.current.push({
            start: hiddenAt.toISOString(),
            end: new Date().toISOString(),
          });
          stopTicking();
          setState("paused");
        }
        hiddenAt = null;
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [stopTicking]);

  // Cleanup on unmount.
  React.useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return {
    state,
    elapsed,
    startedAt,
    start,
    pause,
    resume,
    stop,
  };
}

export default useStudyLiveTimer;
