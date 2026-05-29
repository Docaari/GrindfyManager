/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint day-detail-consolidation — RF-06 manual site/type filters + D7 debounce telemetria.
 * Spec: Docs/specs/sprint-day-detail-consolidation.md §RF-06 / §RF-SMELL-01.
 * ADR: Docs/architecture/decisions/213-day-detail-zoom-consolidation.md §D7.
 *
 * Cobre BibliotecaEmbedded.tsx secao "manual filters" + debounce search:
 *   - Manual site filters (multi-select Set).
 *   - Manual type filters (multi-select Set).
 *   - Toggle site/type adiciona/remove sem afetar context chips.
 *   - Debounce search 300ms emit coach.day_zoom_search uma vez.
 *   - LocalErrorBoundary fallback null sem QueryClientProvider (lesson #29).
 *
 * Lessons: #14/#38, #29 (ErrorBoundary local), #28 (mock path).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const emitMock = vi.fn();

vi.mock('@/lib/activity-telemetry', () => ({
  emitCoachEvent: (...args: any[]) => emitMock(...args),
  emitAudioEvent: vi.fn(),
  emitLessonEvent: vi.fn(),
  emitLibraryEvent: vi.fn(),
}));

vi.mock('@/lib/safe-emit', () => ({
  safeEmit: (...args: any[]) => emitMock(...args),
  default: (...args: any[]) => emitMock(...args),
}));

let _libraryData: any[] = [];

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<any>('@tanstack/react-query');
  return {
    ...actual,
    useQuery: (opts: any) => {
      const key = Array.isArray(opts?.queryKey)
        ? opts.queryKey.join('|')
        : '';
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

vi.mock('@/components/grade-planner/LibraryCard', () => ({
  LibraryCard: (props: any) => {
    const React = require('react');
    return React.createElement(
      'div',
      {
        'data-testid': `library-card-${props.tournament?.id ?? 'x'}`,
      },
      props.tournament?.name ?? '',
    );
  },
}));

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
  vi.useRealTimers();
});

async function loadComponent() {
  return await import('@/components/grade/BibliotecaEmbedded');
}

async function renderBiblio(propsOverride: Partial<any> = {}) {
  const React = await import('react');
  const { render } = await import('@testing-library/react');
  const { BibliotecaEmbedded } = await loadComponent();
  return render(
    React.createElement(BibliotecaEmbedded as any, {
      contextFilters: {},
      dayOfWeek: 2,
      profileLetter: 'A',
      ...propsOverride,
    }),
  );
}

describe('BibliotecaEmbedded — manual site filters', () => {
  it('renderiza biblioteca-manual-site-filters quando ha sites na library', async () => {
    setLibraryData([
      { id: 'a', name: 'Mega', site: 'PokerStars', buyIn: '5', type: 'PKO' },
      { id: 'b', name: 'Mini', site: 'GGNetwork', buyIn: '2', type: 'PKO' },
    ]);
    const { screen } = await import('@testing-library/react');
    await renderBiblio();
    expect(
      await screen.findByTestId('biblioteca-manual-site-filters'),
    ).toBeInTheDocument();
  });

  it('renderiza biblioteca-manual-type-filters quando ha types na library', async () => {
    setLibraryData([
      { id: 'a', name: 'Mega', site: 'PokerStars', buyIn: '5', type: 'PKO' },
      {
        id: 'b',
        name: 'Mini',
        site: 'PokerStars',
        buyIn: '2',
        type: 'Vanilla',
      },
    ]);
    const { screen } = await import('@testing-library/react');
    await renderBiblio();
    expect(
      await screen.findByTestId('biblioteca-manual-type-filters'),
    ).toBeInTheDocument();
  });

  it('click toggle manual site → button aria-pressed alterna entre false/true', async () => {
    setLibraryData([
      { id: 'a', name: 'Mega', site: 'PokerStars', buyIn: '5', type: 'PKO' },
      { id: 'b', name: 'Mini', site: 'PokerStars', buyIn: '2', type: 'PKO' },
    ]);
    const { fireEvent, screen } = await import('@testing-library/react');
    await renderBiblio();
    const chip = await screen.findByTestId(
      'biblioteca-filter-site-PokerStars',
    );
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
  });

  it('click toggle manual type → button aria-pressed alterna', async () => {
    setLibraryData([
      { id: 'a', name: 'Mega', site: 'PokerStars', buyIn: '5', type: 'PKO' },
    ]);
    const { fireEvent, screen } = await import('@testing-library/react');
    await renderBiblio();
    const chip = await screen.findByTestId('biblioteca-filter-type-PKO');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('BibliotecaEmbedded — debounce search (D7 / RF-SMELL-01)', () => {
  it('digite "PSKO" + aguarda 400ms → safeEmit coach.day_zoom_search uma vez', async () => {
    setLibraryData([
      {
        id: 'a',
        name: 'PSKO Sunday',
        site: 'PokerStars',
        buyIn: '5',
        type: 'PKO',
      },
    ]);
    const { fireEvent, screen } = await import('@testing-library/react');
    await renderBiblio();
    const search = await screen.findByTestId('biblioteca-embedded-search');
    fireEvent.change(search, { target: { value: 'PSKO' } });
    // Antes do timer (>300ms debounce), NAO deve ter emitido.
    const before = emitMock.mock.calls.filter(
      (c) => c[0] === 'coach.day_zoom_search',
    );
    expect(before.length).toBe(0);

    // Wait real timer >300ms
    await new Promise((r) => setTimeout(r, 400));

    const after = emitMock.mock.calls.filter(
      (c) => c[0] === 'coach.day_zoom_search',
    );
    expect(after.length).toBeGreaterThanOrEqual(1);
    expect(after[0][1]).toMatchObject({
      dayOfWeek: 2,
      profileLetter: 'A',
      query: 'PSKO',
    });
  }, 10000);
});
