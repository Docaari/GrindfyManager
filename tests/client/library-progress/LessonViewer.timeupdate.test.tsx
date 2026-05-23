// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-05 — religar PATCH /api/library/lessons/:id/progress
//
// Spec: Docs/specs/sprint-mp-validation.md RF-05
// ADR-207 §4: throttle 5s same (action, lessonId) p/ library.progress.upsert
// Audit: memory/audit_library_progress_2026-05-22.md (H2 CONFIRMED — caller faltando)
//
// Cobertura:
//   - Mount LessonViewer + mock fetch
//   - Dispara 5 timeupdate events com currentTime incrementando
//   - Apos throttle 5s + 1 fake-timer tick, espera 1 chamada PATCH apenas
//     (throttle conta — primeiro evento passa, demais bloqueados ate cooldown)
//   - Payload shape: { format: 'video', lastPositionSeconds, totalDurationSeconds }
//   - URL: /api/library/lessons/{lessonId}/progress
//
// Lessons aplicadas:
//   #14/#26/#38: await import() em vez de require() pra evitar
//                ESM/CJS module record split (vi.fn mock vs fetch real)
//   #2: data-testid estavel
//   #15: localStorage polyfill ja em setup.ts
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock apiRequest (apiRequest retorna JSON parseado — lesson #13).
const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
}));

// Mock useQuery (lesson + progress fetch). Evita rede + ErrorBoundary trick.
const { useQueryMock } = vi.hoisted(() => ({ useQueryMock: vi.fn() }));
vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: useQueryMock,
  };
});

// Mock optional audio player context (LessonViewer chama useOptionalAudioPlayer).
vi.mock('@/contexts/AudioPlayerContext', () => ({
  useOptionalAudioPlayer: () => null,
}));

// Mock Mux Player (web component — substitui por <video> nativo).
vi.mock('@mux/mux-player-react', () => ({
  default: React.forwardRef((props: any, ref: any) => (
    <video ref={ref} data-testid="mux-mock" />
  )),
}));

// Mock useLessonAutoLog + useCoachRecommendationConsume + toast.
vi.mock('@/hooks/useLessonAutoLog', () => ({
  useLessonAutoLog: () => ({ autoLogTriggered: false, dismissToast: vi.fn() }),
}));
vi.mock('@/hooks/useCoachRecommendationConsume', () => ({
  useCoachRecommendationConsume: () => ({ consumed: false }),
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('@/lib/library-video-speed-storage', () => ({
  readVideoSpeed: () => 1,
  writeVideoSpeed: vi.fn(),
}));

// Stub PodcastPlayer / ArticleIframeWithWatermark / NextLessonCTA / LessonAutoLogToast.
vi.mock('@/components/biblioteca/PodcastPlayer', () => ({
  PodcastPlayer: () => <div data-testid="podcast-stub" />,
}));
vi.mock('@/components/biblioteca/ArticleIframeWithWatermark', () => ({
  ArticleIframeWithWatermark: () => <div data-testid="article-stub" />,
}));
vi.mock('@/components/biblioteca/NextLessonCTA', () => ({
  NextLessonCTA: () => null,
}));
vi.mock('@/components/study/LessonAutoLogToast', () => ({
  LessonAutoLogToast: () => null,
}));

const fakeLesson = {
  id: 'lesson-aaa',
  slug: 'intro',
  courseSlug: 'curso-x',
  title: 'Aula',
  formats: {
    video: {
      mux: { playbackId: 'playback-id' },
      durationSeconds: 600,
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockResolvedValue({ completed: false, watchedPct: 5 });
  // useQuery shape: [lessonQuery, progressQuery, courseQuery]
  useQueryMock.mockImplementation((opts: any) => {
    const key = JSON.stringify(opts?.queryKey ?? []);
    if (key.includes('library-lesson')) {
      return { data: fakeLesson, isLoading: false, error: null };
    }
    if (key.includes('library-progress')) {
      return { data: {}, isLoading: false, error: null };
    }
    if (key.includes('library-course')) {
      return { data: null, isLoading: false, error: null };
    }
    return { data: undefined, isLoading: false, error: null };
  });
});

afterEach(() => {
  cleanup();
});

describe('LessonViewer — RF-05 PATCH /api/library/lessons/:id/progress', () => {
  it('emite PATCH 1x apos burst de timeupdate (throttle 5s)', async () => {
    vi.useFakeTimers();

    const { LessonViewer } = await import('@/pages/biblioteca/LessonViewer');

    const { container } = render(
      <LessonViewer
        lessonId="lesson-aaa"
        courseSlug="curso-x"
        lessonSlug="intro"
        userPlatformId="USER-0001"
      />,
    );

    // Localiza o <video> mock que substitui MuxPlayer; em ausencia, query mux-mock.
    const video =
      (container.querySelector('video') as HTMLVideoElement | null) ??
      (container.querySelector('[data-testid="mux-mock"]') as HTMLVideoElement | null);

    expect(video).not.toBeNull();

    // Define currentTime/duration via Object.defineProperty (jsdom permite).
    Object.defineProperty(video!, 'currentTime', { value: 10, writable: true, configurable: true });
    Object.defineProperty(video!, 'duration', { value: 600, writable: true, configurable: true });

    await act(async () => {
      for (let i = 0; i < 5; i++) {
        (video as any).currentTime = 10 + i * 2;
        fireEvent(video!, new Event('timeupdate'));
      }
    });

    // Antes do throttle expirar: deve ter no MAXIMO 1 chamada PATCH (a primeira).
    const patchCalls = apiRequestMock.mock.calls.filter(
      (c: any[]) => c[0] === 'PATCH' && typeof c[1] === 'string' && c[1].includes('/api/library/lessons/lesson-aaa/progress'),
    );
    expect(patchCalls.length).toBe(1);

    // Valida shape do payload.
    const payload = patchCalls[0][2];
    expect(payload).toMatchObject({
      format: 'video',
      lastPositionSeconds: expect.any(Number),
      totalDurationSeconds: 600,
    });

    vi.useRealTimers();
  });

  it('apos esperar > 5s emite segundo PATCH na proxima timeupdate', async () => {
    vi.useFakeTimers();

    const { LessonViewer } = await import('@/pages/biblioteca/LessonViewer');

    const { container } = render(
      <LessonViewer
        lessonId="lesson-aaa"
        courseSlug="curso-x"
        lessonSlug="intro"
        userPlatformId="USER-0001"
      />,
    );

    const video =
      (container.querySelector('video') as HTMLVideoElement | null) ??
      (container.querySelector('[data-testid="mux-mock"]') as HTMLVideoElement | null);
    expect(video).not.toBeNull();

    Object.defineProperty(video!, 'currentTime', { value: 10, writable: true, configurable: true });
    Object.defineProperty(video!, 'duration', { value: 600, writable: true, configurable: true });

    await act(async () => {
      fireEvent(video!, new Event('timeupdate'));
    });

    // Avanca relogio 6s.
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });

    await act(async () => {
      (video as any).currentTime = 30;
      fireEvent(video!, new Event('timeupdate'));
    });

    const patchCalls = apiRequestMock.mock.calls.filter(
      (c: any[]) => c[0] === 'PATCH' && typeof c[1] === 'string' && c[1].includes('/api/library/lessons/lesson-aaa/progress'),
    );
    expect(patchCalls.length).toBe(2);

    vi.useRealTimers();
  });
});
