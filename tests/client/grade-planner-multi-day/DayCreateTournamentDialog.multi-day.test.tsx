/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint grade-planner-library-and-multi-day — RF-02 + RF-04 (criacao em lote).
 * Spec: Docs/specs/grade-planner-library-and-multi-day.md §RF-02 §RF-03 §RF-04.
 * ADR:  Docs/architecture/decisions/245-...-multi-day.md §D1 §D2 §D5 §D6 §C1 §C5.
 *
 * QUEM ORQUESTRA O LOTE: `DayCreateTournamentDialog` (ADR §Q7/Opcao A). Ele ja e
 * o unico lugar do codigo que sabe transformar TournamentFormState em corpo de
 * POST /api/planned-tournaments. O GradePlanner continua sendo a FONTE de
 * getActiveProfile (passado para dentro via prop), nao o dono do laco.
 *
 * CONTRATO NOVO exercitado aqui (prop opcional — sem ela, comportamento de hoje
 * byte-a-byte, que e o que mantem DayDetailZoom intocado, ADR §C2):
 *
 *   initial?: Partial<TournamentFormState>;  // prefill do registro da biblioteca
 *                                            // (RF-03); vence suggestedSlot no `time`
 *   multiDay?: {
 *     initialDays?: number[];      // "+" da celula: [dia de origem]. Biblioteca: []
 *     getProfileForDay: (dayOfWeek: number) => 'A'|'B'|'C'|'OFF'|null|undefined;
 *     dayLabels?: readonly string[];   // default weekDays[].short
 *     libraryTemplateId?: string;      // RF-03/D6 — vai no payload de cada POST
 *   }
 *
 * `dayOfWeek` e `profileLetter` passam a ser OPCIONAIS (no fluxo da biblioteca
 * nao ha dia de origem) — ADR §Q7 "Contras".
 *
 * DECISOES DO ADR QUE ESTE ARQUIVO FIXA:
 *   - lote SEQUENCIAL, nao Promise.allSettled paralelo (§Q6/Opcao A, §C4);
 *   - submit continua data-testid="day-zoom-create-submit" (§C3 — o
 *     "multi-day-submit" da spec esta SUPERADO);
 *   - invalidacao UMA vez por lote, incluindo ["day-detail", profile, dia] (§C5);
 *   - telemetria coach.day_zoom_create_save UMA vez por lote, com daysCount e
 *     skippedCount (§D5);
 *   - 1 dia marcado passa a emitir toast de sucesso, o que hoje nao acontece
 *     neste adapter (§C1 — mudanca de tela declarada);
 *   - targets vazio: zero POST + modal ABERTO, porque o onSubmit LANCA
 *     (TournamentFormDialog.tsx:280) e o errorMessage controlado tem
 *     precedencia sobre o errorLocal generico.
 *
 * Lessons: #13 (apiRequest devolve JSON parseado), #14/#26/#38 (await import,
 * nunca require, nunca misturar os dois estilos), #2 (data-testid estavel),
 * #3 (mock com o shape REAL — payload conferido em server/routes/grade-planner.ts).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Telemetria — spy unico cobrindo safe-emit e activity-telemetry.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// apiRequest devolve JSON JA PARSEADO (lesson #13). Shape real do POST:
// server/routes/grade-planner.ts:147-180 devolve o planned_tournament criado.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// useToast — shape real: `useToast()` devolve { toasts, toast, dismiss }.
// ---------------------------------------------------------------------------
const toastMock = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toasts: [], toast: toastMock, dismiss: vi.fn() }),
  toast: (...args: any[]) => toastMock(...args),
}));

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'] as const;

beforeEach(() => {
  emitMock.mockReset();
  apiRequestMock.mockReset();
  invalidateQueriesMock.mockReset();
  toastMock.mockReset();
  apiRequestMock.mockResolvedValue({ id: 'pt-created' });
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 1440 });
});

afterEach(() => {
  vi.clearAllMocks();
});

