/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint day-detail-zoom-1 — RF-03 BibliotecaEmbedded com filtros contextuais.
 * Spec: Docs/specs/sprint-day-detail-zoom-1.md §RF-03.
 * ADR: Docs/architecture/decisions/210-day-detail-zoom-architecture.md §3.
 *
 * Cobre:
 *   - Chips contextuais auto-aplicados (site dominante >=60%, ABI ±50%, formato >=50%).
 *   - data-testid="biblioteca-clear-context" limpa + emit coach.day_zoom_filter_apply
 *     com cleared:true.
 *   - Input busca debounce 300ms + emit coach.day_zoom_search.
 *   - Contador data-testid="biblioteca-embedded-count" reflete pos-filtros.
 *   - Banner data-testid="biblioteca-too-many" quando >100 cards.
 *   - ErrorBoundary fallback null sem QueryClientProvider (lesson #29 — pattern Sidebar).
 *
 * Lessons aplicaveis:
 *   - #14/#38 (await import + NUNCA require em test .tsx).
 *   - #28 (vi.mock path EXATO ao import do componente).
 *   - #29 (sub-arvore com useQuery sem QueryClientProvider → ErrorBoundary
 *     fallback null em testes standalone, OU encapsular em provider).
 *   - #2 (data-testid estavel).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks de telemetria — capturados via spy compartilhado.
// ---------------------------------------------------------------------------
const emitMock = vi.fn();

vi.mock('@/lib/tracker', () => ({
  emit: (...args: any[]) => emitMock(...args),
}));

vi.mock('@/lib/activity-telemetry', () => ({
  emitCoachEvent: (...args: any[]) => emitMock(...args),
  emitAudioEvent: vi.fn(),
  emitLessonEvent: vi.fn(),
  emitLibraryEvent: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock tournament library data — controlavel por teste via setLibraryData.
// ---------------------------------------------------------------------------
let _libraryData: any[] = [];

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<any>('@tanstack/react-query');
  return {
    ...actual,
    useQuery: (opts: any) => {
      const key = Array.isArray(opts?.queryKey) ? opts.queryKey.join('|') : '';
      if (key.includes('tournament-library')) {
        return {
          data: _libraryData,
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        };
      }
      return { data: undefined, isLoading: false, isError: false };
    },
  };
});

function setLibraryData(items: any[]) {
  _libraryData = items;
}

beforeEach(() => {
  emitMock.mockReset();
  setLibraryData([]);
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 1440 });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function loadComponent() {
  return await import('@/components/grade/BibliotecaEmbedded');
}

// ---------------------------------------------------------------------------
// Helpers fixtures
// ---------------------------------------------------------------------------
function makeLibraryCard(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? `lib-${Math.random().toString(36).slice(2, 7)}`,
    name: overrides.name ?? 'Sunday Million',
    site: overrides.site ?? 'PokerStars',
    buyIn: overrides.buyIn ?? '5.50',
    guaranteed: overrides.guaranteed ?? '1000',
    type: overrides.type ?? 'PKO',
    speed: overrides.speed ?? 'Normal',
    time: overrides.time ?? '20:00',
    ...overrides,
  };
}

