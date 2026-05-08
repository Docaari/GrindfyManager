/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Coach-Biblio-2 — RF-1 useLessonAutoLog hook.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-1.1, §RF-1.5
 * ADR  : 131 (client-side trigger + idempotency server-side)
 *
 * Cobertura:
 *   - Hook recebe lessonId + lessonDurationSeconds
 *   - Listener no container.querySelector('mux-player, video, audio') (lesson #20)
 *   - Dispara POST /api/study-sessions com source='auto_lesson' quando progress >= 0.80
 *   - Idempotente local: 1 dispatch por mount (firedThisMount)
 *   - Re-mount reseta flag (server faz UPDATE idempotente)
 *   - Setting autoLogLessons=false -> hook nao dispara
 *   - Network failure -> log warn dev, sem toast
 *   - Mux Player runtime=0 -> protege divisao por zero (no-op)
 *   - Progress 79% nao dispara
 *   - Progress 80% / 85% / 95% disparam (uma vez)
 *
 * Lessons:
 *   #1  hooks first
 *   #20 wirar via container querySelector
 *   #30 hook test em jsdom (config vitest exclude tests/hooks de server project)
 *
 * Status RED: client/src/hooks/useLessonAutoLog.ts NAO existe.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createRef } from 'react';

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: {
    invalidateQueries: () => {},
    setQueryData: () => {},
    getQueryData: () => {},
  },
}));

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ created: true, sessionId: 'ssv2-1' });
});

afterEach(() => {
  vi.useRealTimers();
});

async function loadHook() {
  // Import lazy para evitar TDZ
  const mod: any = await import('../../client/src/hooks/useLessonAutoLog');
  return mod.useLessonAutoLog;
}