/** Deixa microtasks e efeitos do React drenarem. */
async function flush(ms = 0) {
  const { act } = await import('@testing-library/react');
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function renderDialog(override: Record<string, any> = {}) {
  const React = await import('react');
  const { render, screen, fireEvent } = await import('@testing-library/react');
  const { DayCreateTournamentDialog } = await import(
    '@/components/grade/DayCreateTournamentDialog'
  );

  const props: Record<string, any> = {
    open: true,
    onOpenChange: vi.fn(),
    dayOfWeek: 3,
    profileLetter: 'B',
    suggestedSlot: '20:00',
    knownSites: [],
    onSaved: vi.fn(),
    ...override,
  };

  const result = render(
    React.createElement(DayCreateTournamentDialog as any, props),
  );
  return { ...result, screen, fireEvent, props };
}

/** Preenche o minimo que o canSubmit interno do dialog canonico exige. */
async function fillRequiredFields(screen: any, fireEvent: any) {
  fireEvent.change(await screen.findByTestId('day-zoom-create-input-name'), {
    target: { value: 'Sunday Million' },
  });
  fireEvent.change(await screen.findByTestId('day-zoom-create-input-site'), {
    target: { value: 'PokerStars' },
  });
}

function multiDay(override: Record<string, any> = {}) {
  return {
    initialDays: [3],
    getProfileForDay: (d: number) =>
      ({ 3: 'B', 4: 'A', 5: 'C' } as Record<number, any>)[d] ?? null,
    dayLabels: DAY_LABELS,
    ...override,
  };
}

/** Payloads dos POSTs em /api/planned-tournaments, na ordem em que sairam. */
function postedPayloads() {
  return apiRequestMock.mock.calls
    .filter((c) => c[0] === 'POST' && c[1] === '/api/planned-tournaments')
    .map((c) => c[2]);
}

// ===========================================================================
// RF-02 — o seletor so existe nos fluxos de criacao da grade, e e opt-in
// ===========================================================================

describe('DayCreateTournamentDialog — seletor de dias e opt-in por prop', () => {
  it('renderiza o WeekDaysPicker dentro do modal quando a prop multiDay e passada', async () => {
    const { screen } = await renderDialog({ multiDay: multiDay() });
    expect(await screen.findByTestId('week-days-picker')).toBeInTheDocument();
  });

  it('NAO renderiza o seletor sem a prop multiDay — Detalhe do Dia segue intocado', async () => {
    const { screen } = await renderDialog();
    await screen.findByTestId('day-zoom-create-dialog');
    expect(screen.queryByTestId('week-days-picker')).toBeNull();
  });

  it('pre-marca o dia de origem ao abrir pelo "+" da celula', async () => {
    const { screen } = await renderDialog({
      multiDay: multiDay({ initialDays: [3] }),
    });
    expect(
      (await screen.findByTestId('week-day-chip-3')).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      (await screen.findByTestId('week-day-chip-4')).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('marcar um chip adiciona o dia; desmarcar remove (state do lote vive no adapter)', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({ initialDays: [3] }),
    });
    fireEvent.click(await screen.findByTestId('week-day-chip-4'));
    expect(
      (await screen.findByTestId('week-day-chip-4')).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(await screen.findByTestId('week-day-chip-4'));
    expect(
      (await screen.findByTestId('week-day-chip-4')).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('Salvar fica desabilitado com zero dias marcados, mesmo com o formulario valido', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({ initialDays: [3] }),
    });
    await fillRequiredFields(screen, fireEvent);
    const submit = (await screen.findByTestId(
      'day-zoom-create-submit',
    )) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);

    fireEvent.click(await screen.findByTestId('week-day-chip-3'));
    expect(
      ((await screen.findByTestId('day-zoom-create-submit')) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('Salvar volta a habilitar quando o jogador remarca ao menos um dia', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({ initialDays: [] }),
    });
    await fillRequiredFields(screen, fireEvent);
    expect(
      ((await screen.findByTestId('day-zoom-create-submit')) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(await screen.findByTestId('week-day-chip-1'));
    expect(
      ((await screen.findByTestId('day-zoom-create-submit')) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});

// ===========================================================================
// RF-04 — o lote: N POSTs sequenciais, perfil por dia, pulados
// ===========================================================================

describe('DayCreateTournamentDialog — lote de criacao', () => {
  it('dispara um POST por dia marcado, cada um com o dayOfWeek do proprio dia', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({ initialDays: [3] }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('week-day-chip-4'));
    fireEvent.click(await screen.findByTestId('week-day-chip-5'));
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    const payloads = postedPayloads();
    expect(payloads).toHaveLength(3);
    expect(payloads.map((p) => p.dayOfWeek)).toEqual([3, 4, 5]);
  });

  it('cada torneio criado herda o perfil ATIVO DAQUELE dia, nao o do dia de origem', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({ initialDays: [3] }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('week-day-chip-4'));
    fireEvent.click(await screen.findByTestId('week-day-chip-5'));
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    const payloads = postedPayloads();
    expect(payloads.map((p) => [p.dayOfWeek, p.profile])).toEqual([
      [3, 'B'],
      [4, 'A'],
      [5, 'C'],
    ]);
  });

  it('todos os dias do lote compartilham o mesmo horario e os mesmos campos do formulario', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({ initialDays: [3] }),
      suggestedSlot: '19:30',
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.change(await screen.findByTestId('day-zoom-create-input-buyin'), {
      target: { value: '109' },
    });
    fireEvent.click(await screen.findByTestId('week-day-chip-4'));
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    const payloads = postedPayloads();
    expect(payloads).toHaveLength(2);
    for (const p of payloads) {
      expect(p.name).toBe('Sunday Million');
      expect(p.site).toBe('PokerStars');
      expect(p.time).toBe('19:30');
      expect(p.buyIn).toBe('109');
    }
  });

  it('os POSTs saem em SEQUENCIA — o segundo so parte depois do primeiro resolver', async () => {
    const deferreds: Array<{ resolve: (v: any) => void; reject: (e: any) => void }> =
      [];
    apiRequestMock.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          deferreds.push({ resolve, reject });
        }),
    );

    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({ initialDays: [3] }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('week-day-chip-4'));
    fireEvent.click(await screen.findByTestId('week-day-chip-5'));
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush();

    expect(postedPayloads()).toHaveLength(1);

    deferreds[0].resolve({ id: 'pt-1' });
    await flush();
    expect(postedPayloads()).toHaveLength(2);

    deferreds[1].resolve({ id: 'pt-2' });
    await flush();
    expect(postedPayloads()).toHaveLength(3);
  });

  it('pula dia OFF e dia sem perfil: so o dia valido vira POST', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({
        initialDays: [3],
        getProfileForDay: (d: number) =>
          ({ 3: 'B', 4: 'OFF', 5: null } as Record<number, any>)[d] ?? null,
      }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('week-day-chip-4'));
    fireEvent.click(await screen.findByTestId('week-day-chip-5'));
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    const payloads = postedPayloads();
    expect(payloads).toHaveLength(1);
    expect(payloads[0].dayOfWeek).toBe(3);
  });

  it('nao ativa perfil de dia OFF: nenhuma chamada a /api/profile-states sai do lote', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({
        initialDays: [4],
        getProfileForDay: (d: number) => (d === 4 ? 'OFF' : 'A'),
      }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    const touchedProfileState = apiRequestMock.mock.calls.some((c) =>
      String(c[1] ?? '').includes('profile-state'),
    );
    expect(touchedProfileState).toBe(false);
  });

  it('com 1 dia marcado sai exatamente 1 POST — paridade de payload com o fluxo de hoje', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({ initialDays: [3] }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    const payloads = postedPayloads();
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      name: 'Sunday Million',
      site: 'PokerStars',
      dayOfWeek: 3,
      profile: 'B',
      status: 'upcoming',
    });
  });
});

