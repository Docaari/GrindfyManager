import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / RF-08 — LessonViewer (3-format viewer)
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-08 + D5 + D6 + D8
//
// Componente target: client/src/pages/biblioteca/LessonViewer.tsx (NAO EXISTE)
//
// Lessons aplicadas:
//   - #1 hooks primeiro (early return APOS hooks)
//   - #2 data-testid estavel (lesson-viewer, lesson-format-tab-*, etc)
//   - #11 default minimo (CTA so se hasAccess; tabs so se formato disponivel)
//   - #12 estado persistente — AudioPlayerContext sobrevive navegacao
// =============================================================================

// Mock react-query for tests
function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  });
}

function renderWithClient(ui: React.ReactElement) {
  const client = makeClient();
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

// Mock fetch / queryClient para os hooks internos.
const fetchLessonMock = vi.fn();
const fetchProgressMock = vi.fn();
const patchProgressMock = vi.fn();
const postEventMock = vi.fn();

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async (method: string, url: string, body?: any) => {
    if (method === 'GET' && url.includes('/progress')) return fetchProgressMock(url);
    if (method === 'GET' && /\/api\/library\/lessons\/[^/]+$/.test(url)) {
      return fetchLessonMock(url);
    }
    if (method === 'PATCH' && url.includes('/progress')) return patchProgressMock(body);
    if (method === 'POST' && url.includes('/events')) return postEventMock(body);
    return null;
  }),
  queryClient: { invalidateQueries: vi.fn() },
}));

// Mock Mux Player react para ambiente jsdom (nao executa HLS)
vi.mock('@mux/mux-player-react', () => ({
  default: (props: any) => (
    <div data-testid="mux-player-mock" data-playback-id={props.playbackId} />
  ),
}));

// Componente target (red phase)
// @ts-expect-error - componente nao existe
import { LessonViewer } from '../../../client/src/pages/biblioteca/LessonViewer';

