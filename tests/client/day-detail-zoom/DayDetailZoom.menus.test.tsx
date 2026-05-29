/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint day-detail-consolidation — RF-04 (Move menu) + RF-05 (Priority menu) + D4 (click-away) + D5 (z-index).
 * Spec: Docs/specs/sprint-day-detail-consolidation.md §RF-04 / §RF-05.
 * ADR: Docs/architecture/decisions/213-day-detail-zoom-consolidation.md §D4 / §D5.
 *
 * Cobre:
 *   - Click-away pattern: document mousedown fora marker data-zoom-menu fecha menu.
 *   - Click DENTRO do menu (em opcao) executa acao + fecha.
 *   - Priority dropdown clicavel: click target chama mutatePriority.
 *   - Move dropdown clicavel: click target chama mutateMove.
 *   - z-40 chip + z-50 menu stacking (D5).
 *
 * Lessons: #14/#38, #27 (Radix mousedown — botoes do menu sao <button> nativo OK fireEvent.click).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const emitMock = vi.fn();
const apiRequestMock = vi.fn();

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

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    setQueryData: vi.fn(),
    getQueryData: vi.fn(() => []),
    invalidateQueries: vi.fn(),
  },
  getQueryFn: vi.fn(),
}));

let _mockData: any = null;
vi.mock('@/hooks/useDayDetail', () => ({
  useDayDetail: () => ({
    data: _mockData,
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

function setMockData(data: any) {
  _mockData = data;
}

beforeEach(() => {
  emitMock.mockReset();
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ id: 'pt-1' });
  setMockData({
    cards: {
      totalTournaments: 1,
      abiUsd: 10,
      investmentUsd: 10,
      bankrollNeeded: 1000,
      medianFieldSize: 0,
    },
    format: { pctPKO: 0, pctTurbo: 0, pctVanilla: 100 },
    volume: [{ site: 'PokerStars', count: 1 }],
    bankroll: [],
    list: [
      {
        id: 'pt-x',
        site: 'PokerStars',
        time: '20:00',
        buyinUsd: 10,
        count: 1,
        prioridade: 2,
      },
    ],
  });
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 1440 });
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

async function loadZoom() {
  return await import('@/components/grade/DayDetailZoom');
}

async function renderZoom() {
  const React = await import('react');
  const { render, screen, fireEvent } = await import(
    '@testing-library/react'
  );
  const { DayDetailZoom } = await loadZoom();
  render(
    React.createElement(DayDetailZoom as any, {
      open: true,
      onOpenChange: vi.fn(),
      dayOfWeek: 2,
      profileLetter: 'A',
    }),
  );
  return { screen, fireEvent };
}

describe('DayDetailZoom — Priority menu (RF-05)', () => {
  it('click priority trigger abre dropdown com testids dos 3 targets', async () => {
    const { screen, fireEvent } = await renderZoom();
    const btn = await screen.findByTestId(
      'day-zoom-tournament-priority-pt-x',
    );
    fireEvent.click(btn);
    expect(
      await screen.findByTestId(
        'day-zoom-tournament-priority-target-pt-x-1',
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId(
        'day-zoom-tournament-priority-target-pt-x-2',
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId(
        'day-zoom-tournament-priority-target-pt-x-3',
      ),
    ).toBeInTheDocument();
  });

  it('click target "Alta" chama mutatePriority com (id, 1)', async () => {
    const { screen, fireEvent } = await renderZoom();
    const btn = await screen.findByTestId(
      'day-zoom-tournament-priority-pt-x',
    );
    fireEvent.click(btn);
    const target1 = await screen.findByTestId(
      'day-zoom-tournament-priority-target-pt-x-1',
    );
    fireEvent.click(target1);
    await new Promise((r) => setTimeout(r, 0));
    const call = apiRequestMock.mock.calls.find(
      (c) =>
        c[0] === 'PUT' && c[1] === '/api/planned-tournaments/pt-x',
    );
    expect(call).toBeTruthy();
    expect(call![2]).toMatchObject({ prioridade: 1 });
  });

  it('click target "Media" chama mutatePriority com (id, 2)', async () => {
    const { screen, fireEvent } = await renderZoom();
    const btn = await screen.findByTestId(
      'day-zoom-tournament-priority-pt-x',
    );
    fireEvent.click(btn);
    const target2 = await screen.findByTestId(
      'day-zoom-tournament-priority-target-pt-x-2',
    );
    fireEvent.click(target2);
    await new Promise((r) => setTimeout(r, 0));
    const call = apiRequestMock.mock.calls.find(
      (c) => c[0] === 'PUT' && c[1] === '/api/planned-tournaments/pt-x',
    );
    expect(call).toBeTruthy();
    expect(call![2]).toMatchObject({ prioridade: 2 });
  });
});

describe('DayDetailZoom — Move menu (RF-04)', () => {
  it('click move trigger abre dropdown com targets HH:00', async () => {
    const { screen, fireEvent } = await renderZoom();
    const moveBtn = await screen.findByTestId(
      'day-zoom-tournament-move-pt-x',
    );
    fireEvent.click(moveBtn);
    expect(
      await screen.findByTestId('day-zoom-tournament-move-menu-pt-x'),
    ).toBeInTheDocument();
  });

  it('click target HH:00 → chama mutateMove(id, fromSlot, toSlot)', async () => {
    const { screen, fireEvent } = await renderZoom();
    const moveBtn = await screen.findByTestId(
      'day-zoom-tournament-move-pt-x',
    );
    fireEvent.click(moveBtn);
    const target = await screen.findByTestId(
      'day-zoom-tournament-move-target-pt-x-21:00',
    );
    fireEvent.click(target);
    await new Promise((r) => setTimeout(r, 0));
    const call = apiRequestMock.mock.calls.find(
      (c) => c[0] === 'PUT' && c[1] === '/api/planned-tournaments/pt-x',
    );
    expect(call).toBeTruthy();
    expect(call![2]).toMatchObject({ time: '21:00' });
  });
});

describe('DayDetailZoom — click-away pattern (D4)', () => {
  it('priority menu aberto + mousedown fora → menu fecha (data-zoom-menu marker)', async () => {
    const { screen, fireEvent } = await renderZoom();
    const btn = await screen.findByTestId(
      'day-zoom-tournament-priority-pt-x',
    );
    fireEvent.click(btn);
    expect(
      await screen.findByTestId(
        'day-zoom-tournament-priority-target-pt-x-1',
      ),
    ).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    await new Promise((r) => setTimeout(r, 0));
    expect(
      screen.queryByTestId(
        'day-zoom-tournament-priority-target-pt-x-1',
      ),
    ).toBeNull();
  });

  it('move menu aberto + mousedown fora → menu fecha', async () => {
    const { screen, fireEvent } = await renderZoom();
    const moveBtn = await screen.findByTestId(
      'day-zoom-tournament-move-pt-x',
    );
    fireEvent.click(moveBtn);
    expect(
      await screen.findByTestId('day-zoom-tournament-move-menu-pt-x'),
    ).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    await new Promise((r) => setTimeout(r, 0));
    expect(
      screen.queryByTestId('day-zoom-tournament-move-menu-pt-x'),
    ).toBeNull();
  });
});

describe('DayDetailZoom — z-index stacking (D5)', () => {
  it('chip ativo (menu aberto) ganha className z-40', async () => {
    const { screen, fireEvent } = await renderZoom();
    const btn = await screen.findByTestId(
      'day-zoom-tournament-priority-pt-x',
    );
    fireEvent.click(btn);
    const chip = await screen.findByTestId('day-zoom-tournament-pt-x');
    expect(chip.className).toMatch(/z-40/);
  });

  it('menu dropdown carrega z-50 inline (acima do chip)', async () => {
    const { screen, fireEvent } = await renderZoom();
    const btn = await screen.findByTestId(
      'day-zoom-tournament-priority-pt-x',
    );
    fireEvent.click(btn);
    const menu = await screen.findByTestId(
      'day-zoom-tournament-priority-menu-pt-x',
    );
    expect(menu.className).toMatch(/z-50/);
  });
});
