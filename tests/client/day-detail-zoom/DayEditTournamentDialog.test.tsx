/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint day-detail-consolidation — RF-02 Edit dialog (consolidacao TDD).
 * Spec: Docs/specs/sprint-day-detail-consolidation.md §RF-02.
 * ADR: Docs/architecture/decisions/213-day-detail-zoom-consolidation.md §D2.
 *
 * Cobre:
 *   - Render dialog com testids estaveis (10 inputs/botoes).
 *   - Hydrate snapshot via hydratedIdRef — useEffect popula form do tournament prop.
 *   - Re-hydrate quando tournament prop muda (mesmo open=true).
 *   - PUT /api/planned-tournaments/:id com payload completo.
 *   - safeEmit coach.day_zoom_edit_save apos sucesso.
 *   - Fallback ambig guaranteedUsd ?? guaranteed.
 *   - Edge: tournament.maxLate=null → input vazio.
 *   - Edge: tournament.guaranteedUsd ausente + guaranteed presente → usa guaranteed.
 *   - Edge: PUT 4xx → error toast renderiza, dialog NAO fecha.
 *
 * Lessons: #14/#38 (await import), #28 (mock path exato).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const emitMock = vi.fn();
const apiRequestMock = vi.fn();
const invalidateQueriesMock = vi.fn();

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
    invalidateQueries: (...args: any[]) => invalidateQueriesMock(...args),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(() => []),
  },
  getQueryFn: vi.fn(),
}));

beforeEach(() => {
  emitMock.mockReset();
  apiRequestMock.mockReset();
  invalidateQueriesMock.mockReset();
  apiRequestMock.mockResolvedValue({ id: 'pt-1' });
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 1440 });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function loadDialog() {
  return await import('@/components/grade/DayEditTournamentDialog');
}

function makeTournament(overrides: Partial<any> = {}): any {
  return {
    id: 'pt-1',
    name: 'Sunday Million',
    site: 'PokerStars',
    buyinUsd: 109,
    time: '20:00',
    type: 'Vanilla',
    speed: 'Normal',
    maxLate: null,
    guaranteedUsd: 1000000,
    ...overrides,
  };
}

async function renderDialog(overrides: Partial<any> = {}) {
  const React = await import('react');
  const { render, screen, fireEvent } = await import(
    '@testing-library/react'
  );
  const { DayEditTournamentDialog } = await loadDialog();
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    dayOfWeek: 2,
    profileLetter: 'A',
    tournament: makeTournament(),
    knownSites: [],
    onSaved: vi.fn(),
    ...overrides,
  };
  const result = render(
    React.createElement(DayEditTournamentDialog as any, props),
  );
  return { ...result, screen, fireEvent, props };
}

describe('DayEditTournamentDialog — RF-02 render + testids', () => {
  it('renderiza dialog quando open=true com testid day-zoom-edit-dialog', async () => {
    const { screen } = await renderDialog();
    expect(
      await screen.findByTestId('day-zoom-edit-dialog'),
    ).toBeInTheDocument();
  });

  it('renderiza inputs com testids estaveis', async () => {
    const { screen } = await renderDialog();
    expect(
      await screen.findByTestId('day-zoom-edit-input-name'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-edit-input-site'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-edit-input-buyin'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-edit-input-time'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-edit-input-maxlate'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-edit-input-guaranteed'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-edit-submit'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-edit-dialog-close'),
    ).toBeInTheDocument();
  });
});

describe('DayEditTournamentDialog — hydrate snapshot via hydratedIdRef', () => {
  it('popula form com fields do tournament prop ao abrir', async () => {
    const { screen } = await renderDialog({
      tournament: makeTournament({
        name: 'Mega Stack',
        site: 'GGNetwork',
        buyinUsd: 25,
        time: '18:00',
        maxLate: '19:30',
        guaranteedUsd: 50000,
      }),
    });
    const name = (await screen.findByTestId(
      'day-zoom-edit-input-name',
    )) as HTMLInputElement;
    const site = (await screen.findByTestId(
      'day-zoom-edit-input-site',
    )) as HTMLInputElement;
    const buyin = (await screen.findByTestId(
      'day-zoom-edit-input-buyin',
    )) as HTMLInputElement;
    const time = (await screen.findByTestId(
      'day-zoom-edit-input-time',
    )) as HTMLInputElement;
    const maxlate = (await screen.findByTestId(
      'day-zoom-edit-input-maxlate',
    )) as HTMLInputElement;
    const guaranteed = (await screen.findByTestId(
      'day-zoom-edit-input-guaranteed',
    )) as HTMLInputElement;

    expect(name.value).toBe('Mega Stack');
    expect(site.value).toBe('GGNetwork');
    expect(buyin.value).toBe('25');
    expect(time.value).toBe('18:00');
    expect(maxlate.value).toBe('19:30');
    expect(guaranteed.value).toBe('50000');
  });

  it('re-hydrate quando tournament prop muda (mesmo open=true)', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { fireEvent } = await import('@testing-library/react');
    const { DayEditTournamentDialog } = await loadDialog();

    function Wrapper() {
      const [tid, setTid] = (React as any).useState('pt-1');
      const t =
        tid === 'pt-1'
          ? makeTournament({ id: 'pt-1', name: 'First', buyinUsd: 10 })
          : makeTournament({ id: 'pt-2', name: 'Second', buyinUsd: 200 });
      return React.createElement(
        React.Fragment,
        null,
        React.createElement('button', {
          type: 'button',
          'data-testid': 'wrapper-switch',
          onClick: () => setTid('pt-2'),
        }),
        React.createElement(DayEditTournamentDialog as any, {
          open: true,
          onOpenChange: vi.fn(),
          dayOfWeek: 2,
          profileLetter: 'A',
          tournament: t,
          knownSites: [],
        }),
      );
    }

    render(React.createElement(Wrapper));
    const first = (await screen.findByTestId(
      'day-zoom-edit-input-name',
    )) as HTMLInputElement;
    expect(first.value).toBe('First');
    fireEvent.click(await screen.findByTestId('wrapper-switch'));
    // Re-render with new tournament; hydratedIdRef re-hidrata.
    const second = (await screen.findByTestId(
      'day-zoom-edit-input-name',
    )) as HTMLInputElement;
    expect(second.value).toBe('Second');
  });
});