beforeEach(() => {
  vi.clearAllMocks();
  fetchLessonMock.mockResolvedValue({
    id: 'l1',
    slug: 'a1-mentalidade',
    courseSlug: 'antes-das-cartas',
    title: 'A1 - Mentalidade',
    subtitle: 'Sub',
    categoryId: 'performance_mental',
    tags: ['mindset'],
    coverUrl: '/api/library/assets/cover.jpg',
    formats: {
      video: { mux: { playbackId: 'pb_xyz' }, durationSeconds: 1320 },
      podcast: {
        audioUrl: '/api/library/lessons/l1/audio',
        durationSeconds: 1500,
        mimeType: 'audio/mp4',
      },
      article: { html: '<p>conteudo limpo</p>', wordCount: 2 },
    },
  });
  fetchProgressMock.mockResolvedValue({});
  patchProgressMock.mockResolvedValue({ updated: true, completed: false });
  postEventMock.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// Tabs renderizam apenas formatos disponiveis
// ---------------------------------------------------------------------------

describe('<LessonViewer> — tabs renderizam apenas formatos disponiveis', () => {
  it('deve renderizar 3 tabs quando lesson tem video+podcast+article', async () => {
    renderWithClient(
      <LessonViewer lessonId="l1" courseSlug="antes-das-cartas" lessonSlug="a1-mentalidade" />
    );
    await waitFor(() => {
      expect(screen.getByTestId('lesson-format-tab-video')).toBeInTheDocument();
      expect(screen.getByTestId('lesson-format-tab-podcast')).toBeInTheDocument();
      expect(screen.getByTestId('lesson-format-tab-article')).toBeInTheDocument();
    });
  });

  it('deve renderizar apenas tab Article quando lesson so tem artigo', async () => {
    fetchLessonMock.mockResolvedValue({
      id: 'l1',
      slug: 'art-only',
      courseSlug: 'antes-das-cartas',
      title: 'Article-Only',
      formats: {
        article: { html: '<p>so artigo</p>', wordCount: 2 },
      },
    });
    renderWithClient(
      <LessonViewer lessonId="l1" courseSlug="antes-das-cartas" lessonSlug="art-only" />
    );
    await waitFor(() => {
      expect(screen.getByTestId('lesson-format-tab-article')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('lesson-format-tab-video')).toBeNull();
    expect(screen.queryByTestId('lesson-format-tab-podcast')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sync de progresso cross-format (D5)
// ---------------------------------------------------------------------------

describe('<LessonViewer> — sync cross-format (D5 segundos absolutos)', () => {
  it('ao trocar tab Podcast (lastPos=720s) -> Video, video deve abrir em 720s', async () => {
    fetchProgressMock.mockResolvedValue({
      podcast: { lastPositionSeconds: 720, totalDurationSeconds: 1500 },
    });
    renderWithClient(
      <LessonViewer lessonId="l1" courseSlug="antes-das-cartas" lessonSlug="a1-mentalidade" />
    );
    const user = userEvent.setup();
    await waitFor(() => screen.getByTestId('lesson-format-tab-video'));
    await user.click(screen.getByTestId('lesson-format-tab-video'));
    // Player de video monta com data-start-seconds=720
    await waitFor(() => {
      const videoPanel = screen.getByTestId('lesson-format-panel-video');
      expect(videoPanel.getAttribute('data-start-seconds')).toBe('720');
    });
  });

  it('quando posicao excede totalDuration destino, fallback para 0 (D5)', async () => {
    // Podcast em 1500s mas video so tem 720s -> abre em 0
    fetchLessonMock.mockResolvedValue({
      id: 'l1',
      slug: 'short-vid',
      courseSlug: 'cs',
      title: 'X',
      formats: {
        video: { mux: { playbackId: 'pb_xyz' }, durationSeconds: 720 },
        podcast: { audioUrl: '/api/library/lessons/l1/audio', durationSeconds: 1500, mimeType: 'audio/mp4' },
      },
    });
    fetchProgressMock.mockResolvedValue({
      podcast: { lastPositionSeconds: 1400, totalDurationSeconds: 1500 },
    });
    renderWithClient(
      <LessonViewer lessonId="l1" courseSlug="cs" lessonSlug="short-vid" />
    );
    const user = userEvent.setup();
    await waitFor(() => screen.getByTestId('lesson-format-tab-video'));
    await user.click(screen.getByTestId('lesson-format-tab-video'));
    await waitFor(() => {
      const videoPanel = screen.getByTestId('lesson-format-panel-video');
      expect(videoPanel.getAttribute('data-start-seconds')).toBe('0');
    });
  });
});

// ---------------------------------------------------------------------------
// Watermark (D8)
// ---------------------------------------------------------------------------

describe('<LessonViewer> — watermark video', () => {
  it('deve renderizar watermark com userPlatformId', async () => {
    renderWithClient(
      <LessonViewer
        lessonId="l1"
        courseSlug="cs"
        lessonSlug="a1"
        userPlatformId="USER-1234"
      />
    );
    await waitFor(() => {
      const wm = screen.getByTestId('lesson-video-watermark');
      expect(wm.textContent).toContain('USER-1234');
    });
  });
});

// ---------------------------------------------------------------------------
// ProgressBar compartilhado (max% entre formatos)
// ---------------------------------------------------------------------------

describe('<LessonViewer> — ProgressBar compartilhado', () => {
  it('deve mostrar max% entre formatos', async () => {
    fetchProgressMock.mockResolvedValue({
      video: { lastPositionSeconds: 660, totalDurationSeconds: 1320 },
      podcast: { lastPositionSeconds: 750, totalDurationSeconds: 1500 },
    });
    renderWithClient(
      <LessonViewer lessonId="l1" courseSlug="cs" lessonSlug="a1" />
    );
    await waitFor(() => {
      const bar = screen.getByTestId('lesson-progress-bar');
      // max(660/1320=50%, 750/1500=50%) = 50% — boundary igual
      expect(bar.getAttribute('aria-valuenow')).toMatch(/^5[01]$/);
    });
  });
});

// ---------------------------------------------------------------------------
// Lesson #1 — hooks primeiro, early return so depois
// ---------------------------------------------------------------------------

describe('<LessonViewer> — Lesson #1 hooks first, early return after', () => {
  it('mesmo sem userPlatformId nao deve quebrar Rules of Hooks', async () => {
    expect(() =>
      renderWithClient(
        <LessonViewer lessonId="l1" courseSlug="cs" lessonSlug="a1" />
      )
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Acesso bloqueado redireciona + toast + log evento access_blocked
// ---------------------------------------------------------------------------

describe('<LessonViewer> — acesso bloqueado', () => {
  it('quando lesson retorna 401, deve registrar evento access_blocked', async () => {
    // F3a fix: shape real do erro lancado por apiRequest eh
    // { response: { status, data } } (queryClient throwIfResNotOk).
    // Mock anterior usava `{ status: 401 }` (legacy shape) que mascarava o bug.
    const err: any = new Error('access_denied');
    err.response = { status: 401, data: { message: 'access_denied' } };
    fetchLessonMock.mockRejectedValue(err);
    renderWithClient(
      <LessonViewer lessonId="l1" courseSlug="cs" lessonSlug="a1" />
    );
    await waitFor(() => {
      // Espera POST /events com eventType access_blocked
      const calls = postEventMock.mock.calls;
      const hasAccessBlocked = calls.some((c) => c[0]?.eventType === 'access_blocked');
      expect(hasAccessBlocked).toBe(true);
    });
  });
});
