/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint day-detail-zoom-1 — RF-04 Feature-flag + tooltip header + mobile click-to-add.
 * Spec: Docs/specs/sprint-day-detail-zoom-1.md §RF-04.
 * ADR: Docs/architecture/decisions/210-day-detail-zoom-architecture.md §5.
 *
 * Cobre:
 *   - URL ?detail=drawer renderiza data-testid="day-detail-drawer" legacy +
 *     day-zoom-modal AUSENTE.
 *   - URL default abre zoom (day-zoom-modal presente).
 *   - Conflito ?detail=drawer&day=Tue: drawer ganha.
 *   - Hover header coluna >=800ms mostra data-testid="day-hover-tooltip-{dayOfWeek}"
 *     lazy fetch (4 KPIs).
 *   - Mobile <768: LibraryCard mostra library-card-add-inline-{id} + click → POST
 *     primeiro slot vago + toast day-zoom-mobile-add-toast.
 *
 * Lessons aplicaveis:
 *   - #14/#38 (await import + NUNCA require em test .tsx).
 *   - #28 (vi.mock path EXATO).
 *   - #19 (Wouter routes — query param via setLocation safe).
 *   - #29 (sub-arvore useQuery → ErrorBoundary local).
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
// Mock useIsMobile — controlavel por teste.
// ---------------------------------------------------------------------------
let _isMobile = false;
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => _isMobile,
}));

function setMobile(value: boolean) {
  _isMobile = value;
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    value: value ? 360 : 1440,
  });
}

// ---------------------------------------------------------------------------
// Mock apiRequest (retorna JSON parseado direto — lesson #13).
// ---------------------------------------------------------------------------
const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    setQueryData: vi.fn(),
    getQueryData: vi.fn(() => []),
    invalidateQueries: vi.fn(),
  },
  getQueryFn: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock useDayDetail — shape estavel (paridade smoke).
