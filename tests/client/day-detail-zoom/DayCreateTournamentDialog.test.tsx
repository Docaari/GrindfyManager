/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint day-detail-consolidation — RF-01 Create dialog (consolidacao TDD).
 * Spec: Docs/specs/sprint-day-detail-consolidation.md §RF-01.
 * ADR: Docs/architecture/decisions/213-day-detail-zoom-consolidation.md §D2.
 *
 * Cobre:
 *   - Render dialog com testids estaveis (9 inputs + submit + error + close).
 *   - Reset state ao re-abrir (openedRef pattern).
 *   - Defaults pre-preenchidos (time = suggestedSlot).
 *   - POST /api/planned-tournaments com payload completo (maxLate→registrationTime).
 *   - Validacao: time obrigatorio (submit desabilitado), name obrigatorio.
 *   - onSuccess: queryClient.invalidateQueries chamado.
 *   - safeEmit coach.day_zoom_create_open ao abrir + coach.day_zoom_create_save apos sucesso.
 *   - Edge: POST 4xx → error renderiza, dialog NAO fecha.
 *   - Edge: maxLate vazio → payload registrationTime=null.
 *   - Edge: guaranteed=0 → payload guaranteed="0".
 *
 * Lessons: #14/#38 (await import), #27 (Radix mousedown), #28 (mock path exato).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Spy compartilhado para safeEmit (cobrindo emitCoachEvent via activity-telemetry).
// ---------------------------------------------------------------------------
const emitMock = vi.fn();

vi.mock('@/lib/activity-telemetry', () => ({
  emitCoachEvent: (...args: any[]) => emitMock(...args),
  emitAudioEvent: vi.fn(),
  emitLessonEvent: vi.fn(),
  emitLibraryEvent: vi.fn(),
}));

// safe-emit interno do componente importa de activity-telemetry — basta isso.
// Tambem mockamos diretamente @/lib/safe-emit caso seja imported diretamente:
vi.mock('@/lib/safe-emit', () => ({
  safeEmit: (...args: any[]) => emitMock(...args),
  default: (...args: any[]) => emitMock(...args),
}));

const apiRequestMock = vi.fn();
const invalidateQueriesMock = vi.fn();

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
  // Default: API success.
  apiRequestMock.mockResolvedValue({ id: 'new-pt-1' });
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 1440 });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function loadDialog() {
  return await import('@/components/grade/DayCreateTournamentDialog');
}

async function renderDialog(propsOverride: Partial<any> = {}) {
  const React = await import('react');
  const { render, screen, fireEvent } = await import(
    '@testing-library/react'
  );
  const { DayCreateTournamentDialog } = await loadDialog();
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    dayOfWeek: 2,
    profileLetter: 'A',
    suggestedSlot: '20:00',
    knownSites: [],
    onSaved: vi.fn(),
    ...propsOverride,
  };
  const result = render(
    React.createElement(DayCreateTournamentDialog as any, props),
  );
  return { ...result, screen, fireEvent, props };
}

describe('DayCreateTournamentDialog — RF-01 render + testids', () => {
  it('renderiza dialog quando open=true com data-testid day-zoom-create-dialog', async () => {
    const { screen } = await renderDialog();
    expect(
      await screen.findByTestId('day-zoom-create-dialog'),
    ).toBeInTheDocument();
  });

  it('renderiza 9 inputs com testids estaveis (name/site/buyin/time/type/speed/maxlate/guaranteed) + submit', async () => {
    const { screen } = await renderDialog();
    expect(
      await screen.findByTestId('day-zoom-create-input-name'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-create-input-site'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-create-input-buyin'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-create-input-time'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-create-input-type'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-create-input-speed'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-create-input-maxlate'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-create-input-guaranteed'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-create-submit'),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('day-zoom-create-dialog-close'),
    ).toBeInTheDocument();
  });

  it('emite coach.day_zoom_create_open ao abrir', async () => {
    await renderDialog();
    const openCall = emitMock.mock.calls.find(
      (c) => c[0] === 'coach.day_zoom_create_open',
    );
    expect(openCall).toBeTruthy();
    expect(openCall?.[1]).toMatchObject({
      dayOfWeek: 2,
      profileLetter: 'A',
      suggestedSlot: '20:00',
    });
  });
});

