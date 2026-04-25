import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// =============================================================================
// Testes TDD (Sprint W-1): hooks/useWarmupTimer (T-07)
//
// Contrato: countdown que usa requestAnimationFrame + timestamp absoluto
// (evita drift do setInterval — mitigation R-4 da spec).
//
// API esperada:
//   const { remaining, paused, pause, resume, reset } = useWarmupTimer({
//     seconds: 120,
//     paused?: boolean,
//     onComplete?: () => void,
//   });
//
// Status: red phase.
// =============================================================================

import { useWarmupTimer } from '@/hooks/useWarmupTimer';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useWarmupTimer - estado inicial', () => {
  it('inicia com remaining = seconds passado', () => {
    const { result } = renderHook(() => useWarmupTimer({ seconds: 120 }));
    expect(result.current.remaining).toBe(120);
  });

  it('paused=false por default', () => {
    const { result } = renderHook(() => useWarmupTimer({ seconds: 120 }));
    expect(result.current.paused).toBe(false);
  });
});

describe('useWarmupTimer - decremento', () => {
  it('decrementa apos 1 segundo', () => {
    const { result } = renderHook(() => useWarmupTimer({ seconds: 120 }));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.remaining).toBeLessThan(120);
    expect(result.current.remaining).toBeGreaterThanOrEqual(118);
  });

  it('chega a 0 apos seconds * 1000 ms', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useWarmupTimer({ seconds: 5, onComplete }),
    );

    act(() => {
      vi.advanceTimersByTime(5500);
    });

    expect(result.current.remaining).toBe(0);
  });

  it('chama onComplete quando atinge 0', () => {
    const onComplete = vi.fn();
    renderHook(() => useWarmupTimer({ seconds: 2, onComplete }));

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('useWarmupTimer - pause/resume', () => {
  it('pause congela remaining', () => {
    const { result } = renderHook(() => useWarmupTimer({ seconds: 120 }));

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const beforePause = result.current.remaining;

    act(() => {
      result.current.pause();
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.remaining).toBe(beforePause);
  });

  it('resume retoma do mesmo ponto', () => {
    const { result } = renderHook(() => useWarmupTimer({ seconds: 120 }));

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    act(() => {
      result.current.pause();
    });

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    act(() => {
      result.current.resume();
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.remaining).toBeLessThan(118);
    expect(result.current.remaining).toBeGreaterThanOrEqual(112);
  });

  it('paused=true apos chamar pause()', () => {
    const { result } = renderHook(() => useWarmupTimer({ seconds: 120 }));
    act(() => {
      result.current.pause();
    });
    expect(result.current.paused).toBe(true);
  });
});

describe('useWarmupTimer - reset', () => {
  it('reset volta remaining para seconds inicial', () => {
    const { result } = renderHook(() => useWarmupTimer({ seconds: 60 }));

    act(() => {
      vi.advanceTimersByTime(20000);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.remaining).toBe(60);
  });
});
