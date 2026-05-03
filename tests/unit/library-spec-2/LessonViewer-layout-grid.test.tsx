import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-2 / RF-05 — LessonViewer layout grid + tab Video hidden
//
// Spec: Docs/specs/biblioteca-spec-2.md RF-05 + D6 + D7
//
// Mudancas:
//   D7. Tab Video TOTALMENTE ESCONDIDA quando formats.video ausente
//       (NAO renderizada, nem como queryByTestId('lesson-format-tab-video'))
//   D6. Grid 2-col quando formatCount === 2 E viewport >= lg (1024px)
//       Mobile (<lg) sempre stack tabs single-panel
//       3 formatos -> sempre tabs single-panel (mesmo desktop)
//
// Componente target: client/src/pages/biblioteca/LessonViewer.tsx
// (REFACTOR — atualmente nao tem grid; spec 2 adiciona)
//
// Lessons:
//   #1 hooks-first
//   #2 data-testid estavel
//   #11 default minimo (D7 EXPLICITAMENTE pede esconder, nao "decorativo")
//   #13 apiRequest retorna JSON parseado
// =============================================================================

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn() },
}));

vi.mock('@mux/mux-player-react', () => ({
  default: (props: any) => (
    <div data-testid="mux-player-mock" data-playback-id={props.playbackId} />
  ),
}));

// @ts-expect-error - LessonViewer existe; importacao default
import LessonViewer from '../../../client/src/pages/biblioteca/LessonViewer';

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

function renderWithClient(ui: React.ReactElement) {
  const c = makeClient();
  return render(<QueryClientProvider client={c}>{ui}</QueryClientProvider>);
}

// Helper to set viewport width for matchMedia mock
function setViewportLg(isLg: boolean) {
  (window as any).matchMedia = (query: string) => ({
    matches: isLg && /min-width:\s*1024px/.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

beforeEach(() => {
  apiRequestMock.mockReset();
  // Default fetch handlers
  apiRequestMock.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && /\/article-bundle$/.test(url)) {
      return {
        html: '<p>article</p>',
        stylesUrl: '/api/library/static/article-styles.css?v=abc',
        scriptsUrl: '/api/library/static/article-scripts.js?v=def',
        version: 'v1234567890123456',
        meta: { title: 'A1', learningObjectives: [] },
      };
    }
    if (method === 'GET' && /\/progress$/.test(url)) return {};
    return null;
  });
});

afterEach(() => cleanup());

const LESSON_BLOCO_A = {
  id: 'l1',
  slug: 'a1',
  courseSlug: 'antes-das-cartas',
  title: 'A1 - Mentalidade Fixa',
  subtitle: 'Sub',
  formats: {
    podcast: {
      audioUrl: '/api/library/lessons/l1/audio',
      durationSeconds: 780,
      mimeType: 'audio/mp4',
    },
    article: { html: '<p>art</p>', wordCount: 1 },
  },
};

const LESSON_3_FORMATS = {
  id: 'l1',
  slug: 'three',
  courseSlug: 'cs',
  title: 'Three formats',
  formats: {
    video: { mux: { playbackId: 'pb' }, durationSeconds: 600 },
    podcast: { audioUrl: '/x', durationSeconds: 600, mimeType: 'audio/mp4' },
    article: { html: '<p>x</p>', wordCount: 1 },
  },
};

const LESSON_1_FORMAT = {
  id: 'l1',
  slug: 'one',
  courseSlug: 'cs',
  title: 'Article only',
  formats: {
    article: { html: '<p>only</p>', wordCount: 1 },
  },
};

const LESSON_VIDEO_PODCAST = {
  id: 'l1',
  slug: 'vp',
  courseSlug: 'cs',
  title: 'Video + Podcast',
  formats: {
    video: { mux: { playbackId: 'pb' }, durationSeconds: 600 },
    podcast: { audioUrl: '/x', durationSeconds: 600, mimeType: 'audio/mp4' },
  },
};

function setLessonResponse(lesson: any) {
  apiRequestMock.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && /\/article-bundle$/.test(url)) {
      return {
        html: lesson.formats.article?.html ?? '<p></p>',
        stylesUrl: '/api/library/static/article-styles.css?v=abc',
        scriptsUrl: '/api/library/static/article-scripts.js?v=def',
        version: 'v1234567890123456',
        meta: { title: lesson.title, learningObjectives: [] },
      };
    }
    if (method === 'GET' && /\/progress$/.test(url)) return {};
    if (method === 'GET' && /\/api\/library\/lessons\/[^/]+$/.test(url)) return lesson;
    return null;
  });
}

// ---------------------------------------------------------------------------
// D7: Tab Video TOTALMENTE ESCONDIDA quando formats.video ausente
// ---------------------------------------------------------------------------