// Helper: cria um <video> mock que dispara timeupdate quando setamos currentTime
function createMockVideo(durationSec: number) {
  const listeners: Record<string, Function[]> = {};
  const video: any = {
    duration: durationSec,
    currentTime: 0,
    tagName: 'VIDEO',
    addEventListener(evt: string, fn: Function) {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    removeEventListener(evt: string, fn: Function) {
      listeners[evt] = (listeners[evt] || []).filter((l) => l !== fn);
    },
    dispatchEvent(evt: string) {
      (listeners[evt] || []).forEach((fn) => fn({ target: video }));
    },
  };
  return video;
}

function createContainer(video: any) {
  const container: any = {
    querySelector: (sel: string) => video,
    contains: () => true,
  };
  return container;
}

describe('useLessonAutoLog (RF-1.1 / ADR-131)', () => {
  it('hook existe e aceita {lessonId, container, autoLogEnabled}', async () => {
    const useHook = await loadHook();
    expect(typeof useHook).toBe('function');
  });

  it('NAO dispara quando progress < 80%', async () => {
    const useHook = await loadHook();
    const video = createMockVideo(600); // 10min
    const container = createContainer(video);

    renderHook(() =>
      useHook({ lessonId: 'lesson-1', container, autoLogEnabled: true }),
    );

    act(() => {
      video.currentTime = 60; // 10%
      video.dispatchEvent('timeupdate');
    });

    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('dispara aos 80% (POST com source=auto_lesson)', async () => {
    const useHook = await loadHook();
    const video = createMockVideo(600);
    const container = createContainer(video);

    renderHook(() =>
      useHook({ lessonId: 'lesson-1', container, autoLogEnabled: true }),
    );

    await act(async () => {
      video.currentTime = 480; // 80%
      video.dispatchEvent('timeupdate');
    });

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const call = apiRequestMock.mock.calls[0];
    expect(call[0]).toMatch(/POST/i);
    expect(call[1]).toMatch(/study-sessions/);
    expect(call[2]).toMatchObject({
      mode: 'lesson',
      source: 'auto_lesson',
      lessonId: 'lesson-1',
    });
  });

  it('idempotente local: progresso vai de 80% para 95% nao dispara segundo POST', async () => {
    const useHook = await loadHook();
    const video = createMockVideo(600);
    const container = createContainer(video);

    renderHook(() =>
      useHook({ lessonId: 'lesson-1', container, autoLogEnabled: true }),
    );

    await act(async () => {
      video.currentTime = 480;
      video.dispatchEvent('timeupdate');
    });
    await act(async () => {
      video.currentTime = 570; // 95%
      video.dispatchEvent('timeupdate');
    });

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
  });

  it('autoLogEnabled=false -> hook nao dispara mesmo aos 80% (RF-1.5)', async () => {
    const useHook = await loadHook();
    const video = createMockVideo(600);
    const container = createContainer(video);

    renderHook(() =>
      useHook({ lessonId: 'lesson-1', container, autoLogEnabled: false }),
    );

    await act(async () => {
      video.currentTime = 480;
      video.dispatchEvent('timeupdate');
    });

    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('container null -> hook eh inerte (sem crash)', async () => {
    const useHook = await loadHook();

    expect(() =>
      renderHook(() =>
        useHook({ lessonId: 'lesson-1', container: null, autoLogEnabled: true }),
      ),
    ).not.toThrow();

    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('runtime=0 (Mux glitch) -> nao dispara (divisao por zero protegida)', async () => {
    const useHook = await loadHook();
    const video = createMockVideo(0);
    const container = createContainer(video);

    renderHook(() =>
      useHook({ lessonId: 'lesson-1', container, autoLogEnabled: true }),
    );

    await act(async () => {
      video.currentTime = 0;
      video.dispatchEvent('timeupdate');
    });

    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('payload inclui durationMinutes capped (RF-1.2)', async () => {
    const useHook = await loadHook();
    const video = createMockVideo(720); // 12min
    const container = createContainer(video);

    renderHook(() =>
      useHook({ lessonId: 'lesson-1', container, autoLogEnabled: true }),
    );

    await act(async () => {
      video.currentTime = 600; // 83%
      video.dispatchEvent('timeupdate');
    });

    const payload = apiRequestMock.mock.calls[0][2];
    expect(payload.durationMinutes).toBeGreaterThan(0);
    expect(payload.durationMinutes).toBeLessThanOrEqual(12);
  });

  it('network failure -> silent (sem throw, hook continua)', async () => {
    apiRequestMock.mockRejectedValue(new Error('network'));

    const useHook = await loadHook();
    const video = createMockVideo(600);
    const container = createContainer(video);

    renderHook(() =>
      useHook({ lessonId: 'lesson-1', container, autoLogEnabled: true }),
    );

    await expect(
      act(async () => {
        video.currentTime = 480;
        video.dispatchEvent('timeupdate');
      }),
    ).resolves.not.toThrow();
  });

  it('lessonId null -> hook inerte', async () => {
    const useHook = await loadHook();
    const video = createMockVideo(600);
    const container = createContainer(video);

    renderHook(() =>
      useHook({ lessonId: null, container, autoLogEnabled: true }),
    );

    await act(async () => {
      video.currentTime = 480;
      video.dispatchEvent('timeupdate');
    });

    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  // ----- HIGH-2 fix: containerRef API (review Sprint Estudos-Coach-Biblio-2) -----
  it('aceita containerRef (RefObject) com .current preenchido pos-render', async () => {
    const useHook = await loadHook();
    const video = createMockVideo(600);
    const container = createContainer(video);

    const ref: any = createRef();
    ref.current = container;

    renderHook(() =>
      useHook({ lessonId: 'lesson-1', containerRef: ref, autoLogEnabled: true }),
    );

    await act(async () => {
      video.currentTime = 480; // 80%
      video.dispatchEvent('timeupdate');
    });

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
  });

  // ----- HIGH-3 / RF-1.4: lastLogged state -----
  it('expoe lastLogged com sessionId apos sucesso (RF-1.4)', async () => {
    apiRequestMock.mockResolvedValue({ created: true, sessionId: 'ssv2-42' });

    const useHook = await loadHook();
    const video = createMockVideo(600);
    const container = createContainer(video);

    const { result } = renderHook(() =>
      useHook({ lessonId: 'lesson-1', container, autoLogEnabled: true }),
    );

    await act(async () => {
      video.currentTime = 480;
      video.dispatchEvent('timeupdate');
    });

    await waitFor(() => {
      expect(result.current.lastLogged).not.toBeNull();
    });
    expect(result.current.lastLogged).toMatchObject({
      sessionId: 'ssv2-42',
      lessonId: 'lesson-1',
      status: 'success',
    });
  });

  it('expoe lastLogged com status=failed em network error', async () => {
    apiRequestMock.mockRejectedValue(new Error('network'));

    const useHook = await loadHook();
    const video = createMockVideo(600);
    const container = createContainer(video);

    const { result } = renderHook(() =>
      useHook({ lessonId: 'lesson-1', container, autoLogEnabled: true }),
    );

    await act(async () => {
      video.currentTime = 480;
      video.dispatchEvent('timeupdate');
    });

    await waitFor(() => {
      expect(result.current.lastLogged?.status).toBe('failed');
    });
  });
});
