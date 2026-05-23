// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-01 — lesson.completion_pct_25/50/75/100
//
// Spec: Docs/specs/sprint-mp-validation.md RF-01 §5 Lesson (5 eventos).
// ADR-207 §4: dedupe 1x per session + (action, lessonId).
//
// Cobertura:
//   - timeupdate atinge 25%/50%/75%/100% → emit 1x cada threshold.
//   - Cada threshold emite EXATAMENTE 1x por sessao+lesson (Set dedupe).
//   - Repetir o mesmo timeupdate apos cross do threshold NAO re-emite.
//
// Lessons: #14/#26/#38 (await import).
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

const { emitLessonMock, apiRequestMock } = vi.hoisted(() => ({
  emitLessonMock: vi.fn(),
  apiRequestMock: vi.fn(),
}));

vi.mock('@/lib/activity-telemetry', () => ({
  emitAudioEvent: vi.fn(),
  emitLessonEvent: emitLessonMock,
  emitCoachEvent: vi.fn(),
  emitLibraryEvent: vi.fn(),
  flushBacklog: vi.fn(),
  _resetForTests: vi.fn(),
}));
vi.mock('@/lib/audio-telemetry', () => ({
  emitAudioEvent: vi.fn(),
  flushBacklog: vi.fn(),
  _resetForTests: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
}));

const { useQueryMock } = vi.hoisted(() => ({ useQueryMock: vi.fn() }));
vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return { ...actual, useQuery: useQueryMock };
});

vi.mock('@/contexts/AudioPlayerContext', () => ({ useOptionalAudioPlayer: () => null }));
vi.mock('@mux/mux-player-react', () => ({
  default: React.forwardRef((props: any, ref: any) => <video ref={ref} data-testid="mux-mock" />),
}));
vi.mock('@/hooks/useLessonAutoLog', () => ({
  useLessonAutoLog: () => ({ autoLogTriggered: false, dismissToast: vi.fn() }),
}));
vi.mock('@/hooks/useCoachRecommendationConsume', () => ({
  useCoachRecommendationConsume: () => ({ consumed: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/library-video-speed-storage', () => ({
  readVideoSpeed: () => 1,
  writeVideoSpeed: vi.fn(),
}));
vi.mock('@/components/biblioteca/PodcastPlayer', () => ({
  PodcastPlayer: () => <div data-testid="podcast-stub" />,
}));
vi.mock('@/components/biblioteca/ArticleIframeWithWatermark', () => ({
  ArticleIframeWithWatermark: () => <div data-testid="article-stub" />,
}));
vi.mock('@/components/biblioteca/NextLessonCTA', () => ({ NextLessonCTA: () => null }));
vi.mock('@/components/study/LessonAutoLogToast', () => ({ LessonAutoLogToast: () => null }));

const fakeLesson = {
  id: 'lesson-ccc',
  slug: 'intro',
  courseSlug: 'cx',
  title: 'Aula',
  formats: { video: { mux: { playbackId: 'pid' }, durationSeconds: 1000 } },
};

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockResolvedValue({ completed: false });
  useQueryMock.mockImplementation((opts: any) => {
    const key = JSON.stringify(opts?.queryKey ?? []);
    if (key.includes('library-lesson')) return { data: fakeLesson, isLoading: false, error: null };
    if (key.includes('library-progress')) return { data: {}, isLoading: false, error: null };
    if (key.includes('library-course')) return { data: null, isLoading: false, error: null };
    return { data: undefined, isLoading: false, error: null };
  });
});

afterEach(() => cleanup());

describe('LessonViewer — RF-01 lesson.completion_pct_*', () => {
  it('emite cada threshold (25/50/75/100) exatamente 1x ao cruzar', async () => {
    const { LessonViewer } = await import('@/pages/biblioteca/LessonViewer');

    const { container } = render(
      <LessonViewer
        lessonId="lesson-ccc"
        courseSlug="cx"
        lessonSlug="intro"
        userPlatformId="USER-0001"
      />,
    );

    const video =
      (container.querySelector('video') as HTMLVideoElement | null) ??
      (container.querySelector('[data-testid="mux-mock"]') as HTMLVideoElement | null);
    expect(video).not.toBeNull();

    Object.defineProperty(video!, 'duration', { value: 1000, writable: true, configurable: true });

    const fireAt = async (sec: number) => {
      (video as any).currentTime = sec;
      await act(async () => {
        fireEvent(video!, new Event('timeupdate'));
      });
    };

    // Cruza thresholds em ordem.
    await fireAt(260); // 26%
    await fireAt(510); // 51%
    await fireAt(760); // 76%
    await fireAt(1000); // 100%

    const actionsEmitted = emitLessonMock.mock.calls.map((c: any[]) => c[0]);

    expect(actionsEmitted.filter((a: string) => a === 'lesson.completion_pct_25').length).toBe(1);
    expect(actionsEmitted.filter((a: string) => a === 'lesson.completion_pct_50').length).toBe(1);
    expect(actionsEmitted.filter((a: string) => a === 'lesson.completion_pct_75').length).toBe(1);
    expect(actionsEmitted.filter((a: string) => a === 'lesson.completion_pct_100').length).toBe(1);
  });

  it('re-disparar timeupdate apos cruzar threshold NAO re-emite (dedupe)', async () => {
    const { LessonViewer } = await import('@/pages/biblioteca/LessonViewer');

    const { container } = render(
      <LessonViewer
        lessonId="lesson-ccc"
        courseSlug="cx"
        lessonSlug="intro"
        userPlatformId="USER-0001"
      />,
    );

    const video =
      (container.querySelector('video') as HTMLVideoElement | null) ??
      (container.querySelector('[data-testid="mux-mock"]') as HTMLVideoElement | null);

    Object.defineProperty(video!, 'duration', { value: 1000, writable: true, configurable: true });

    for (let i = 0; i < 5; i++) {
      (video as any).currentTime = 260 + i;
      await act(async () => {
        fireEvent(video!, new Event('timeupdate'));
      });
    }

    const count25 = emitLessonMock.mock.calls.filter(
      (c: any[]) => c[0] === 'lesson.completion_pct_25',
    ).length;
    expect(count25).toBe(1);
  });
});
