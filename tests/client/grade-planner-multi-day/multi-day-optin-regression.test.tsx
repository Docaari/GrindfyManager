/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint grade-planner-library-and-multi-day — regressao explicita.
 * Spec: Docs/specs/grade-planner-library-and-multi-day.md §RF-02 (regras) +
 *       "Requisitos Nao-Funcionais / Regressao zero".
 * ADR:  Docs/architecture/decisions/245-...-multi-day.md §D1 §D2 §C2.
 *
 * O seletor de dias e OPT-IN. Este arquivo existe para que a proxima pessoa que
 * mexer no dialog canonico descubra na hora, e nao em producao, se o campo
 * "Dias" vazou para um fluxo onde ele nao faz sentido:
 *
 *   - edicao da grade (`grade-edit`) e edicao do Detalhe do Dia
 *     (`day-zoom-edit`): mover/copiar um planejado existente para outros dias
 *     esta em "Fora de Escopo" da spec;
 *   - "Adicionar torneio a biblioteca" (`biblioteca-add`): grava em
 *     tournament_library, que nao tem dia da semana;
 *   - `DayCreateTournamentDialog` sem a prop `multiDay` (o consumidor
 *     DayDetailZoom.tsx:1668): comportamento de hoje byte-a-byte (ADR §C2).
 *
 * Tambem fixa a neutralidade da unica prop nova do dialog canonico
 * (`extraCanSubmit`, ADR §D2): quem nao passa a prop tem o `disabled` de hoje.
 *
 * Lessons: #14/#26/#38 (await import, nunca require), #2 (data-testid estavel).
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

const apiRequestMock = vi.fn();

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(() => []),
  },
  getQueryFn: vi.fn(),
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toasts: [], toast: toastMock, dismiss: vi.fn() }),
  toast: (...args: any[]) => toastMock(...args),
}));

beforeEach(() => {
  emitMock.mockReset();
  apiRequestMock.mockReset();
  toastMock.mockReset();
  apiRequestMock.mockResolvedValue({ id: 'pt-1' });
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 1440 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Regressao — dialog de EDICAO nao ganha o campo Dias', () => {
  it('DayEditTournamentDialog (day-zoom-edit) nao renderiza o seletor de dias', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { DayEditTournamentDialog } = await import(
      '@/components/grade/DayEditTournamentDialog'
    );

    render(
      React.createElement(DayEditTournamentDialog as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 3,
        profileLetter: 'B',
        tournament: {
          id: 'pt-1',
          name: 'Sunday Million',
          site: 'PokerStars',
          buyIn: '109',
          time: '20:00',
          type: 'Vanilla',
          speed: 'Normal',
        },
        knownSites: [],
      }),
    );

    await screen.findByTestId('day-zoom-edit-dialog');
    expect(screen.queryByTestId('week-days-picker')).toBeNull();
  });

  it('EditDialog da grade (grade-edit) nao renderiza o seletor de dias', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { EditDialog } = await import(
      '@/components/grade-planner/EditDialog'
    );

    // Stub do UseFormReturn com o shape REAL consumido pelo componente:
    // getValues() e formState.errors (EditDialog.tsx:55,89,106).
    const editForm = {
      getValues: () => ({
        name: 'Sunday Million',
        site: 'PokerStars',
        buyIn: '109',
        time: '20:00',
        guaranteed: '0',
        type: 'Vanilla',
        speed: 'Normal',
        prioridade: 2,
      }),
      setValue: vi.fn(),
      setError: vi.fn(),
      formState: { errors: {} },
    };

    render(
      React.createElement(EditDialog as any, {
        open: true,
        onOpenChange: vi.fn(),
        editForm,
        onSubmit: vi.fn(),
        onCancel: vi.fn(),
        isPending: false,
        editingTournament: { id: 'pt-1' },
      }),
    );

    await screen.findByTestId('grade-edit-dialog');
    expect(screen.queryByTestId('week-days-picker')).toBeNull();
  });
});