// ===========================================================================
// RF-04 — feedback: um unico toast por submit
// ===========================================================================

describe('DayCreateTournamentDialog — toast unico por lote', () => {
  it('com 1 dia marcado emite toast de sucesso (mudanca declarada no ADR §C1)', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({ initialDays: [3] }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][0]).toMatchObject({
      title: 'Torneio adicionado a 1 dia',
    });
    expect(toastMock.mock.calls[0][0].variant).toBeUndefined();
  });

  it('com 3 dias criados emite UM toast no plural, nao um por dia', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({ initialDays: [3] }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('week-day-chip-4'));
    fireEvent.click(await screen.findByTestId('week-day-chip-5'));
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][0]).toMatchObject({
      title: 'Torneio adicionado a 3 dias',
    });
  });

  it('com dias pulados o toast nomeia os dias e a razao', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({
        initialDays: [3],
        getProfileForDay: (d: number) =>
          ({ 3: 'B', 4: 'OFF', 5: null } as Record<number, any>)[d] ?? null,
      }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('week-day-chip-4'));
    fireEvent.click(await screen.findByTestId('week-day-chip-5'));
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][0]).toMatchObject({
      title: 'Torneio adicionado a 1 dia',
      description: 'Pulados: Qui (dia OFF); Sex (dia sem perfil ativo)',
    });
  });
});

