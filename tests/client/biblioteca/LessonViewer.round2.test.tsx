import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Sprint Biblioteca-1 / Round 2 — LessonViewer additions
// Covers: F14 alt (formats summary), F-A4.5 (article font size selector),
//         F-A4.8 (progress label), F-A10.1 (a11y aria-controls), F-A3.4 (icons),
//         F-A4.6 (loading skeleton).
// =============================================================================

const fetchLessonMock = vi.fn();
const fetchProgressMock = vi.fn();

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async (method: string, url: string) => {
    if (method === 'GET' && url.includes('/progress')) return fetchProgressMock(url);
    if (method === 'GET' && /\/api\/library\/lessons\/[^/]+$/.test(url)) {
      return fetchLessonMock(url);
    }
    return null;
  }),
  queryClient: { invalidateQueries: vi.fn() },
}));

vi.mock('@mux/mux-player-react', () => ({
  default: (props: any) => (
    <div data-testid="mux-player-mock" data-playback-id={props.playbackId} />
  ),
}));

import { LessonViewer } from '../../../client/src/pages/biblioteca/LessonViewer';

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
}

function renderViewer(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={makeClient()}>{ui}</QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  try {
    localStorage.removeItem('library:article:fontSize');
  } catch {
    // ignore
  }
  fetchProgressMock.mockResolvedValue({});
  fetchLessonMock.mockResolvedValue({
    id: 'l1',
    slug: 'a1',
    courseSlug: 'curso',
    title: 'A1',
    subtitle: 'Sub',
    formats: {
      video: { mux: { playbackId: 'pb' }, durationSeconds: 600 },
      podcast: { audioUrl: '/api/library/lessons/l1/audio', durationSeconds: 1200, mimeType: 'audio/mp4' },
      article: { html: '<p>conteudo</p>', wordCount: 1 },
    },
  });
});

describe('<LessonViewer> Round 2 - F14 formats summary', () => {
  it('mostra subtitulo "Esta aula tem: Video, Podcast, Artigo." quando 3 formatos', async () => {
    renderViewer(
      <LessonViewer lessonId="l1" courseSlug="curso" lessonSlug="a1" />,
    );
    await waitFor(() => screen.getByTestId('lesson-formats-summary'));
    const summary = screen.getByTestId('lesson-formats-summary');
    expect(summary.textContent).toMatch(/Video, Podcast, Artigo/);
    expect(summary.textContent).not.toMatch(/Outros formatos nao disponiveis/);
  });

  it('mostra "Outros formatos nao disponiveis" quando ha menos de 3 formatos', async () => {
    fetchLessonMock.mockResolvedValue({
      id: 'l1',
      slug: 'a1',
      courseSlug: 'curso',
      title: 'A1',
      formats: {
        article: { html: '<p>conteudo</p>', wordCount: 1 },
      },
    });
    renderViewer(
      <LessonViewer lessonId="l1" courseSlug="curso" lessonSlug="a1" />,
    );
    await waitFor(() => screen.getByTestId('lesson-formats-summary'));
    const summary = screen.getByTestId('lesson-formats-summary');
    expect(summary.textContent).toMatch(/Outros formatos nao disponiveis/);
  });
});

describe('<LessonViewer> Round 2 - F-A10.1 a11y tabs', () => {
  it('tab ativa tem aria-controls + aria-selected=true + tabIndex=0', async () => {
    renderViewer(
      <LessonViewer lessonId="l1" courseSlug="curso" lessonSlug="a1" />,
    );
    await waitFor(() => screen.getByTestId('lesson-format-tab-video'));
    const videoTab = screen.getByTestId('lesson-format-tab-video');
    expect(videoTab.getAttribute('aria-selected')).toBe('true');
    expect(videoTab.getAttribute('aria-controls')).toBe('lesson-format-panel-video');
    expect(videoTab.getAttribute('tabindex')).toBe('0');

    const podcastTab = screen.getByTestId('lesson-format-tab-podcast');
    expect(podcastTab.getAttribute('aria-selected')).toBe('false');
    expect(podcastTab.getAttribute('tabindex')).toBe('-1');
  });

  it('panel de video tem role=tabpanel + aria-labelledby + id', async () => {
    renderViewer(
      <LessonViewer lessonId="l1" courseSlug="curso" lessonSlug="a1" />,
    );
    await waitFor(() => screen.getByTestId('lesson-format-panel-video'));
    const panel = screen.getByTestId('lesson-format-panel-video');
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe('lesson-format-tab-video');
    expect(panel.getAttribute('id')).toBe('lesson-format-panel-video');
  });
});

