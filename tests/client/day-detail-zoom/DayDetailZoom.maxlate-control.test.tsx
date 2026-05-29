/**
 * DayDetailZoom — Max Late quick toggle/picker (paridade grind-live MaxLateControl).
 *
 * Cobre o botao de Max Late adicionado ao modal de detalhes do dia:
 *   - Toggle renderiza por torneio gerenciavel (day-zoom-maxlate-toggle-{id}).
 *   - Sem maxLate: click abre picker; confirm HH:MM valido → PUT registrationTime.
 *   - Confirm invalido → erro inline, PUT NAO chamado.
 *   - Com maxLate: click toggle limpa direto → PUT registrationTime=null.
 *   - Field estimado renderiza chip dedicado (day-zoom-tournament-field-{id}).
 *
 * Lessons: #14/#38 (await import), #27 (fireEvent.click em button plano OK; Radix
 * nao envolvido aqui), #28 (mock path exato).
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

function fixture(itemOverrides: any) {
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
        name: 'Sunday Million',
        site: 'PokerStars',
        time: '18:00',
        buyinUsd: 10,
        count: 1,
        maxLate: null,
        ...itemOverrides,
      },
    ],
  });
}

beforeEach(() => {
  emitMock.mockReset();
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ id: 'pt-1' });
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

async function renderZoom() {
  const React = await import('react');
  const { render } = await import('@testing-library/react');
  const { DayDetailZoom } = await import('@/components/grade/DayDetailZoom');
  return render(
    React.createElement(DayDetailZoom as any, {
      open: true,
      onOpenChange: vi.fn(),
      dayOfWeek: 2,
      profileLetter: 'A',
    }),
  );
}

describe('DayDetailZoom — Max Late toggle/picker', () => {
  it('toggle renderiza para torneio gerenciavel', async () => {
    fixture({});
    const { findByTestId } = await renderZoom();
    expect(await findByTestId('day-zoom-maxlate-toggle-pt-1')).toBeInTheDocument();
  });

  it('sem maxLate: click abre picker; confirm "21:30" → PUT registrationTime', async () => {
    const { fireEvent } = await import('@testing-library/react');
    fixture({ maxLate: null });
    const { findByTestId, queryByTestId } = await renderZoom();

    // Picker fechado inicialmente.
    expect(queryByTestId('day-zoom-maxlate-menu-pt-1')).toBeNull();

    fireEvent.click(await findByTestId('day-zoom-maxlate-toggle-pt-1'));
    const picker = await findByTestId('day-zoom-maxlate-picker-pt-1');
    fireEvent.change(picker, { target: { value: '21:30' } });
    fireEvent.click(await findByTestId('day-zoom-maxlate-confirm-pt-1'));

    expect(apiRequestMock).toHaveBeenCalledWith(
      'PUT',
      '/api/planned-tournaments/pt-1',
      { registrationTime: '21:30' },
    );
  });

  it('confirm com horario invalido → erro inline, PUT NAO chamado', async () => {
    const { fireEvent } = await import('@testing-library/react');
    fixture({ maxLate: null });
    const { findByTestId } = await renderZoom();

    fireEvent.click(await findByTestId('day-zoom-maxlate-toggle-pt-1'));
    const picker = await findByTestId('day-zoom-maxlate-picker-pt-1');
    fireEvent.change(picker, { target: { value: '99:99' } });
    fireEvent.click(await findByTestId('day-zoom-maxlate-confirm-pt-1'));

    expect(await findByTestId('day-zoom-maxlate-error-pt-1')).toBeInTheDocument();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('com maxLate definido: click toggle limpa → PUT registrationTime=null', async () => {
    const { fireEvent } = await import('@testing-library/react');
    fixture({ maxLate: '20:00' });
    const { findByTestId } = await renderZoom();

    fireEvent.click(await findByTestId('day-zoom-maxlate-toggle-pt-1'));

    expect(apiRequestMock).toHaveBeenCalledWith(
      'PUT',
      '/api/planned-tournaments/pt-1',
      { registrationTime: null },
    );
  });

  it('PUT falha → rollback: chip volta ao valor persistido + errorToast', async () => {
    const { fireEvent } = await import('@testing-library/react');
    apiRequestMock.mockRejectedValueOnce(new Error('boom'));
    fixture({ maxLate: '20:00' });
    const { findByTestId, queryByTestId } = await renderZoom();

    // Clear otimista falha → override removido, chip persistido (20:00) volta.
    fireEvent.click(await findByTestId('day-zoom-maxlate-toggle-pt-1'));
    expect(await findByTestId('day-zoom-error-toast')).toBeInTheDocument();
    expect(
      await findByTestId('day-zoom-tournament-maxlate-pt-1'),
    ).toBeInTheDocument();
    // toggle volta ao estado "tem maxLate" (aria-pressed=true).
    expect(
      (await findByTestId('day-zoom-maxlate-toggle-pt-1')).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true');
    expect(queryByTestId('day-zoom-maxlate-menu-pt-1')).toBeNull();
  });

  it('estimatedField > 0 → chip dedicado day-zoom-tournament-field-{id}', async () => {
    fixture({ guaranteedUsd: 100000, estimatedField: 5000 });
    const { findByTestId } = await renderZoom();
    const chip = await findByTestId('day-zoom-tournament-field-pt-1');
    expect(chip).toBeInTheDocument();
    expect(chip.textContent).toContain('5.000');
  });
});