// ===========================================================================
// RF-04 — falha parcial e falha total
// ===========================================================================

describe('DayCreateTournamentDialog — tolerancia a falha', () => {
  it('um POST que falha no meio nao aborta os seguintes (3 tentativas, 2 sucessos)', async () => {
    apiRequestMock
      .mockResolvedValueOnce({ id: 'pt-1' })
      .mockRejectedValueOnce(new Error('500 Internal Server Error'))
      .mockResolvedValueOnce({ id: 'pt-3' });

    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({ initialDays: [3] }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('week-day-chip-4'));
    fireEvent.click(await screen.findByTestId('week-day-chip-5'));
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(30);

    expect(postedPayloads()).toHaveLength(3);
  });

  it('falha parcial produz toast destructive nomeando o dia que falhou', async () => {
    apiRequestMock
      .mockResolvedValueOnce({ id: 'pt-1' })
      .mockRejectedValueOnce(new Error('500'))
      .mockResolvedValueOnce({ id: 'pt-3' });

    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({ initialDays: [3] }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('week-day-chip-4'));
    fireEvent.click(await screen.findByTestId('week-day-chip-5'));
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(30);

    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][0]).toMatchObject({
      title: 'Adicionado a 2 de 3 dias',
      description: 'Falhou em Qui',
      variant: 'destructive',
    });
  });

  it('falha parcial ainda fecha o modal — os torneios criados permanecem', async () => {
    apiRequestMock
      .mockResolvedValueOnce({ id: 'pt-1' })
      .mockRejectedValueOnce(new Error('500'));

    const onOpenChange = vi.fn();
    const { screen, fireEvent } = await renderDialog({
      onOpenChange,
      multiDay: multiDay({ initialDays: [3] }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('week-day-chip-4'));
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(30);

    expect(onOpenChange.mock.calls.some((c) => c[0] === false)).toBe(true);
  });

  it('quando TODOS os POSTs falham o modal continua aberto', async () => {
    apiRequestMock.mockRejectedValue(new Error('500'));

    const onOpenChange = vi.fn();
    const { screen, fireEvent } = await renderDialog({
      onOpenChange,
      multiDay: multiDay({ initialDays: [3] }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('week-day-chip-4'));
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(30);

    expect(onOpenChange.mock.calls.some((c) => c[0] === false)).toBe(false);
  });

  it('falha total emite toast destructive de falha, nunca de sucesso', async () => {
    apiRequestMock.mockRejectedValue(new Error('500'));

    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({ initialDays: [3] }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('week-day-chip-4'));
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(30);

    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][0]).toMatchObject({
      title: 'Nao foi possivel adicionar',
      variant: 'destructive',
    });
  });
});

// ===========================================================================
// RF-04 — targets vazio: nenhum POST, modal aberto
// ===========================================================================

