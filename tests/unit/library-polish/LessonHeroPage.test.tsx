// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Bloco-A-Polish / RF-02 + RF-03 + RF-09 — LessonHeroPage routing wrapper
//
// Spec: Docs/specs/biblioteca-spec-bloco-a-polish.md RF-02 + RF-03 + RF-09
// ADRs: 096 (routing), 097 (telemetry enum)
//
// Componente target: client/src/pages/biblioteca/LessonHeroPage.tsx (NAO EXISTE)
//
// Comportamento esperado:
//   1. Mount -> fetch lesson via apiRequest('GET', /api/library/lessons/by-slug/...)
//   2. Loading state com data-testid lesson-hero-page-loading
//   3. Error 404 / 401 / 500 com error states tipados
//   4. localStorage flag === "true" no mount -> setLocation('/play', { replace: true })
//   5. Apos 1s sem flag -> writeFlag + POST /api/library/events { eventType: 'prologue_viewed' }
//   6. onStart -> fire prologue_viewed (defensive) + setLocation('/play')
//   7. onSkipIntro -> fire prologue_skipped + setLocation('/play')
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock framer-motion (mesma estrategia dos outros testes do polish).
vi.mock('framer-motion', () => {
  const React = require('react');
  const passthrough = (tag: string) =>
    React.forwardRef(({ children, ...rest }: any, ref: any) => {
      const {
        initial,
        animate,
        exit,
        transition,
        variants,
        whileHover,
        whileTap,
        whileFocus,
        whileInView,
        onAnimationStart,
        onAnimationComplete,
        ...domProps
      } = rest;
      return React.createElement(tag, { ref, ...domProps }, children);
    });
  return {
    motion: new Proxy({}, { get: (_t, p: string) => passthrough(p) }),
    AnimatePresence: ({ children }: any) => children,
    useReducedMotion: () => false,
  };
});

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn() },
}));

// Mock wouter useLocation (nao usar Router real — isolar)
const setLocationMock = vi.fn();
vi.mock('wouter', () => ({
  Link: ({ href, children, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
  useLocation: () => ['/biblioteca/curso/x/y', setLocationMock],
}));

// Componente target — RED phase, ainda nao existe.
// @ts-expect-error
import { LessonHeroPage } from '../../../client/src/pages/biblioteca/LessonHeroPage';

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
}

function renderPage(props: { courseSlug?: string; lessonSlug?: string } = {}) {
  return render(
    <QueryClientProvider client={makeClient()}>
      <LessonHeroPage
        courseSlug={props.courseSlug ?? 'antes-das-cartas'}
        lessonSlug={props.lessonSlug ?? 'a1-mentalidade'}
      />
    </QueryClientProvider>,
  );
}

const lessonFixture = {
  id: 'lesson-id-123',
  slug: 'a1-mentalidade',
  courseSlug: 'antes-das-cartas',
  title: 'Mentalidade',
  subtitle: 'Sub',
  coverKey: 'covers/a1.jpg',
  durationMinutes: 13,
  formats: ['podcast', 'article'],
  learningObjectives: ['obj1'],
  tags: ['mindset'],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  try {
    localStorage.clear();
  } catch {
    // ok
  }
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// Loading + lesson fetch
// =============================================================================
describe('<LessonHeroPage> — loading + fetch', () => {
  it('deve renderizar loading state durante fetch da lesson', () => {
    apiRequestMock.mockImplementation(() => new Promise(() => {})); // pending forever
    renderPage();
    expect(screen.getByTestId('lesson-hero-page-loading')).toBeInTheDocument();
  });

  it('deve renderizar lesson-hero apos lesson carregada', async () => {
    apiRequestMock.mockResolvedValue(lessonFixture);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('lesson-hero')).toBeInTheDocument();
    });
  });

  it('deve fazer fetch via /api/library/lessons/by-slug/:courseSlug/:lessonSlug', async () => {
    apiRequestMock.mockResolvedValue(lessonFixture);
    renderPage({ courseSlug: 'antes-das-cartas', lessonSlug: 'a1-x' });
    await waitFor(() => {
      // Verifica que apiRequest foi chamado com o path correto.
      const calls = apiRequestMock.mock.calls;
      const found = calls.some(
        (c) =>
          c[0] === 'GET' &&
          typeof c[1] === 'string' &&
          c[1].includes('/api/library/lessons/by-slug/antes-das-cartas/a1-x'),
      );
      expect(found).toBe(true);
    });
  });
});

// =============================================================================
// Error states (404 / 401 / 500)
// =============================================================================
describe('<LessonHeroPage> — error states', () => {
  it('deve renderizar error state quando lesson 404', async () => {
    const err: any = new Error('not found');
    err.response = { status: 404 };
    apiRequestMock.mockRejectedValue(err);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('lesson-hero-page-error')).toBeInTheDocument();
    });
  });

  it('deve renderizar error state com data-status quando 401', async () => {
    const err: any = new Error('unauth');
    err.response = { status: 401 };
    apiRequestMock.mockRejectedValue(err);
    renderPage();
    await waitFor(() => {
      const el = screen.getByTestId('lesson-hero-page-error');
      expect(el.getAttribute('data-status')).toBe('401');
    });
  });
});