describe('DayCreateTournamentDialog — defaults + state reset', () => {
  it('pre-preenche input time com suggestedSlot', async () => {
    const { screen } = await renderDialog({ suggestedSlot: '13:00' });
    const timeInput = (await screen.findByTestId(
      'day-zoom-create-input-time',
    )) as HTMLInputElement;
    expect(timeInput.value).toBe('13:00');
  });

  it('reset state ao fechar e reabrir (openedRef pattern)', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { fireEvent } = await import('@testing-library/react');
    const { DayCreateTournamentDialog } = await loadDialog();

    function Wrapper() {
      const [open, setOpen] = (React as any).useState(true);
      return React.createElement(
        React.Fragment,
        null,
        React.createElement('button', {
          type: 'button',
          'data-testid': 'wrapper-toggle',
          onClick: () => setOpen((o: boolean) => !o),
        }),
        React.createElement(DayCreateTournamentDialog as any, {
          open,
          onOpenChange: setOpen,
          dayOfWeek: 2,
          profileLetter: 'A',
          suggestedSlot: '20:00',
          knownSites: [],
        }),
      );
    }

    render(React.createElement(Wrapper));
    const nameInput = (await screen.findByTestId(
      'day-zoom-create-input-name',
    )) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Stale Tournament' } });
    expect(nameInput.value).toBe('Stale Tournament');

    // Fecha
    const toggle = await screen.findByTestId('wrapper-toggle');
    fireEvent.click(toggle);
    // Reabre
    fireEvent.click(toggle);

    const reopened = (await screen.findByTestId(
      'day-zoom-create-input-name',
    )) as HTMLInputElement;
    expect(reopened.value).toBe('');
  });
});

describe('DayCreateTournamentDialog — validacao + submit', () => {
  it('submit desabilitado quando name vazio', async () => {
    const { screen } = await renderDialog();
    const submit = (await screen.findByTestId(
      'day-zoom-create-submit',
    )) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('POST /api/planned-tournaments chamado com payload completo (maxLate→registrationTime)', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const { screen } = await renderDialog();
    const name = await screen.findByTestId('day-zoom-create-input-name');
    const site = await screen.findByTestId('day-zoom-create-input-site');
    const buyin = await screen.findByTestId('day-zoom-create-input-buyin');
    const maxlate = await screen.findByTestId('day-zoom-create-input-maxlate');
    const guaranteed = await screen.findByTestId(
      'day-zoom-create-input-guaranteed',
    );

    fireEvent.change(name, { target: { value: 'Sunday Million' } });
    fireEvent.change(site, { target: { value: 'PokerStars' } });
    fireEvent.change(buyin, { target: { value: '109' } });
    fireEvent.change(maxlate, { target: { value: '21:30' } });
    fireEvent.change(guaranteed, { target: { value: '1000000' } });

    const submit = await screen.findByTestId('day-zoom-create-submit');
    fireEvent.click(submit);

    // Wait microtask para async handler
    await new Promise((r) => setTimeout(r, 0));

    expect(apiRequestMock).toHaveBeenCalled();
    const [method, url, payload] = apiRequestMock.mock.calls[0];
    expect(method).toBe('POST');
    expect(url).toBe('/api/planned-tournaments');
    expect(payload).toMatchObject({
      name: 'Sunday Million',
      site: 'PokerStars',
      dayOfWeek: 2,
      profile: 'A',
      registrationTime: '21:30',
    });
    expect(payload.buyIn).toBe('109');
    expect(payload.guaranteed).toBe('1000000');
  });

  it('onSuccess: invalidateQueries chamado para planned-tournaments + day-detail key', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const { screen } = await renderDialog();
    const name = await screen.findByTestId('day-zoom-create-input-name');
    const site = await screen.findByTestId('day-zoom-create-input-site');
    fireEvent.change(name, { target: { value: 'X' } });
    fireEvent.change(site, { target: { value: 'PokerStars' } });
    const submit = await screen.findByTestId('day-zoom-create-submit');
    fireEvent.click(submit);
    await new Promise((r) => setTimeout(r, 0));

    expect(invalidateQueriesMock).toHaveBeenCalled();
    // Pelo menos uma das chamadas deve referenciar day-detail
    const dayDetailCall = invalidateQueriesMock.mock.calls.find(
      (c) =>
        Array.isArray(c[0]?.queryKey) && c[0].queryKey[0] === 'day-detail',
    );
    expect(dayDetailCall).toBeTruthy();
  });

  it('emite coach.day_zoom_create_save apos onSuccess com payload {slot,site,buyIn}', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const { screen } = await renderDialog();
    const name = await screen.findByTestId('day-zoom-create-input-name');
    const site = await screen.findByTestId('day-zoom-create-input-site');
    fireEvent.change(name, { target: { value: 'X' } });
    fireEvent.change(site, { target: { value: 'PokerStars' } });
    const submit = await screen.findByTestId('day-zoom-create-submit');
    fireEvent.click(submit);
    await new Promise((r) => setTimeout(r, 0));

    const saveCall = emitMock.mock.calls.find(
      (c) => c[0] === 'coach.day_zoom_create_save',
    );
    expect(saveCall).toBeTruthy();
    expect(saveCall?.[1]).toMatchObject({
      dayOfWeek: 2,
      profileLetter: 'A',
      site: 'PokerStars',
      slot: '20:00',
    });
  });
});