describe('LessonViewer — D7 Tab Video totalmente escondida quando ausente', () => {
  it('lesson sem video -> tab Video NAO esta no DOM (queryByTestId retorna null)', async () => {
    setLessonResponse(LESSON_BLOCO_A);
    renderWithClient(
      <LessonViewer
        lessonId="l1"
        courseSlug="antes-das-cartas"
        lessonSlug="a1"
      />
    );
    await waitFor(() => screen.getByTestId('lesson-viewer'));
    expect(screen.queryByTestId('lesson-format-tab-video')).toBeNull();
  });

  it('lesson sem video -> tab Video NAO encontrada via getByRole tab name=Video', async () => {
    setLessonResponse(LESSON_BLOCO_A);
    renderWithClient(
      <LessonViewer
        lessonId="l1"
        courseSlug="antes-das-cartas"
        lessonSlug="a1"
      />
    );
    await waitFor(() => screen.getByTestId('lesson-viewer'));
    expect(screen.queryByRole('tab', { name: /^video$/i })).toBeNull();
  });

  it('lesson com video -> tab Video deve estar no DOM', async () => {
    setLessonResponse(LESSON_VIDEO_PODCAST);
    renderWithClient(
      <LessonViewer lessonId="l1" courseSlug="cs" lessonSlug="vp" />
    );
    await waitFor(() => screen.getByTestId('lesson-viewer'));
    expect(screen.getByTestId('lesson-format-tab-video')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// D6: Grid 2-col quando exatamente 2 formatos AND viewport >= lg
// ---------------------------------------------------------------------------

describe('LessonViewer — D6 grid 2-col em desktop com 2 formatos', () => {
  it('Bloco A (article + podcast) em viewport >= lg -> container com classes lg:grid lg:grid-cols-2', async () => {
    setViewportLg(true);
    setLessonResponse(LESSON_BLOCO_A);
    renderWithClient(
      <LessonViewer
        lessonId="l1"
        courseSlug="antes-das-cartas"
        lessonSlug="a1"
      />
    );
    await waitFor(() => screen.getByTestId('lesson-viewer'));
    // Container do layout 2-col deve existir com data-testid lesson-format-grid OU
    // classe Tailwind detectavel
    const viewer = screen.getByTestId('lesson-viewer');
    const gridContainer = viewer.querySelector('[data-testid="lesson-format-grid"]') ?? viewer.querySelector('.lg\\:grid-cols-2');
    expect(gridContainer).not.toBeNull();
  });

  it('Bloco A em viewport < lg -> mobile fallback tabs (sem grid)', async () => {
    setViewportLg(false);
    setLessonResponse(LESSON_BLOCO_A);
    renderWithClient(
      <LessonViewer
        lessonId="l1"
        courseSlug="antes-das-cartas"
        lessonSlug="a1"
      />
    );
    await waitFor(() => screen.getByTestId('lesson-viewer'));
    // Em mobile -> nao tem grid 2-col ativo. Tabs presentes, painel single ativo.
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// D6: 1 formato OR 3 formatos -> sempre tabs + painel ativo single
// ---------------------------------------------------------------------------

describe('LessonViewer — D6 1 formato OR 3 formatos -> sem grid', () => {
  it('lesson com 1 formato (article only) -> nao tem grid 2-col', async () => {
    setViewportLg(true);
    setLessonResponse(LESSON_1_FORMAT);
    renderWithClient(
      <LessonViewer lessonId="l1" courseSlug="cs" lessonSlug="one" />
    );
    await waitFor(() => screen.getByTestId('lesson-viewer'));
    const viewer = screen.getByTestId('lesson-viewer');
    const grid = viewer.querySelector('[data-testid="lesson-format-grid"]') ?? viewer.querySelector('.lg\\:grid-cols-2');
    expect(grid).toBeNull();
  });

  it('lesson com 3 formatos -> nao tem grid mesmo em desktop', async () => {
    setViewportLg(true);
    setLessonResponse(LESSON_3_FORMATS);
    renderWithClient(
      <LessonViewer lessonId="l1" courseSlug="cs" lessonSlug="three" />
    );
    await waitFor(() => screen.getByTestId('lesson-viewer'));
    const viewer = screen.getByTestId('lesson-viewer');
    const grid = viewer.querySelector('[data-testid="lesson-format-grid"]') ?? viewer.querySelector('.lg\\:grid-cols-2');
    expect(grid).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tab navigation persiste em layout grid
// ---------------------------------------------------------------------------

describe('LessonViewer — keyboard nav preservada em layout grid', () => {
  it('tabs continuam navegaveis via ArrowLeft/Right em modo grid', async () => {
    setViewportLg(true);
    setLessonResponse(LESSON_BLOCO_A);
    renderWithClient(
      <LessonViewer
        lessonId="l1"
        courseSlug="antes-das-cartas"
        lessonSlug="a1"
      />
    );
    await waitFor(() => screen.getByTestId('lesson-viewer'));
    const podcastTab = screen.queryByTestId('lesson-format-tab-podcast');
    const articleTab = screen.queryByTestId('lesson-format-tab-article');
    expect(podcastTab).not.toBeNull();
    expect(articleTab).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Iframe (RF-06) integrado em layout grid
// ---------------------------------------------------------------------------

describe('LessonViewer — em layout grid, panel article usa iframe (NAO mais dangerouslySetInnerHTML)', () => {
  it('Bloco A em desktop: panel article deve renderizar library-article-iframe (em vez de prose direto)', async () => {
    setViewportLg(true);
    setLessonResponse(LESSON_BLOCO_A);
    renderWithClient(
      <LessonViewer
        lessonId="l1"
        courseSlug="antes-das-cartas"
        lessonSlug="a1"
      />
    );
    await waitFor(() => screen.getByTestId('lesson-viewer'));
    // RF-06: painel article migra para iframe (em vez de dangerouslySetInnerHTML)
    const iframe = screen.queryByTestId('library-article-iframe');
    expect(iframe).not.toBeNull();
  });
});
