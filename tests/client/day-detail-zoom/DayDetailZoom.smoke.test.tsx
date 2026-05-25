/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint day-detail-zoom-1 — RF-01 smoke.
 * Spec: Docs/specs/sprint-day-detail-zoom-1.md §RF-01.
 * ADR: Docs/architecture/decisions/210-day-detail-zoom-architecture.md §1+§3.
 *
 * Cobre:
 *   - Modal centro renderiza com testids estaveis.
 *   - Split 60/40 default presente em viewport >=1024px.
 *   - DnD herdado via DialogPortal container ref (smoke).
 *   - Esc/backdrop/cta emitem coach.day_zoom_closed com reason correto.
 *
 * Lessons: #2 (data-testid estavel), #14 (await import), #28 (vi.mock path exato),
 *          #38 (NUNCA mix require + await import).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

vi.mock('@/hooks/useDayDetail', () => ({
  useDayDetail: () => ({
    data: {
      cards: { totalTournaments: 4, abiUsd: 5, investmentUsd: 22, bankrollNeeded: 50 },
      format: { pctPKO: 60, pctTurbo: 20, pctVanilla: 20 },
      volume: [
        { site: 'PokerStars', count: 8 },
        { site: 'GG', count: 2 },
      ],
      bankroll: [],
      list: [],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  default: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/components/grade/BibliotecaEmbedded', () => ({
  BibliotecaEmbedded: (_props: any) =>
    // Avoid JSX in mock factories — return null React element shim.
    null,
  default: () => null,
}));

beforeEach(() => {
  emitMock.mockReset();
  // Default viewport desktop >=1024.
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 1440 });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function loadComponent() {
  return await import('@/components/grade/DayDetailZoom');
}

describe('RF-01 DayDetailZoom smoke (modal central + split)', () => {
  it('renderiza testid day-zoom-modal quando open=true', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { DayDetailZoom } = await loadComponent();
    render(
      React.createElement(DayDetailZoom as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
      })
    );
    expect(await screen.findByTestId('day-zoom-modal')).toBeInTheDocument();
  });

  it('renderiza split 60/40 com data-testid day-zoom-panel-left + day-zoom-panel-right em viewport >=1024px', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { DayDetailZoom } = await loadComponent();
    render(
      React.createElement(DayDetailZoom as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
      })
    );
    expect(await screen.findByTestId('day-zoom-panel-left')).toBeInTheDocument();
    expect(await screen.findByTestId('day-zoom-panel-right')).toBeInTheDocument();
    expect(await screen.findByTestId('day-zoom-resize-handle')).toBeInTheDocument();
  });

  it('renderiza header titulo + 4 cards KPI testids', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { DayDetailZoom } = await loadComponent();
    render(
      React.createElement(DayDetailZoom as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
      })
    );
    expect(await screen.findByTestId('day-zoom-header-title')).toBeInTheDocument();
    expect(await screen.findByTestId('day-zoom-card-total')).toBeInTheDocument();
    expect(await screen.findByTestId('day-zoom-card-abi')).toBeInTheDocument();
    expect(await screen.findByTestId('day-zoom-card-investment')).toBeInTheDocument();
    expect(await screen.findByTestId('day-zoom-card-bankroll')).toBeInTheDocument();
  });

  it('emite coach.day_zoom_opened com props minimas ao montar com open=true', async () => {
    const React = await import('react');
    const { render } = await import('@testing-library/react');
    const { DayDetailZoom } = await loadComponent();
    render(
      React.createElement(DayDetailZoom as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
      })
    );
    const openCall = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_opened');
    expect(openCall).toBeTruthy();
    const payload = openCall?.[1] ?? {};
    expect(payload).toMatchObject({
      dayOfWeek: 2,
      profileLetter: 'A',
    });
  });

  it('ESC fecha modal e emite coach.day_zoom_closed reason="esc"', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const userEvent = (await import('@testing-library/user-event')).default;
    const { DayDetailZoom } = await loadComponent();
    const onOpenChange = vi.fn();
    render(
      React.createElement(DayDetailZoom as any, {
        open: true,
        onOpenChange,
        dayOfWeek: 2,
        profileLetter: 'A',
      })
    );
    expect(await screen.findByTestId('day-zoom-modal')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    const closed = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_closed');
    expect(closed).toBeTruthy();
    expect(closed?.[1]?.reason).toBe('esc');
  });

  it('click no botao X emite coach.day_zoom_closed reason="cta"', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const userEvent = (await import('@testing-library/user-event')).default;
    const { DayDetailZoom } = await loadComponent();
    render(
      React.createElement(DayDetailZoom as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
      })
    );
    const closeBtn = await screen.findByTestId('day-zoom-close-button');
    const user = userEvent.setup();
    await user.click(closeBtn);
    const closed = emitMock.mock.calls.find(
      (c) => c[0] === 'coach.day_zoom_closed' && c[1]?.reason === 'cta'
    );
    expect(closed).toBeTruthy();
  });

  it('aceita prop portalContainer ref para DialogPortal (Alternativa A spike)', async () => {
    const React = await import('react');
    const { render } = await import('@testing-library/react');
    const { DayDetailZoom } = await loadComponent();
    const container = document.createElement('div');
    container.id = 'dnd-portal-container';
    document.body.appendChild(container);
    // smoke: render sem throw quando container ref passado.
    expect(() =>
      render(
        React.createElement(DayDetailZoom as any, {
          open: true,
          onOpenChange: vi.fn(),
          dayOfWeek: 2,
          profileLetter: 'A',
          portalContainer: container,
        })
      )
    ).not.toThrow();
  });
});
