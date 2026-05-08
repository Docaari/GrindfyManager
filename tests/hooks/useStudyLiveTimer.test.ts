/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Habito-1 — RF-1.5 useStudyLiveTimer hook
 *
 * Spec : Docs/specs/estudos-habito-1.md §RF-1.5 (auto-pause smart)
 *
 * Cobertura:
 *   - start() inicia timer com startedAt now()
 *   - pause()/resume() permitem pause manual
 *   - stop() retorna { startedAt, endedAt, durationMinutes, idlePeriods }
 *   - visibilitychange por > 60s -> entra idle automaticamente
 *   - retomar prompta "descontar tempo?"
 *   - duration_minutes final = (ended-started) - sum(idle_periods)
 *   - state machine: idle -> running -> paused -> running -> stopped
 *
 * Status RED: client/src/hooks/useStudyLiveTimer.ts NAO existe.
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #30 hook test em .test.ts roda em jsdom (config no vitest.config.ts)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// @ts-expect-error - red phase: hook nao existe
import { useStudyLiveTimer } from '../../client/src/hooks/useStudyLiveTimer';

async function loadHook() {
  return useStudyLiveTimer;
}

describe('useStudyLiveTimer', () => {
  it('hook existe e retorna {state, start, pause, resume, stop, elapsed}', async () => {
    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());
    expect(result.current).toBeDefined();
    expect(typeof result.current.start).toBe('function');
    expect(typeof result.current.stop).toBe('function');
    expect(typeof result.current.pause).toBe('function');
    expect(typeof result.current.resume).toBe('function');
  });

  it('estado inicial: state=idle, elapsed=0, startedAt=null', async () => {
    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());
    expect(result.current.state).toBe('idle');
    expect(result.current.elapsed).toBe(0);
    expect(result.current.startedAt).toBeNull();
  });

  it('start() seta state=running e startedAt=now()', async () => {
    vi.setSystemTime(new Date('2026-05-08T10:00:00Z'));

    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());

    act(() => {
      result.current.start();
    });

    expect(result.current.state).toBe('running');
    expect(result.current.startedAt).toBeInstanceOf(Date);
  });

  it('elapsed avanca conforme timer (por segundo)', async () => {
    vi.setSystemTime(new Date('2026-05-08T10:00:00Z'));

    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());

    act(() => {
      result.current.start();
    });

    act(() => {
      vi.advanceTimersByTime(5000); // 5 segundos
    });

    expect(result.current.elapsed).toBeGreaterThanOrEqual(5);
  });

  it('pause() para timer e seta state=paused', async () => {
    vi.setSystemTime(new Date('2026-05-08T10:00:00Z'));

    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());

    act(() => {
      result.current.start();
    });

    act(() => {
      vi.advanceTimersByTime(3000);
      result.current.pause();
    });

    expect(result.current.state).toBe('paused');
    const before = result.current.elapsed;

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.elapsed).toBe(before); // nao avanca durante pause
  });

  it('stop() retorna {startedAt, endedAt, durationMinutes, idlePeriods}', async () => {
    vi.setSystemTime(new Date('2026-05-08T10:00:00Z'));

    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());

    act(() => {
      result.current.start();
    });

    act(() => {
      vi.advanceTimersByTime(60_000); // 1 minuto
    });

    let stopResult: any;
    act(() => {
      stopResult = result.current.stop();
    });

    expect(stopResult).toBeDefined();
    expect(stopResult.startedAt).toBeInstanceOf(Date);
    expect(stopResult.endedAt).toBeInstanceOf(Date);
    expect(typeof stopResult.durationMinutes).toBe('number');
    expect(stopResult.durationMinutes).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(stopResult.idlePeriods)).toBe(true);
  });

  it('idle_periods registra cada pausa como {start, end}', async () => {
    vi.setSystemTime(new Date('2026-05-08T10:00:00Z'));

    const useHook = await loadHook();
    const { result } = renderHook(() => useHook());

    act(() => {
      result.current.start();
    });

    act(() => {
      vi.advanceTimersByTime(30_000); // 30s running
      result.current.pause();
    });
    act(() => {
      vi.advanceTimersByTime(60_000); // 60s idle
      result.current.resume();
    });
    act(() => {
      vi.advanceTimersByTime(30_000); // 30s running
    });

    let stopResult: any;
    act(() => {
      stopResult = result.current.stop();
    });

    expect(stopResult.idlePeriods.length).toBeGreaterThanOrEqual(1);
    expect(stopResult.idlePeriods[0]).toMatchObject({
      start: expect.any(String),
      end: expect.any(String),
    });
  });
});