describe('DayCreateTournamentDialog — todos os dias marcados invalidos', () => {
  it('nao dispara nenhum POST quando todos os dias marcados estao OFF', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({
        initialDays: [3, 4],
        getProfileForDay: () => 'OFF',
      }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    expect(postedPayloads()).toHaveLength(0);
  });

  it('mantem o modal aberto quando nao ha alvo valido', async () => {
    const onOpenChange = vi.fn();
    const { screen, fireEvent } = await renderDialog({
      onOpenChange,
      multiDay: multiDay({
        initialDays: [3, 4],
        getProfileForDay: () => 'OFF',
      }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    expect(onOpenChange.mock.calls.some((c) => c[0] === false)).toBe(false);
  });

  it('mostra a razao concreta no modal, nunca o texto generico de falha ao salvar', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({
        initialDays: [3, 4],
        getProfileForDay: () => 'OFF',
      }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    const err = await screen.findByTestId('day-zoom-create-error');
    expect(err.textContent ?? '').not.toMatch(/Falha ao salvar/i);
    expect((err.textContent ?? '').trim().length).toBeGreaterThan(0);
  });

  it('emite o toast explicativo "Nenhum dia valido" em variante destructive', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({
        initialDays: [3, 4],
        getProfileForDay: () => 'OFF',
      }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][0]).toMatchObject({
      title: 'Nenhum dia valido',
      variant: 'destructive',
    });
  });

  it('nao emite telemetria de save quando nenhum POST saiu', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({
        initialDays: [3, 4],
        getProfileForDay: () => 'OFF',
      }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    const saveCalls = emitMock.mock.calls.filter(
      (c) => c[0] === 'coach.day_zoom_create_save',
    );
    expect(saveCalls).toHaveLength(0);
  });
});

// ===========================================================================
// RF-04 — invalidacao de cache e telemetria: uma vez POR LOTE
// ===========================================================================

describe('DayCreateTournamentDialog — invalidacao e telemetria por lote', () => {
  async function submitThreeDays() {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({ initialDays: [3] }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('week-day-chip-4'));
    fireEvent.click(await screen.findByTestId('week-day-chip-5'));
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);
  }

  function invalidationsFor(firstKey: string) {
    return invalidateQueriesMock.mock.calls.filter(
      (c) => Array.isArray(c[0]?.queryKey) && c[0].queryKey[0] === firstKey,
    );
  }

  it('invalida ["/api/planned-tournaments"] UMA vez por lote, nao uma por dia', async () => {
    await submitThreeDays();
    expect(invalidationsFor('/api/planned-tournaments')).toHaveLength(1);
  });

  it('invalida ["/api/active-days"] uma vez por lote', async () => {
    await submitThreeDays();
    expect(invalidationsFor('/api/active-days')).toHaveLength(1);
  });

  it('invalida ["/api/tournament-library"] uma vez por lote (o backend auto-popula a biblioteca)', async () => {
    await submitThreeDays();
    expect(invalidationsFor('/api/tournament-library')).toHaveLength(1);
  });

  it('invalida ["day-detail", perfil, dia] para cada alvo criado (ADR §C5)', async () => {
    await submitThreeDays();
    const dayDetail = invalidationsFor('day-detail').map((c) => c[0].queryKey);
    expect(dayDetail).toEqual(
      expect.arrayContaining([
        ['day-detail', 'B', 3],
        ['day-detail', 'A', 4],
        ['day-detail', 'C', 5],
      ]),
    );
  });

  it('emite coach.day_zoom_create_save UMA vez por lote com daysCount e skippedCount', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({
        initialDays: [3],
        getProfileForDay: (d: number) =>
          ({ 3: 'B', 4: 'A', 5: 'OFF' } as Record<number, any>)[d] ?? null,
      }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('week-day-chip-4'));
    fireEvent.click(await screen.findByTestId('week-day-chip-5'));
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    const saveCalls = emitMock.mock.calls.filter(
      (c) => c[0] === 'coach.day_zoom_create_save',
    );
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0][1]).toMatchObject({
      feature: 'day_zoom',
      daysCount: 2,
      skippedCount: 1,
      site: 'PokerStars',
    });
  });
});

// ===========================================================================
// RF-03 — fluxo da biblioteca: pre-preenchimento + libraryTemplateId
// ===========================================================================