// =============================================================================
// localStorage skip — RF-03 + D9
// =============================================================================
describe('<LessonHeroPage> — localStorage flag (RF-03 + D9)', () => {
  it('deve redirecionar para /play imediatamente quando flag === "true"', async () => {
    apiRequestMock.mockResolvedValue(lessonFixture);
    localStorage.setItem('library:lesson:lesson-id-123:hero-seen', 'true');
    renderPage();
    await waitFor(() => {
      expect(setLocationMock).toHaveBeenCalled();
      const lastCall = setLocationMock.mock.calls.find((c) =>
        typeof c[0] === 'string' ? c[0].endsWith('/play') : false,
      );
      expect(lastCall).toBeTruthy();
    });
  });

  it('deve usar replace: true ao redirecionar (revisita)', async () => {
    apiRequestMock.mockResolvedValue(lessonFixture);
    localStorage.setItem('library:lesson:lesson-id-123:hero-seen', 'true');
    renderPage();
    await waitFor(() => {
      const playCall = setLocationMock.mock.calls.find((c) =>
        typeof c[0] === 'string' ? c[0].endsWith('/play') : false,
      );
      expect(playCall).toBeTruthy();
      // Wouter setLocation aceita 2o arg { replace: true }
      const opts = playCall?.[1];
      expect(opts).toEqual(
        expect.objectContaining({ replace: true }),
      );
    });
  });

  it('NAO deve redirecionar quando flag === null (1a visita)', async () => {
    apiRequestMock.mockResolvedValue(lessonFixture);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('lesson-hero')).toBeInTheDocument();
    });
    // Apos render do hero, setLocation NAO deve ter sido chamado para /play.
    const playCall = setLocationMock.mock.calls.find((c) =>
      typeof c[0] === 'string' ? c[0].endsWith('/play') : false,
    );
    expect(playCall).toBeUndefined();
  });

  it('apos 1000ms de mount sem flag, deve setar localStorage flag', async () => {
    vi.useFakeTimers();
    apiRequestMock.mockResolvedValue(lessonFixture);
    renderPage();
    // Aguarda lesson resolver (microtasks).
    await vi.advanceTimersByTimeAsync(0);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await waitFor(
      () => {
        expect(
          localStorage.getItem('library:lesson:lesson-id-123:hero-seen'),
        ).toBe('true');
      },
      { timeout: 100 },
    );
    vi.useRealTimers();
  });
});

// =============================================================================
// Telemetry events — RF-09
// =============================================================================
describe('<LessonHeroPage> — telemetry events (RF-09)', () => {
  it('apos 1000ms de mount sem flag, deve POST prologue_viewed event', async () => {
    vi.useFakeTimers();
    apiRequestMock.mockResolvedValue(lessonFixture);
    renderPage();
    await vi.advanceTimersByTimeAsync(0);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await waitFor(() => {
      const eventCall = apiRequestMock.mock.calls.find(
        (c) =>
          c[0] === 'POST' &&
          typeof c[1] === 'string' &&
          c[1].includes('/api/library/events') &&
          c[2]?.eventType === 'prologue_viewed',
      );
      expect(eventCall).toBeTruthy();
      expect(eventCall?.[2]?.lessonId).toBe('lesson-id-123');
    });
    vi.useRealTimers();
  });

  it('NAO deve postar prologue_viewed quando flag ja seen (revisita bypass)', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET') return lessonFixture;
      return null;
    });
    localStorage.setItem('library:lesson:lesson-id-123:hero-seen', 'true');
    renderPage();
    await waitFor(() => {
      expect(setLocationMock).toHaveBeenCalled();
    });
    // Com flag ja seen, nao deve emitir prologue_viewed.
    const evCall = apiRequestMock.mock.calls.find(
      (c) => c[0] === 'POST' && c[2]?.eventType === 'prologue_viewed',
    );
    expect(evCall).toBeUndefined();
  });

  it('telemetry POST deve ter silentMode=true para nao quebrar UI em falha', async () => {
    vi.useFakeTimers();
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET') return lessonFixture;
      return null;
    });
    renderPage();
    await vi.advanceTimersByTimeAsync(0);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await waitFor(() => {
      const evCall = apiRequestMock.mock.calls.find(
        (c) => c[0] === 'POST' && c[2]?.eventType === 'prologue_viewed',
      );
      expect(evCall).toBeTruthy();
      const opts = evCall?.[3];
      expect(opts).toEqual(expect.objectContaining({ silentMode: true }));
    });
    vi.useRealTimers();
  });
});

// =============================================================================
// Click handlers (onStart / onSkipIntro)
// =============================================================================
describe('<LessonHeroPage> — handlers', () => {
  it('click "Iniciar aula" deve navegar para /play e setar flag defensivamente', async () => {
    apiRequestMock.mockResolvedValue(lessonFixture);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('lesson-hero-cta-start')).toBeInTheDocument();
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('lesson-hero-cta-start'));
    await waitFor(() => {
      const playCall = setLocationMock.mock.calls.find((c) =>
        typeof c[0] === 'string' ? c[0].endsWith('/play') : false,
      );
      expect(playCall).toBeTruthy();
    });
    expect(
      localStorage.getItem('library:lesson:lesson-id-123:hero-seen'),
    ).toBe('true');
  });

  it('click "Pular intro" deve disparar prologue_skipped + navegar /play', async () => {
    vi.useFakeTimers();
    apiRequestMock.mockResolvedValue(lessonFixture);
    renderPage();
    await vi.advanceTimersByTimeAsync(0);
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    vi.useRealTimers();
    const user = userEvent.setup();
    await waitFor(() => {
      expect(
        screen.getByTestId('lesson-hero-skip-button'),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('lesson-hero-skip-button'));
    await waitFor(() => {
      const skipped = apiRequestMock.mock.calls.find(
        (c) => c[0] === 'POST' && c[2]?.eventType === 'prologue_skipped',
      );
      expect(skipped).toBeTruthy();
      const playCall = setLocationMock.mock.calls.find((c) =>
        typeof c[0] === 'string' ? c[0].endsWith('/play') : false,
      );
      expect(playCall).toBeTruthy();
    });
  });
});
