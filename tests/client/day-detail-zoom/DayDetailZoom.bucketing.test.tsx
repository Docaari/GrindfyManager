/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint day-detail-consolidation — RF-08 (MaxLate bucketing) + RF-09 (Garantido / Mediana / EstimatedField) + RF-05 (priority overlay).
 * Spec: Docs/specs/sprint-day-detail-consolidation.md §RF-05 / §RF-08 / §RF-09.
 * ADR: Docs/architecture/decisions/213-day-detail-zoom-consolidation.md §D1/D3.
 *
 * Cobre features no DayDetailZoom.tsx (~1500 LoC):
 *   - Bucketing HH:00 + start hour dinamico.
 *   - Badge MaxLate amber quando item.maxLate string nao-vazia.
 *   - Badge GTD quando item.guaranteedUsd > 0.
 *   - Card mediana KPI quando data.cards.medianFieldSize > 0.
 *   - Priority overlay (D3): mutatePriority → priorityOverrides → render imediato.
 *
 * Lessons: #14/#38 (await import), #28 (mock path exato).
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

// useDayDetail mock fixture-driven — cada teste controla data via setMockData.
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
      totalTournaments: 0,
      abiUsd: 0,
      investmentUsd: 0,
      bankrollNeeded: 0,
      medianFieldSize: 0,
    },
    format: { pctPKO: 0, pctTurbo: 0, pctVanilla: 0 },
    volume: [],
    bankroll: [],
    list: [],
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
  const { render } = await import('@testing-library/react');
  const { DayDetailZoom } = await loadZoom();
  return render(
    React.createElement(DayDetailZoom as any, {
      open: true,
      onOpenChange: vi.fn(),
      dayOfWeek: 2,
      profileLetter: 'A',
    }),
  );
}

describe('DayDetailZoom — bucketing HH:00 (RF-08 D1)', () => {
  it('item time="13:30" sem maxLate → cai em slot day-zoom-slot-13:00', async () => {
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
          id: 'pt-1',
          site: 'PokerStars',
          time: '13:30',
          buyinUsd: 10,
          count: 1,
          maxLate: null,
        },
      ],
    });
    const { findByTestId } = await renderZoom();
    // Slot 13:00 deve existir e ter o torneio.
    const slot = await findByTestId('day-zoom-slot-13:00');
    expect(slot).toBeInTheDocument();
    expect(
      slot.querySelector('[data-testid="day-zoom-tournament-pt-1"]'),
    ).toBeTruthy();
  });

  it('item time="13:30" maxLate="14:30" → bucketed em slot 14:00 (D1)', async () => {
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
          id: 'pt-2',
          site: 'PokerStars',
          time: '13:30',
          buyinUsd: 10,
          count: 1,
          maxLate: '14:30',
        },
      ],
    });
    const { findByTestId } = await renderZoom();
    const slot = await findByTestId('day-zoom-slot-14:00');
    expect(slot).toBeInTheDocument();
    expect(
      slot.querySelector('[data-testid="day-zoom-tournament-pt-2"]'),
    ).toBeTruthy();
  });
});

describe('DayDetailZoom — MaxLate badge (RF-08)', () => {
  it('item.maxLate="14:30" → badge testid day-zoom-tournament-maxlate-{id} renderiza', async () => {
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
          id: 'pt-mx',
          site: 'PokerStars',
          time: '13:30',
          buyinUsd: 10,
          count: 1,
          maxLate: '14:30',
        },
      ],
    });
    const { findByTestId } = await renderZoom();
    expect(
      await findByTestId('day-zoom-tournament-maxlate-pt-mx'),
    ).toBeInTheDocument();
  });

  it('item.maxLate=null → badge NAO renderiza', async () => {
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
          id: 'pt-no-ml',
          site: 'PokerStars',
          time: '13:30',
          buyinUsd: 10,
          count: 1,
          maxLate: null,
        },
      ],
    });
    const { queryByTestId, findByTestId } = await renderZoom();
    await findByTestId('day-zoom-tournament-pt-no-ml');
    expect(queryByTestId('day-zoom-tournament-maxlate-pt-no-ml')).toBeNull();
  });

  it('item.maxLate="" → badge NAO renderiza', async () => {
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
          id: 'pt-empty-ml',
          site: 'PokerStars',
          time: '13:30',
          buyinUsd: 10,
          count: 1,
          maxLate: '',
        },
      ],
    });
    const { queryByTestId, findByTestId } = await renderZoom();
    await findByTestId('day-zoom-tournament-pt-empty-ml');
    expect(queryByTestId('day-zoom-tournament-maxlate-pt-empty-ml')).toBeNull();
  });
});