describe('DayCreateTournamentDialog — fluxo aberto pelo card da biblioteca', () => {
  const LIBRARY_ROW = {
    id: 'lib-42',
    name: 'Bounty Builder HR',
    site: 'PokerStars',
    buyIn: '109',
    guaranteed: '50000',
    time: '18:45',
    type: 'PKO',
    speed: 'Turbo',
  };

  async function renderFromLibrary(override: Record<string, any> = {}) {
    return await renderDialog({
      dayOfWeek: undefined,
      profileLetter: undefined,
      suggestedSlot: '',
      initial: {
        name: LIBRARY_ROW.name,
        site: LIBRARY_ROW.site,
        buyIn: LIBRARY_ROW.buyIn,
        guaranteed: LIBRARY_ROW.guaranteed,
        time: LIBRARY_ROW.time,
        type: LIBRARY_ROW.type,
        speed: LIBRARY_ROW.speed,
      },
      multiDay: multiDay({
        initialDays: [],
        libraryTemplateId: LIBRARY_ROW.id,
        // A fixture default de multiDay() so da perfil aos dias 3/4/5. Os testes
        // deste describe marcam 1/2/3 e esperam criacao nos tres, entao aqui a
        // semana inteira tem perfil ativo — sem isso, RF-04 pularia 1 e 2 (dia
        // sem perfil e pulado) e o teste cobraria o oposto do que ele mesmo fixa.
        getProfileForDay: (d: number) =>
          ({ 0: 'A', 1: 'A', 2: 'B', 3: 'B', 4: 'A', 5: 'C', 6: 'C' } as Record<
            number,
            any
          >)[d] ?? null,
      }),
      ...override,
    });
  }

  it('abre com nome, plataforma, buy-in, horario, tipo e velocidade do registro da biblioteca', async () => {
    const { screen } = await renderFromLibrary();
    expect(
      ((await screen.findByTestId(
        'day-zoom-create-input-name',
      )) as HTMLInputElement).value,
    ).toBe('Bounty Builder HR');
    expect(
      ((await screen.findByTestId(
        'day-zoom-create-input-site',
      )) as HTMLInputElement).value,
    ).toBe('PokerStars');
    expect(
      ((await screen.findByTestId(
        'day-zoom-create-input-buyin',
      )) as HTMLInputElement).value,
    ).toBe('109');
    expect(
      ((await screen.findByTestId(
        'day-zoom-create-input-time',
      )) as HTMLInputElement).value,
    ).toBe('18:45');
    expect(
      ((await screen.findByTestId(
        'day-zoom-create-input-type',
      )) as HTMLSelectElement).value,
    ).toBe('PKO');
    expect(
      ((await screen.findByTestId(
        'day-zoom-create-input-speed',
      )) as HTMLSelectElement).value,
    ).toBe('Turbo');
  });

  it('abre sem nenhum dia marcado e com Salvar desabilitado (nao ha dia de origem)', async () => {
    const { screen } = await renderFromLibrary();
    for (let day = 0; day <= 6; day += 1) {
      expect(
        (await screen.findByTestId(`week-day-chip-${day}`)).getAttribute(
          'aria-pressed',
        ),
      ).toBe('false');
    }
    expect(
      ((await screen.findByTestId('day-zoom-create-submit')) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('registro da biblioteca sem horario abre com o campo vazio e Salvar bloqueado', async () => {
    const { screen, fireEvent } = await renderFromLibrary({
      initial: { name: 'Sem Horario', site: 'GGPoker', time: '' },
    });
    expect(
      ((await screen.findByTestId(
        'day-zoom-create-input-time',
      )) as HTMLInputElement).value,
    ).toBe('');
    fireEvent.click(await screen.findByTestId('week-day-chip-1'));
    expect(
      ((await screen.findByTestId('day-zoom-create-submit')) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('marcar 3 dias cria 3 planejados nesses dias, sempre em /api/planned-tournaments', async () => {
    const { screen, fireEvent } = await renderFromLibrary();
    fireEvent.click(await screen.findByTestId('week-day-chip-1'));
    fireEvent.click(await screen.findByTestId('week-day-chip-2'));
    fireEvent.click(await screen.findByTestId('week-day-chip-3'));
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    const payloads = postedPayloads();
    expect(payloads.map((p) => p.dayOfWeek)).toEqual([1, 2, 3]);
    const wroteToLibrary = apiRequestMock.mock.calls.some(
      (c) => c[0] !== 'GET' && String(c[1] ?? '').includes('tournament-library'),
    );
    expect(wroteToLibrary).toBe(false);
  });

  it('cada POST carrega libraryTemplateId da linha de origem (ADR §D6 — mata a corrida do auto-populate)', async () => {
    const { screen, fireEvent } = await renderFromLibrary();
    fireEvent.click(await screen.findByTestId('week-day-chip-1'));
    fireEvent.click(await screen.findByTestId('week-day-chip-2'));
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    const payloads = postedPayloads();
    expect(payloads).toHaveLength(2);
    for (const p of payloads) {
      expect(p.libraryTemplateId).toBe('lib-42');
    }
  });

  it('fluxo da celula NAO manda libraryTemplateId (torneio digitado a mao)', async () => {
    const { screen, fireEvent } = await renderDialog({
      multiDay: multiDay({ initialDays: [3] }),
    });
    await fillRequiredFields(screen, fireEvent);
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await flush(20);

    expect(postedPayloads()[0].libraryTemplateId).toBeUndefined();
  });
});