describe('<LessonViewer> Round 2 - F-A4.5 article font size', () => {
  it('botoes A-/A/A+ mudam tamanho e persistem em localStorage', async () => {
    renderViewer(
      <LessonViewer lessonId="l1" courseSlug="curso" lessonSlug="a1" />,
    );
    await waitFor(() => screen.getByTestId('lesson-format-tab-article'));
    const user = userEvent.setup();
    await user.click(screen.getByTestId('lesson-format-tab-article'));

    const article = await waitFor(() =>
      screen.getByTestId('lesson-format-panel-article'),
    );
    expect(article.getAttribute('data-font-size')).toBe('md');

    await user.click(screen.getByTestId('article-font-size-lg'));
    await waitFor(() => {
      expect(
        screen.getByTestId('lesson-format-panel-article').getAttribute('data-font-size'),
      ).toBe('lg');
    });
    expect(localStorage.getItem('library:article:fontSize')).toBe('lg');

    await user.click(screen.getByTestId('article-font-size-sm'));
    await waitFor(() => {
      expect(
        screen.getByTestId('lesson-format-panel-article').getAttribute('data-font-size'),
      ).toBe('sm');
    });
    expect(localStorage.getItem('library:article:fontSize')).toBe('sm');
  });

  it('aria-pressed reflete tamanho ativo', async () => {
    renderViewer(
      <LessonViewer lessonId="l1" courseSlug="curso" lessonSlug="a1" />,
    );
    const user = userEvent.setup();
    await waitFor(() => screen.getByTestId('lesson-format-tab-article'));
    await user.click(screen.getByTestId('lesson-format-tab-article'));
    await waitFor(() => screen.getByTestId('article-font-size-md'));
    expect(screen.getByTestId('article-font-size-md').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByTestId('article-font-size-lg').getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
});

describe('<LessonViewer> Round 2 - F-A4.8 progress label', () => {
  it('mostra "Progresso da aula: X%" + formato dono do max', async () => {
    fetchProgressMock.mockResolvedValue({
      podcast: { lastPositionSeconds: 600, totalDurationSeconds: 1200 },
    });
    renderViewer(
      <LessonViewer lessonId="l1" courseSlug="curso" lessonSlug="a1" />,
    );
    await waitFor(() => screen.getByTestId('lesson-progress-label'));
    const label = screen.getByTestId('lesson-progress-label');
    expect(label.textContent).toMatch(/Progresso da aula: 50%/);
    expect(label.textContent).toMatch(/Podcast/);
  });

  it('quando sem progresso ainda mostra label com 0%', async () => {
    renderViewer(
      <LessonViewer lessonId="l1" courseSlug="curso" lessonSlug="a1" />,
    );
    await waitFor(() => screen.getByTestId('lesson-progress-label'));
    const label = screen.getByTestId('lesson-progress-label');
    expect(label.textContent).toMatch(/Progresso da aula: 0%/);
  });
});

describe('<LessonViewer> Round 2 - F-A4.6 skeleton loading', () => {
  it('loading state renderiza skeleton com aspect-video frame', async () => {
    fetchLessonMock.mockImplementation(() => new Promise(() => {}));
    renderViewer(
      <LessonViewer lessonId="l1" courseSlug="curso" lessonSlug="a1" />,
    );
    expect(screen.getByTestId('lesson-viewer-loading')).toBeInTheDocument();
    // 3 ghost tabs presentes
    const loading = screen.getByTestId('lesson-viewer-loading');
    expect(loading.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(4);
  });
});