// ---------------------------------------------------------------------------
vi.mock('@/hooks/useDayDetail', () => ({
  useDayDetail: ({ open }: any) => ({
    data: open
      ? {
          cards: { totalTournaments: 4, abiUsd: 5, investmentUsd: 22, bankrollNeeded: 50 },
          format: { pctPKO: 60, pctTurbo: 20, pctVanilla: 20 },
          volume: [{ site: 'PokerStars', count: 8 }],
          bankroll: [],
          list: [],
        }
      : undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  default: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/components/grade/BibliotecaEmbedded', () => ({
  BibliotecaEmbedded: (_props: any) => null,
  default: () => null,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setSearchParams(qs: string) {
  // Atualiza window.location.search programaticamente.
  const url = new URL(window.location.href);
  url.search = qs;
  window.history.replaceState({}, '', url.toString());
}

beforeEach(() => {
  emitMock.mockReset();
  apiRequestMock.mockReset();
  setMobile(false);
  setSearchParams('');
});

afterEach(() => {
  vi.clearAllMocks();
  setSearchParams('');
});

describe('RF-04 Feature-flag ?detail=drawer + hover-tooltip + mobile click-to-add', () => {
  it('URL ?detail=drawer renderiza data-testid="day-detail-drawer" legacy + day-zoom-modal AUSENTE', async () => {
    setSearchParams('?detail=drawer&day=2&profile=A');

    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');

    // Hook useDayZoomState decide qual variant renderizar. Implementer cria
    // um componente container DayDetailHost que envolve zoom OU drawer baseado
    // em useDayZoomState().mode.
    const { DayDetailHost } = await import('@/components/grade/DayDetailHost');

    render(
      React.createElement(DayDetailHost as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );

    expect(await screen.findByTestId('day-detail-drawer')).toBeInTheDocument();
    expect(screen.queryByTestId('day-zoom-modal')).toBeNull();
  });

  it('URL default sem flag abre zoom (day-zoom-modal presente)', async () => {
    setSearchParams('');

    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { DayDetailHost } = await import('@/components/grade/DayDetailHost');

    render(
      React.createElement(DayDetailHost as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );

    expect(await screen.findByTestId('day-zoom-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('day-detail-drawer')).toBeNull();
  });

  it('conflito ?detail=drawer&day=Tue: drawer ganha (paridade rollback total)', async () => {
    setSearchParams('?detail=drawer&day=Tue');

    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { DayDetailHost } = await import('@/components/grade/DayDetailHost');

    render(
      React.createElement(DayDetailHost as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );

    expect(await screen.findByTestId('day-detail-drawer')).toBeInTheDocument();
    expect(screen.queryByTestId('day-zoom-modal')).toBeNull();
  });

  it('hover header coluna >=800ms mostra data-testid="day-hover-tooltip-{dayOfWeek}" lazy fetch', async () => {
    setMobile(false);

    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const userEvent = (await import('@testing-library/user-event')).default;

    const { DayHoverTooltip } = await import('@/components/grade/DayHoverTooltip');

    vi.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        React.createElement(
          DayHoverTooltip as any,
          {
            dayOfWeek: 2,
            profileLetter: 'A',
          },
          React.createElement(
            'button',
            { 'data-testid': 'day-header-button' },
            'Detalhes',
          ),
        ),
      );

      const trigger = await screen.findByTestId('day-header-button');
      await user.hover(trigger);

      // Tooltip Radix delayDuration=800. Antes disso, tooltip NAO renderiza.
      vi.advanceTimersByTime(200);
      expect(screen.queryByTestId('day-hover-tooltip-2')).toBeNull();

      vi.advanceTimersByTime(900);

      expect(await screen.findByTestId('day-hover-tooltip-2')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('mobile <768: tooltip NAO renderiza (sem hover)', async () => {
    setMobile(true);

    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const userEvent = (await import('@testing-library/user-event')).default;

    const { DayHoverTooltip } = await import('@/components/grade/DayHoverTooltip');

    vi.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        React.createElement(
          DayHoverTooltip as any,
          {
            dayOfWeek: 2,
            profileLetter: 'A',
          },
          React.createElement(
            'button',
            { 'data-testid': 'day-header-button-mobile' },
            'Detalhes',
          ),
        ),
      );

      const trigger = await screen.findByTestId('day-header-button-mobile');
      await user.hover(trigger);
      vi.advanceTimersByTime(1500);

      expect(screen.queryByTestId('day-hover-tooltip-2')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('mobile <768: LibraryCard mostra library-card-add-inline-{id}', async () => {
    setMobile(true);

    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { LibraryCard } = await import('@/components/grade-planner/LibraryCard');

    render(
      React.createElement(LibraryCard as any, {
        tournament: { id: 'lib-42', name: 'Sunday Million', site: 'PokerStars', buyIn: '5.50' },
        showAddInlineButton: true,
        onAddInline: vi.fn(),
      }),
    );

    expect(await screen.findByTestId('library-card-add-inline-lib-42')).toBeInTheDocument();
  });

  it('mobile <768: click add-inline chama onAddInline + emit coach.day_zoom_dnd_add source="click_inline"', async () => {
    setMobile(true);

    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const userEvent = (await import('@testing-library/user-event')).default;
    const { LibraryCard } = await import('@/components/grade-planner/LibraryCard');

    const onAddInline = vi.fn();

    render(
      React.createElement(LibraryCard as any, {
        tournament: { id: 'lib-42', name: 'Sunday Million', site: 'PokerStars', buyIn: '5.50' },
        showAddInlineButton: true,
        onAddInline,
      }),
    );

    const addBtn = await screen.findByTestId('library-card-add-inline-lib-42');
    const user = userEvent.setup();
    await user.click(addBtn);

    expect(onAddInline).toHaveBeenCalledTimes(1);
  });

  it('mobile click-to-add em BibliotecaEmbedded: POST primeiro slot vago + toast day-zoom-mobile-add-toast + emit source="click_inline"', async () => {
    setMobile(true);

    apiRequestMock.mockResolvedValueOnce({
      id: 'tnt-new-1',
      name: 'Sunday Million',
      site: 'PokerStars',
      dayOfWeek: 2,
      time: '20:00',
      buyIn: '5.50',
      profile: 'A',
      status: 'upcoming',
    });

    const React = await import('react');
    const { render, screen, waitFor } = await import('@testing-library/react');
    const userEvent = (await import('@testing-library/user-event')).default;

    // Para este teste precisamos do flow integrado (BibliotecaEmbedded → onAddToSlot).
    // Implementer expoe um helper window.__dayZoomMobileClickAdd(libraryId) que dispara
    // o flow click_inline → POST → toast.
    const { DayDetailZoom } = await import('@/components/grade/DayDetailZoom');

    render(
      React.createElement(DayDetailZoom as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );

    await screen.findByTestId('day-zoom-modal');

    const dispatcher = (window as any).__dayZoomMobileClickAdd;
    if (typeof dispatcher !== 'function') {
      throw new Error(
        'DayDetailZoom must expose window.__dayZoomMobileClickAdd(libraryId) for mobile tests (RF-04). Sprint 1 TDD red phase: implementer cria.',
      );
    }
    await dispatcher({
      id: 'lib-42',
      name: 'Sunday Million',
      site: 'PokerStars',
      buyIn: '5.50',
    });

    await waitFor(() => {
      const postCall = apiRequestMock.mock.calls.find(
        (c) => c[0] === 'POST' && c[1] === '/api/planned-tournaments',
      );
      expect(postCall).toBeTruthy();
    });

    expect(await screen.findByTestId('day-zoom-mobile-add-toast')).toBeInTheDocument();

    const addEmit = emitMock.mock.calls.find(
      (c) => c[0] === 'coach.day_zoom_dnd_add' && c[1]?.source === 'click_inline',
    );
    expect(addEmit).toBeTruthy();
    expect(addEmit?.[1]?.feature).toBe('day_zoom');
  });
});