describe('RF-03 BibliotecaEmbedded — filtros contextuais + busca + contador', () => {
  it('aplica chip site contextual quando contextFilters.site presente', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { BibliotecaEmbedded } = await loadComponent();

    setLibraryData([
      makeLibraryCard({ id: 'l1', site: 'PokerStars' }),
      makeLibraryCard({ id: 'l2', site: 'GG' }),
    ]);

    render(
      React.createElement(BibliotecaEmbedded as any, {
        contextFilters: { site: 'PokerStars' },
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );

    expect(await screen.findByTestId('biblioteca-embedded')).toBeInTheDocument();
    expect(await screen.findByTestId('biblioteca-context-chip-site')).toBeInTheDocument();
  });

  it('aplica chip buyIn quando contextFilters.buyInMin/Max presente', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { BibliotecaEmbedded } = await loadComponent();

    setLibraryData([
      makeLibraryCard({ id: 'l1', buyIn: '5.00' }),
      makeLibraryCard({ id: 'l2', buyIn: '50.00' }),
    ]);

    render(
      React.createElement(BibliotecaEmbedded as any, {
        contextFilters: { buyInMin: 2.5, buyInMax: 7.5 },
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );

    expect(await screen.findByTestId('biblioteca-context-chip-buyIn')).toBeInTheDocument();
  });

  it('aplica chip formato quando contextFilters.format presente', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { BibliotecaEmbedded } = await loadComponent();

    setLibraryData([makeLibraryCard({ id: 'l1', type: 'PKO' })]);

    render(
      React.createElement(BibliotecaEmbedded as any, {
        contextFilters: { format: 'PKO' },
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );

    expect(await screen.findByTestId('biblioteca-context-chip-format')).toBeInTheDocument();
  });

  it('biblioteca-clear-context click limpa chips + emit coach.day_zoom_filter_apply cleared:true', async () => {
    const React = await import('react');
    const { render, screen, waitFor } = await import('@testing-library/react');
    const userEvent = (await import('@testing-library/user-event')).default;
    const { BibliotecaEmbedded } = await loadComponent();

    setLibraryData([
      makeLibraryCard({ id: 'l1', site: 'PokerStars', buyIn: '5.00', type: 'PKO' }),
    ]);

    render(
      React.createElement(BibliotecaEmbedded as any, {
        contextFilters: { site: 'PokerStars', buyInMin: 2.5, buyInMax: 7.5, format: 'PKO' },
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );

    const clearBtn = await screen.findByTestId('biblioteca-clear-context');
    const user = userEvent.setup();
    await user.click(clearBtn);

    await waitFor(() => {
      const call = emitMock.mock.calls.find(
        (c) => c[0] === 'coach.day_zoom_filter_apply' && c[1]?.cleared === true,
      );
      expect(call).toBeTruthy();
    });

    const lastCall = emitMock.mock.calls.find(
      (c) => c[0] === 'coach.day_zoom_filter_apply' && c[1]?.cleared === true,
    );
    expect(lastCall?.[1]?.feature).toBe('day_zoom');
    expect(lastCall?.[1]?.dayOfWeek).toBe(2);
    expect(lastCall?.[1]?.profileLetter).toBe('A');
  });

  it('input busca debounce 300ms emite coach.day_zoom_search com query + resultCount', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const userEvent = (await import('@testing-library/user-event')).default;
    const { BibliotecaEmbedded } = await loadComponent();

    setLibraryData([
      makeLibraryCard({ id: 'l1', name: 'Sunday Million' }),
      makeLibraryCard({ id: 'l2', name: 'Bounty Builder' }),
      makeLibraryCard({ id: 'l3', name: 'Daily Cooldown' }),
    ]);

    vi.useFakeTimers();
    try {
      render(
        React.createElement(BibliotecaEmbedded as any, {
          contextFilters: {},
          dayOfWeek: 2,
          profileLetter: 'A',
        }),
      );

      const input = await screen.findByTestId('biblioteca-embedded-search');
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.type(input, 'sunday');

      // Debounce nao emitiu ainda antes de avancar 300ms.
      const earlyCall = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_search');
      expect(earlyCall).toBeFalsy();

      // Avanca debounce.
      vi.advanceTimersByTime(350);

      const searchCall = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_search');
      expect(searchCall).toBeTruthy();
      expect(searchCall?.[1]?.query).toBe('sunday');
      expect(typeof searchCall?.[1]?.resultCount).toBe('number');
      expect(searchCall?.[1]?.feature).toBe('day_zoom');
    } finally {
      vi.useRealTimers();
    }
  });

  it('biblioteca-embedded-count reflete contagem pos-filtros', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { BibliotecaEmbedded } = await loadComponent();

    setLibraryData([
      makeLibraryCard({ id: 'l1', site: 'PokerStars' }),
      makeLibraryCard({ id: 'l2', site: 'PokerStars' }),
      makeLibraryCard({ id: 'l3', site: 'GG' }),
    ]);

    render(
      React.createElement(BibliotecaEmbedded as any, {
        contextFilters: { site: 'PokerStars' },
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );

    const count = await screen.findByTestId('biblioteca-embedded-count');
    // Espera 2 (apenas PokerStars apos filtro contextual).
    expect(count.textContent ?? '').toMatch(/2/);
  });

  it('banner biblioteca-too-many quando library length > 100', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { BibliotecaEmbedded } = await loadComponent();

    const many = Array.from({ length: 120 }, (_, i) =>
      makeLibraryCard({ id: `lc-${i}`, name: `Torneio ${i}` }),
    );
    setLibraryData(many);

    render(
      React.createElement(BibliotecaEmbedded as any, {
        contextFilters: {},
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );

    expect(await screen.findByTestId('biblioteca-too-many')).toBeInTheDocument();
  });

  it('ErrorBoundary interna: renderiza fallback null sem QueryClientProvider (lesson #29)', async () => {
    // Reset modules pra forcar re-mock que retorna erro do useQuery.
    vi.resetModules();
    vi.doMock('@tanstack/react-query', () => ({
      useQuery: () => {
        throw new Error('No QueryClient set, use QueryClientProvider to set one');
      },
    }));
    vi.doMock('@/lib/tracker', () => ({
      emit: (...args: any[]) => emitMock(...args),
    }));
    vi.doMock('@/lib/activity-telemetry', () => ({
      emitCoachEvent: (...args: any[]) => emitMock(...args),
      emitAudioEvent: vi.fn(),
      emitLessonEvent: vi.fn(),
      emitLibraryEvent: vi.fn(),
    }));

    const React = await import('react');
    const { render } = await import('@testing-library/react');
    const { BibliotecaEmbedded } = await import('@/components/grade/BibliotecaEmbedded');

    // O componente DEVE conter ErrorBoundary interna com fallback null —
    // render NAO deve lancar quando useQuery quebra (paridade Sidebar pattern).
    expect(() =>
      render(
        React.createElement(BibliotecaEmbedded as any, {
          contextFilters: {},
          dayOfWeek: 2,
          profileLetter: 'A',
        }),
      ),
    ).not.toThrow();

    vi.doUnmock('@tanstack/react-query');
    vi.resetModules();
  });
});