describe('Regressao — o dialog canonico so mostra o seletor quando o caller pede', () => {
  it('TournamentFormDialog sem extraSlot nao renderiza o seletor de dias', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { TournamentFormDialog } = await import(
      '@/components/tournament/TournamentFormDialog'
    );

    render(
      React.createElement(TournamentFormDialog as any, {
        open: true,
        onOpenChange: vi.fn(),
        title: 'Adicionar torneio a biblioteca',
        testIdPrefix: 'biblioteca-add',
        requireBuyIn: true,
        onSubmit: vi.fn(),
      }),
    );

    await screen.findByTestId('biblioteca-add-dialog');
    expect(screen.queryByTestId('week-days-picker')).toBeNull();
  });

  it('sem extraCanSubmit o Salvar so depende da validacao de hoje (prop aditiva e neutra)', async () => {
    const React = await import('react');
    const { render, screen, fireEvent } = await import(
      '@testing-library/react'
    );
    const { TournamentFormDialog } = await import(
      '@/components/tournament/TournamentFormDialog'
    );

    render(
      React.createElement(TournamentFormDialog as any, {
        open: true,
        onOpenChange: vi.fn(),
        title: 'Adicionar torneio a biblioteca',
        testIdPrefix: 'biblioteca-add',
        initial: { time: '20:00' },
        onSubmit: vi.fn(),
      }),
    );

    fireEvent.change(await screen.findByTestId('biblioteca-add-input-name'), {
      target: { value: 'Sunday Million' },
    });
    fireEvent.change(await screen.findByTestId('biblioteca-add-input-site'), {
      target: { value: 'PokerStars' },
    });

    expect(
      ((await screen.findByTestId('biblioteca-add-submit')) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('extraCanSubmit=false desabilita o Salvar mesmo com o formulario valido', async () => {
    const React = await import('react');
    const { render, screen, fireEvent } = await import(
      '@testing-library/react'
    );
    const { TournamentFormDialog } = await import(
      '@/components/tournament/TournamentFormDialog'
    );

    render(
      React.createElement(TournamentFormDialog as any, {
        open: true,
        onOpenChange: vi.fn(),
        title: 'Criar torneio',
        testIdPrefix: 'day-zoom-create',
        initial: { time: '20:00' },
        extraCanSubmit: false,
        onSubmit: vi.fn(),
      }),
    );

    fireEvent.change(await screen.findByTestId('day-zoom-create-input-name'), {
      target: { value: 'Sunday Million' },
    });
    fireEvent.change(await screen.findByTestId('day-zoom-create-input-site'), {
      target: { value: 'PokerStars' },
    });

    expect(
      ((await screen.findByTestId('day-zoom-create-submit')) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe('Regressao — DayCreateTournamentDialog sem multiDay segue o fluxo de hoje', () => {
  it('faz exatamente 1 POST no dia recebido por prop, sem passar pelo lote', async () => {
    const React = await import('react');
    const { render, screen, fireEvent, act } = await import(
      '@testing-library/react'
    );
    const { DayCreateTournamentDialog } = await import(
      '@/components/grade/DayCreateTournamentDialog'
    );

    render(
      React.createElement(DayCreateTournamentDialog as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
        suggestedSlot: '20:00',
        knownSites: [],
        onSaved: vi.fn(),
      }),
    );

    fireEvent.change(await screen.findByTestId('day-zoom-create-input-name'), {
      target: { value: 'Sunday Million' },
    });
    fireEvent.change(await screen.findByTestId('day-zoom-create-input-site'), {
      target: { value: 'PokerStars' },
    });
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const posts = apiRequestMock.mock.calls.filter(
      (c) => c[0] === 'POST' && c[1] === '/api/planned-tournaments',
    );
    expect(posts).toHaveLength(1);
    expect(posts[0][2]).toMatchObject({ dayOfWeek: 2, profile: 'A' });
  });

  it('nao emite toast proprio sem multiDay — quem avisa hoje e o onSaved do GradePlanner', async () => {
    const React = await import('react');
    const { render, screen, fireEvent, act } = await import(
      '@testing-library/react'
    );
    const { DayCreateTournamentDialog } = await import(
      '@/components/grade/DayCreateTournamentDialog'
    );

    render(
      React.createElement(DayCreateTournamentDialog as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
        suggestedSlot: '20:00',
        knownSites: [],
        onSaved: vi.fn(),
      }),
    );

    fireEvent.change(await screen.findByTestId('day-zoom-create-input-name'), {
      target: { value: 'Sunday Million' },
    });
    fireEvent.change(await screen.findByTestId('day-zoom-create-input-site'), {
      target: { value: 'PokerStars' },
    });
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(toastMock).not.toHaveBeenCalled();
  });

  it('continua emitindo coach.day_zoom_create_save uma vez, sem daysCount', async () => {
    const React = await import('react');
    const { render, screen, fireEvent, act } = await import(
      '@testing-library/react'
    );
    const { DayCreateTournamentDialog } = await import(
      '@/components/grade/DayCreateTournamentDialog'
    );

    render(
      React.createElement(DayCreateTournamentDialog as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
        suggestedSlot: '20:00',
        knownSites: [],
      }),
    );

    fireEvent.change(await screen.findByTestId('day-zoom-create-input-name'), {
      target: { value: 'X' },
    });
    fireEvent.change(await screen.findByTestId('day-zoom-create-input-site'), {
      target: { value: 'PokerStars' },
    });
    fireEvent.click(await screen.findByTestId('day-zoom-create-submit'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const saveCalls = emitMock.mock.calls.filter(
      (c) => c[0] === 'coach.day_zoom_create_save',
    );
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0][1]).toMatchObject({ dayOfWeek: 2, profileLetter: 'A' });
    expect(saveCalls[0][1].daysCount).toBeUndefined();
  });
});