describe('DayEditTournamentDialog — fallback ambig guaranteedUsd ?? guaranteed', () => {
  it('guaranteedUsd=50 + guaranteed=100 → input mostra "50" (prioridade USD)', async () => {
    const { screen } = await renderDialog({
      tournament: makeTournament({ guaranteedUsd: 50, guaranteed: 100 }),
    });
    const guaranteed = (await screen.findByTestId(
      'day-zoom-edit-input-guaranteed',
    )) as HTMLInputElement;
    expect(guaranteed.value).toBe('50');
  });

  it('guaranteedUsd=undefined + guaranteed=100 → input mostra "100"', async () => {
    const { screen } = await renderDialog({
      tournament: makeTournament({ guaranteedUsd: undefined, guaranteed: 100 }),
    });
    const guaranteed = (await screen.findByTestId(
      'day-zoom-edit-input-guaranteed',
    )) as HTMLInputElement;
    expect(guaranteed.value).toBe('100');
  });
});

describe('DayEditTournamentDialog — submit PUT + emit + edge', () => {
  it('PUT /api/planned-tournaments/:id chamado com payload completo + emit edit_save', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const { screen } = await renderDialog({
      tournament: makeTournament({
        id: 'pt-edit-1',
        name: 'X',
        site: 'PokerStars',
        time: '20:00',
      }),
    });
    const submit = await screen.findByTestId('day-zoom-edit-submit');
    fireEvent.click(submit);
    await new Promise((r) => setTimeout(r, 10));

    expect(apiRequestMock).toHaveBeenCalled();
    const [method, url, payload] = apiRequestMock.mock.calls[0];
    expect(method).toBe('PUT');
    expect(url).toBe('/api/planned-tournaments/pt-edit-1');
    expect(payload).toMatchObject({
      name: 'X',
      site: 'PokerStars',
      time: '20:00',
    });

    const saveCall = emitMock.mock.calls.find(
      (c) => c[0] === 'coach.day_zoom_edit_save',
    );
    expect(saveCall).toBeTruthy();
    expect(saveCall?.[1]).toMatchObject({
      tournamentId: 'pt-edit-1',
      dayOfWeek: 2,
      profileLetter: 'A',
    });
  });

  it('tournament.maxLate=null → input maxLate vazio', async () => {
    const { screen } = await renderDialog({
      tournament: makeTournament({ maxLate: null }),
    });
    const maxlate = (await screen.findByTestId(
      'day-zoom-edit-input-maxlate',
    )) as HTMLInputElement;
    expect(maxlate.value).toBe('');
  });

  it('tournament.maxLate ausente + registrationTime presente → input hidrata de registrationTime', async () => {
    const { screen } = await renderDialog({
      tournament: makeTournament({
        maxLate: undefined,
        registrationTime: '21:30',
      } as any),
    });
    const maxlate = (await screen.findByTestId(
      'day-zoom-edit-input-maxlate',
    )) as HTMLInputElement;
    expect(maxlate.value).toBe('21:30');
  });

  it('PUT 4xx → error renderiza, dialog NAO fecha', async () => {
    apiRequestMock.mockRejectedValueOnce(new Error('400 Bad Request'));
    const onOpenChange = vi.fn();
    const { fireEvent } = await import('@testing-library/react');
    const { screen } = await renderDialog({
      tournament: makeTournament({ id: 'pt-bad' }),
      onOpenChange,
    });
    const submit = await screen.findByTestId('day-zoom-edit-submit');
    fireEvent.click(submit);
    await new Promise((r) => setTimeout(r, 10));

    // Texto de erro renderizado.
    expect(screen.getByText(/Falha ao salvar/i)).toBeInTheDocument();
    // Dialog nao foi fechado.
    const closed = onOpenChange.mock.calls.find((c) => c[0] === false);
    expect(closed).toBeFalsy();
  });
});