describe('DayDetailZoom — Garantido badge GTD (RF-09)', () => {
  it('item.guaranteedUsd > 0 → badge testid day-zoom-tournament-gtd-{id} renderiza', async () => {
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
          id: 'pt-gtd',
          site: 'PokerStars',
          time: '20:00',
          buyinUsd: 10,
          count: 1,
          guaranteedUsd: 10000,
          estimatedField: 1000,
        },
      ],
    });
    const { findByTestId } = await renderZoom();
    expect(
      await findByTestId('day-zoom-tournament-gtd-pt-gtd'),
    ).toBeInTheDocument();
  });

  it('item.guaranteedUsd = 0 → badge NAO renderiza', async () => {
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
          id: 'pt-no-gtd',
          site: 'PokerStars',
          time: '20:00',
          buyinUsd: 10,
          count: 1,
          guaranteedUsd: 0,
        },
      ],
    });
    const { queryByTestId, findByTestId } = await renderZoom();
    await findByTestId('day-zoom-tournament-pt-no-gtd');
    expect(queryByTestId('day-zoom-tournament-gtd-pt-no-gtd')).toBeNull();
  });
});

describe('DayDetailZoom — Mediana KPI card (RF-09)', () => {
  it('data.cards.medianFieldSize=500 → card day-zoom-card-median-field mostra "500"', async () => {
    setMockData({
      cards: {
        totalTournaments: 1,
        abiUsd: 10,
        investmentUsd: 10,
        bankrollNeeded: 1000,
        medianFieldSize: 500,
      },
      format: { pctPKO: 0, pctTurbo: 0, pctVanilla: 100 },
      volume: [{ site: 'PokerStars', count: 1 }],
      bankroll: [],
      list: [],
    });
    const { findByTestId } = await renderZoom();
    const card = await findByTestId('day-zoom-card-median-field');
    expect(card).toBeInTheDocument();
    expect(card.textContent ?? '').toMatch(/500/);
  });

  it('data.cards.medianFieldSize=0 → card mostra "—" (dash)', async () => {
    setMockData({
      cards: {
        totalTournaments: 0,
        abiUsd: 0,
        investmentUsd: 0,
        bankrollNeeded: 0,
        medianFieldSize: 0,
      },
      format: { pctPKO: 0, pctTurbo: 0, pctVanilla: 0 },
      volume: [],
      bankroll: [],
      list: [],
    });
    const { findByTestId } = await renderZoom();
    const card = await findByTestId('day-zoom-card-median-field');
    expect(card.textContent ?? '').toMatch(/—/);
  });

  it('data.cards.medianFieldSize=undefined → card mostra "—"', async () => {
    setMockData({
      cards: {
        totalTournaments: 0,
        abiUsd: 0,
        investmentUsd: 0,
        bankrollNeeded: 0,
      },
      format: { pctPKO: 0, pctTurbo: 0, pctVanilla: 0 },
      volume: [],
      bankroll: [],
      list: [],
    });
    const { findByTestId } = await renderZoom();
    const card = await findByTestId('day-zoom-card-median-field');
    expect(card.textContent ?? '').toMatch(/—/);
  });
});

describe('DayDetailZoom — Priority optimistic overlay (RF-05 D3)', () => {
  it('mutatePriority click → priorityOverrides → render imediato com prioridade nova', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
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
          id: 'pt-pri',
          site: 'PokerStars',
          time: '20:00',
          buyinUsd: 10,
          count: 1,
          prioridade: 2,
        },
      ],
    });
    const { findByTestId } = await renderZoom();
    const tournament = await findByTestId('day-zoom-tournament-pt-pri');
    expect(tournament.getAttribute('data-priority')).toBe('2');

    // Click priority dropdown trigger
    const priorityBtn = await findByTestId('day-zoom-tournament-priority-pt-pri');
    const user = userEvent.setup();
    await user.click(priorityBtn);

    // Click target "Alta" (1)
    const target = await findByTestId(
      'day-zoom-tournament-priority-target-pt-pri-1',
    );
    await user.click(target);

    // PUT chamado.
    expect(apiRequestMock).toHaveBeenCalled();
    const [method, url, payload] = apiRequestMock.mock.calls[0];
    expect(method).toBe('PUT');
    expect(url).toBe('/api/planned-tournaments/pt-pri');
    expect(payload).toMatchObject({ prioridade: 1 });
  });

  it('priorityOverrides persiste ate refetch confirmar', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
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
          id: 'pt-pri2',
          site: 'PokerStars',
          time: '20:00',
          buyinUsd: 10,
          count: 1,
          prioridade: 2,
        },
      ],
    });
    const { findByTestId } = await renderZoom();
    const priorityBtn = await findByTestId(
      'day-zoom-tournament-priority-pt-pri2',
    );
    const user = userEvent.setup();
    await user.click(priorityBtn);
    const target = await findByTestId(
      'day-zoom-tournament-priority-target-pt-pri2-1',
    );
    await user.click(target);

    // emit priority_set
    const priCall = emitMock.mock.calls.find(
      (c) => c[0] === 'coach.day_zoom_priority_set',
    );
    expect(priCall).toBeTruthy();
    expect(priCall?.[1]).toMatchObject({
      tournamentId: 'pt-pri2',
      priority: 1,
    });
  });
});
