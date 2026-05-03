// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint UX-Biblioteca-1 / RF-03
//
// Spec: Docs/specs/ux-biblioteca-1.md RF-03
// ADR:  Docs/architecture/decisions/104-library-video-speed-global-localstorage.md
//
// Page target: client/src/pages/biblioteca/LessonViewer.tsx (existe — modificar VideoPanel)
//
// Mudanca esperada em RF-03:
//   - <MuxPlayer> recebe prop playbackRates={[0.75, 1, 1.25, 1.5, 1.75, 2]}.
//   - Mount com localStorage 'library-video-speed' = "1.5" -> player playback rate = 1.5
//     (via prop defaultPlaybackRate ou similar).
//   - Mudanca via UI -> chama writeVideoSpeed (helper).
//
// Estrategia: capturar props passadas ao MuxPlayer via vi.mock
//
// Lessons aplicadas:
//   #14 vi.hoisted para spy compartilhado
//   #15 polyfill localStorage ja em setup
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { apiRequestMock, muxPlayerPropsCapture } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  muxPlayerPropsCapture: { current: null as any },
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: { invalidateQueries: vi.fn() },
  getCsrfToken: () => null,
}));

// Mock MuxPlayer para capturar props que o VideoPanel passa.
vi.mock('@mux/mux-player-react', () => {
  const ReactMod = require('react');
  const MuxPlayer = ReactMod.forwardRef((props: any, ref: any) => {
    muxPlayerPropsCapture.current = props;
    return ReactMod.createElement('div', {
      'data-testid': 'mux-player-mock',
      ref,
    });
  });
  return { default: MuxPlayer, MuxPlayer };
});

vi.mock('@/contexts/AudioPlayerContext', () => ({
  useOptionalAudioPlayer: () => null,
  AudioPlayerProvider: ({ children }: any) => children,
}));

// Mock toast.
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

// Mock components imported by LessonViewer that are heavy.
vi.mock('../../../components/biblioteca/PodcastPlayer', () => ({
  PodcastPlayer: () => null,
}));
vi.mock('../../../components/biblioteca/ArticleIframeWithWatermark', () => ({
  ArticleIframeWithWatermark: () => null,
}));

import { LessonViewer } from '../LessonViewer';

function renderWithQuery(props: any) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <LessonViewer {...props} />
    </QueryClientProvider>,
  );
}

const lessonData = {
  id: 'lesson-1',
  slug: 'aula-1',
  courseSlug: 'curso-x',
  title: 'Aula 1',
  subtitle: null,
  displayLabel: '01',
  formats: {
    video: {
      mux: { playbackId: 'pb-123' },
      durationSeconds: 600,
    },
  },
};

const progressData = { video: { lastPositionSeconds: 0, totalDurationSeconds: 600 } };

const courseData = {
  id: 'curso-x',
  slug: 'curso-x',
  title: 'Curso X',
  modules: [{ id: 'm-1', slug: 'm-1', title: 'M1', lessons: [{ id: 'lesson-1', slug: 'aula-1', title: 'Aula 1' }] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockReset();
  muxPlayerPropsCapture.current = null;
  apiRequestMock.mockImplementation(async (method: string, url: string) => {
    if (url === '/api/library/lessons/lesson-1') return lessonData;
    if (url.startsWith('/api/library/lessons/lesson-1/progress')) return progressData;
    if (url === '/api/library/courses/curso-x') return courseData;
    return null;
  });
  try {
    localStorage.clear();
  } catch {}
});

afterEach(() => cleanup());

// =============================================================================
// RF-03 — playbackRates prop passada ao MuxPlayer
// =============================================================================
describe('<LessonViewer> VideoPanel — RF-03 playbackRates', () => {
  it('MuxPlayer deve receber prop playbackRates com 6 opcoes [0.75, 1, 1.25, 1.5, 1.75, 2]', async () => {
    renderWithQuery({
      lessonId: 'lesson-1',
      courseSlug: 'curso-x',
      lessonSlug: 'aula-1',
      userPlatformId: 'USER-0001',
    });
    await waitFor(() => {
      expect(muxPlayerPropsCapture.current).not.toBeNull();
    });
    const props = muxPlayerPropsCapture.current;
    expect(props.playbackRates).toEqual([0.75, 1, 1.25, 1.5, 1.75, 2]);
  });
});

// =============================================================================
// RF-03 — restauracao de velocidade do localStorage
// =============================================================================
describe('<LessonViewer> VideoPanel — RF-03 restore from localStorage', () => {
  it('Mount com localStorage library-video-speed=1.5 deve aplicar velocidade 1.5 no player', async () => {
    localStorage.setItem('library-video-speed', '1.5');
    renderWithQuery({
      lessonId: 'lesson-1',
      courseSlug: 'curso-x',
      lessonSlug: 'aula-1',
      userPlatformId: 'USER-0001',
    });
    await waitFor(() => {
      expect(muxPlayerPropsCapture.current).not.toBeNull();
    });
    const props = muxPlayerPropsCapture.current;
    // Implementer pode usar defaultPlaybackRate, playbackRate, ou outra prop.
    // Aceitamos qualquer prop que carregue o numero 1.5 (defesa em depth).
    const speed =
      props.defaultPlaybackRate ??
      props.playbackRate ??
      props['default-playback-rate'] ??
      props['playback-rate'];
    expect(speed).toBe(1.5);
  });

  it('Mount sem localStorage deve usar default 1.0', async () => {
    renderWithQuery({
      lessonId: 'lesson-1',
      courseSlug: 'curso-x',
      lessonSlug: 'aula-1',
      userPlatformId: 'USER-0001',
    });
    await waitFor(() => {
      expect(muxPlayerPropsCapture.current).not.toBeNull();
    });
    const props = muxPlayerPropsCapture.current;
    const speed =
      props.defaultPlaybackRate ??
      props.playbackRate ??
      props['default-playback-rate'] ??
      props['playback-rate'] ??
      1.0;
    expect(speed).toBe(1.0);
  });

  it('Mount com localStorage invalido (NaN) deve usar default 1.0', async () => {
    localStorage.setItem('library-video-speed', 'invalido');
    renderWithQuery({
      lessonId: 'lesson-1',
      courseSlug: 'curso-x',
      lessonSlug: 'aula-1',
      userPlatformId: 'USER-0001',
    });
    await waitFor(() => {
      expect(muxPlayerPropsCapture.current).not.toBeNull();
    });
    const props = muxPlayerPropsCapture.current;
    const speed =
      props.defaultPlaybackRate ??
      props.playbackRate ??
      props['default-playback-rate'] ??
      props['playback-rate'] ??
      1.0;
    expect(speed).toBe(1.0);
  });

  it('Mount com localStorage fora do range (99) deve usar default 1.0', async () => {
    localStorage.setItem('library-video-speed', '99');
    renderWithQuery({
      lessonId: 'lesson-1',
      courseSlug: 'curso-x',
      lessonSlug: 'aula-1',
      userPlatformId: 'USER-0001',
    });
    await waitFor(() => {
      expect(muxPlayerPropsCapture.current).not.toBeNull();
    });
    const props = muxPlayerPropsCapture.current;
    const speed =
      props.defaultPlaybackRate ??
      props.playbackRate ??
      props['default-playback-rate'] ??
      props['playback-rate'] ??
      1.0;
    expect(speed).toBe(1.0);
  });
});
