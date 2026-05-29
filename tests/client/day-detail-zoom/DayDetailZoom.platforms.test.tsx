/**
 * Sprint Modal-Detail — RF-01 card expansivel "Plataformas".
 *
 * Cobre:
 *   - Card renderiza quando data.platforms tem itens.
 *   - Default minimizado (corpo oculto).
 *   - Toggle expande e mostra linha por site com count + investido + ABI.
 *
 * Lessons: #2 (data-testid estavel), #14/#38 (await import, nunca require),
 *          #27 (Radix usa mousedown — aqui o toggle eh <button> nativo, click OK).
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
      cards: { totalTournaments: 5, abiUsd: 30, investmentUsd: 169, bankrollNeeded: 5000, medianFieldSize: 6667 },
      format: { pctPKO: 60, pctTurbo: 20, pctVanilla: 20 },
      volume: [
        { site: 'GGNetwork', count: 3 },
        { site: 'WPN', count: 2 },
      ],
      bankroll: [],
      platforms: [
        { site: 'GGNetwork', count: 3, investedUsd: 70, abiUsd: 23.33 },
        { site: 'WPN', count: 2, investedUsd: 99, abiUsd: 49.5 },
      ],
      list: [],
    },
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

beforeEach(() => {
  emitMock.mockReset();
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 1440 });
  try {
    window.localStorage.removeItem('dayZoom.platformsCollapsed');
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

async function renderModal() {
  const React = await import('react');
  const { render } = await import('@testing-library/react');
  const { DayDetailZoom } = await import('@/components/grade/DayDetailZoom');
  return render(
    React.createElement(DayDetailZoom as any, {
      open: true,
      onOpenChange: vi.fn(),
      dayOfWeek: 2,
      profileLetter: 'A',
    })
  );
}

describe('RF-01 — card Plataformas', () => {
  it('renderiza o card + toggle quando ha platforms', async () => {
    const { screen } = await import('@testing-library/react');
    await renderModal();
    expect(await screen.findByTestId('day-zoom-platforms-card')).toBeInTheDocument();
    expect(await screen.findByTestId('day-zoom-platforms-toggle')).toBeInTheDocument();
  });

  it('default minimizado: corpo oculto antes do click', async () => {
    const { screen } = await import('@testing-library/react');
    await renderModal();
    await screen.findByTestId('day-zoom-platforms-card');
    expect(screen.queryByTestId('day-zoom-platforms-body')).not.toBeInTheDocument();
  });

  it('expande ao clicar e mostra count + investido + ABI por site', async () => {
    const { screen } = await import('@testing-library/react');
    const userEvent = (await import('@testing-library/user-event')).default;
    await renderModal();
    const toggle = await screen.findByTestId('day-zoom-platforms-toggle');
    const user = userEvent.setup();
    await user.click(toggle);

    expect(await screen.findByTestId('day-zoom-platforms-body')).toBeInTheDocument();
    expect(screen.getByTestId('day-zoom-platform-row-GGNetwork')).toBeInTheDocument();
    expect(screen.getByTestId('day-zoom-platform-count-GGNetwork')).toHaveTextContent('3');
    expect(screen.getByTestId('day-zoom-platform-invested-GGNetwork')).toHaveTextContent('$70.00');
    expect(screen.getByTestId('day-zoom-platform-abi-GGNetwork')).toHaveTextContent('$23.33');
    expect(screen.getByTestId('day-zoom-platform-invested-WPN')).toHaveTextContent('$99.00');
  });
});
