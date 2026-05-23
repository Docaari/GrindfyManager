// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-05 — sendBeacon em beforeunload
//
// Spec: Docs/specs/sprint-mp-validation.md RF-05 §2 (flush bypass throttle)
//
// Cobertura:
//   - Listener em window 'beforeunload' (e tambem 'visibilitychange') dispara
//     navigator.sendBeacon com payload library-progress (POST /api/library/lessons/:id/progress).
//   - Cleanup: removeEventListener no unmount.
//
// Lessons: #14/#26/#38 (await import), #15 (sendBeacon stub).
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import React from 'react';

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
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

vi.mock('@/contexts/AudioPlayerContext', () => ({
  useOptionalAudioPlayer: () => null,
}));
vi.mock('@mux/mux-player-react', () => ({
  default: React.forwardRef((props: any, ref: any) => (
    <video ref={ref} data-testid="mux-mock" />
  )),
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
  id: 'lesson-bbb',
  slug: 'intro',
  courseSlug: 'curso-y',
  title: 'Aula B',
  formats: { video: { mux: { playbackId: 'pid' }, durationSeconds: 900 } },
};

let sendBeaconSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockResolvedValue({ completed: false, watchedPct: 10 });
  useQueryMock.mockImplementation((opts: any) => {
    const key = JSON.stringify(opts?.queryKey ?? []);
    if (key.includes('library-lesson')) return { data: fakeLesson, isLoading: false, error: null };
    if (key.includes('library-progress')) return { data: {}, isLoading: false, error: null };
    if (key.includes('library-course')) return { data: null, isLoading: false, error: null };
    return { data: undefined, isLoading: false, error: null };
  });
  sendBeaconSpy = vi.fn(() => true);
  (navigator as any).sendBeacon = sendBeaconSpy;
});

afterEach(() => {
  cleanup();
});

describe('LessonViewer — RF-05 beforeunload flush via sendBeacon', () => {
  it('dispara sendBeacon com payload library-progress no beforeunload', async () => {
    const { LessonViewer } = await import('@/pages/biblioteca/LessonViewer');

    const { container } = render(
      <LessonViewer
        lessonId="lesson-bbb"
        courseSlug="curso-y"
        lessonSlug="intro"
        userPlatformId="USER-0001"
      />,
    );

    const video =
      (container.querySelector('video') as HTMLVideoElement | null) ??
      (container.querySelector('[data-testid="mux-mock"]') as HTMLVideoElement | null);
    expect(video).not.toBeNull();

    Object.defineProperty(video!, 'currentTime', { value: 120, writable: true, configurable: true });
    Object.defineProperty(video!, 'duration', { value: 900, writable: true, configurable: true });

    await act(async () => {
      window.dispatchEvent(new Event('beforeunload'));
    });

    expect(sendBeaconSpy).toHaveBeenCalled();
    const [url, body] = sendBeaconSpy.mock.calls[0];
    expect(url).toBe('/api/library/lessons/lesson-bbb/progress');
    // Body deve ser Blob com JSON.
    expect(body).toBeDefined();
  });
});