describe('DayCreateTournamentDialog — edge cases', () => {
  it('maxLate vazio → payload registrationTime=null', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const { screen } = await renderDialog();
    const name = await screen.findByTestId('day-zoom-create-input-name');
    const site = await screen.findByTestId('day-zoom-create-input-site');
    fireEvent.change(name, { target: { value: 'X' } });
    fireEvent.change(site, { target: { value: 'PokerStars' } });
    // NAO preenche maxLate
    const submit = await screen.findByTestId('day-zoom-create-submit');
    fireEvent.click(submit);
    await new Promise((r) => setTimeout(r, 0));

    const [, , payload] = apiRequestMock.mock.calls[0];
    expect(payload.registrationTime).toBeNull();
  });

  it('guaranteed nao preenchido → payload guaranteed = "0"', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const { screen } = await renderDialog();
    const name = await screen.findByTestId('day-zoom-create-input-name');
    const site = await screen.findByTestId('day-zoom-create-input-site');
    fireEvent.change(name, { target: { value: 'X' } });
    fireEvent.change(site, { target: { value: 'PokerStars' } });
    const submit = await screen.findByTestId('day-zoom-create-submit');
    fireEvent.click(submit);
    await new Promise((r) => setTimeout(r, 0));

    const [, , payload] = apiRequestMock.mock.calls[0];
    expect(payload.guaranteed).toBe('0');
  });

  it('POST 4xx (apiRequest rejeita) → error renderiza, dialog NAO fecha', async () => {
    apiRequestMock.mockRejectedValueOnce(new Error('400 Bad Request'));
    const { fireEvent } = await import('@testing-library/react');
    const onOpenChange = vi.fn();
    const { screen } = await renderDialog({ onOpenChange });
    const name = await screen.findByTestId('day-zoom-create-input-name');
    const site = await screen.findByTestId('day-zoom-create-input-site');
    fireEvent.change(name, { target: { value: 'X' } });
    fireEvent.change(site, { target: { value: 'PokerStars' } });
    const submit = await screen.findByTestId('day-zoom-create-submit');
    fireEvent.click(submit);
    await new Promise((r) => setTimeout(r, 10));

    expect(
      await screen.findByTestId('day-zoom-create-error'),
    ).toBeInTheDocument();
    // Dialog NAO fechou — onOpenChange(false) nao foi chamado
    const closeCall = onOpenChange.mock.calls.find((c) => c[0] === false);
    expect(closeCall).toBeFalsy();
  });
});
