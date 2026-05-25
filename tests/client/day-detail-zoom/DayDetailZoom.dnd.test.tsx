/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint day-detail-zoom-1 — RF-02 DnD biblioteca→slot + reorder + remove + undo.
 * Spec: Docs/specs/sprint-day-detail-zoom-1.md §RF-02.
 * ADR: Docs/architecture/decisions/210-day-detail-zoom-architecture.md §3+§4.
 *
 * Cobre:
 *   - Drag biblioteca→slot: POST /api/planned-tournaments + otimistico + emit
 *     coach.day_zoom_dnd_add com source:'drag'.
 *   - Drag slot→slot mesmo dia: PUT /api/planned-tournaments/:id + emit
 *     coach.day_zoom_dnd_move.
 *   - Drag slot→zoom-biblioteca-trash: DELETE + toast undo 5s + emit
 *     coach.day_zoom_dnd_remove.
 *   - Rollback otimistico em 4xx + day-zoom-error-toast.
 *   - Coluna dia OFF: isDropDisabled=true.
 *   - Click no undo button: mutation reversa + emit coach.day_zoom_undo.
 *
 * Lessons: #2 (data-testid estavel), #3 (mocks shape REAL — apiRequest retorna
 * objeto JSON), #13 (apiRequest retorna JSON parseado), #14/#38 (await import,
 * NUNCA require) e #28 (vi.mock path exato).
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
// Mock apiRequest — retorna JSON parseado DIRETO (lesson #13).
// Cada teste configura `apiRequestMock.mockResolvedValueOnce(...)` com o shape
// REAL do endpoint:
//   - POST /api/planned-tournaments → objeto torneio criado (com id nanoid).
//   - PUT  /api/planned-tournaments/:id → objeto atualizado.
//   - DELETE /api/planned-tournaments/:id → { ok: true } ou objeto deletado.
// Validacao do shape feita ao ler server/routes/grade-planner.ts:147-180.
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
// Mock useDayDetail — retorna shape estavel (paridade smoke RF-01).
// ---------------------------------------------------------------------------
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
      list: [
        {
          id: 'tnt-1',
          name: 'Sunday Million',
          site: 'PokerStars',
          buyinUsd: 5.5,
          count: 1,
          time: '20:00',
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  default: () => ({ data: null, isLoading: false }),
}));

// ---------------------------------------------------------------------------
// Mock BibliotecaEmbedded — render shim (componentes filhos nao sao foco).
// Path EXATO (lesson #28) ao import em DayDetailZoom.tsx.
// ---------------------------------------------------------------------------
vi.mock('@/components/grade/BibliotecaEmbedded', () => ({
  BibliotecaEmbedded: (_props: any) => null,
  default: () => null,
}));

beforeEach(() => {
  emitMock.mockReset();
  apiRequestMock.mockReset();
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 1440 });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function loadComponent() {
  return await import('@/components/grade/DayDetailZoom');
}

// ---------------------------------------------------------------------------
// Helper: simula um drag-end via prop programatica.
// Premissa: DayDetailZoom expoe um helper de teste OR aceita um handler
// externo. Estrategia adotada: o componente registra `onDragEndForTest` via
// window OR expoe um util `simulateDragEnd(result)` exportado.
// Implementer DEVE entregar `__dispatchDragEnd` global em devmode para
// permitir tests deterministicos (react-beautiful-dnd nao expoe drag programatico).
// ---------------------------------------------------------------------------

interface DragResult {
  draggableId: string;
  type?: string;
  source: { droppableId: string; index: number };
  destination: { droppableId: string; index: number } | null;
}

async function dispatchDragEnd(result: DragResult) {
  // O componente deve expor um helper window.__dayZoomDispatchDragEnd para tests.
  // Implementer cria; aqui apenas invocamos.
  const dispatch = (window as any).__dayZoomDispatchDragEnd;
  if (typeof dispatch !== 'function') {
    throw new Error(
      'DayDetailZoom must expose window.__dayZoomDispatchDragEnd(result) for tests (RF-02). Sprint 1 TDD red phase: implementer cria.',
    );
  }
  await dispatch(result);
}

describe('RF-02 DayDetailZoom DnD biblioteca→slot + reorder + remove + undo', () => {
  it('drag biblioteca→slot POST /api/planned-tournaments + emit coach.day_zoom_dnd_add', async () => {
    const React = await import('react');
    const { render, screen, waitFor } = await import('@testing-library/react');
    const { DayDetailZoom } = await loadComponent();

    // Mock: POST retorna torneio criado (shape real ver server/routes/grade-planner.ts:147-180).
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

    render(
      React.createElement(DayDetailZoom as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );
    await screen.findByTestId('day-zoom-modal');

    await dispatchDragEnd({
      draggableId: 'lib-card-42',
      source: { droppableId: 'biblioteca-embedded', index: 0 },
      destination: { droppableId: 'zoom-cell-2-20:00', index: 0 },
    });

    await waitFor(() => {
      const postCall = apiRequestMock.mock.calls.find(
        (c) => c[0] === 'POST' && c[1] === '/api/planned-tournaments',
      );
      expect(postCall).toBeTruthy();
    });

    const addEmit = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_dnd_add');
    expect(addEmit).toBeTruthy();
    expect(addEmit?.[1]).toMatchObject({
      dayOfWeek: 2,
      profileLetter: 'A',
      slot: '20:00',
      source: 'drag',
    });
    expect(addEmit?.[1]?.feature).toBe('day_zoom');
  });

  it('drag slot→slot mesmo dia chama PUT /api/planned-tournaments/:id + emit coach.day_zoom_dnd_move', async () => {
    const React = await import('react');
    const { render, screen, waitFor } = await import('@testing-library/react');
    const { DayDetailZoom } = await loadComponent();

    apiRequestMock.mockResolvedValueOnce({
      id: 'tnt-1',
      name: 'Sunday Million',
      site: 'PokerStars',
      dayOfWeek: 2,
      time: '21:30',
      profile: 'A',
    });

    render(
      React.createElement(DayDetailZoom as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );
    await screen.findByTestId('day-zoom-modal');

    await dispatchDragEnd({
      draggableId: 'tnt-1',
      source: { droppableId: 'zoom-cell-2-20:00', index: 0 },
      destination: { droppableId: 'zoom-cell-2-21:30', index: 0 },
    });

    await waitFor(() => {
      const putCall = apiRequestMock.mock.calls.find(
        (c) => c[0] === 'PUT' && typeof c[1] === 'string' && c[1].startsWith('/api/planned-tournaments/'),
      );
      expect(putCall).toBeTruthy();
    });

    const moveEmit = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_dnd_move');
    expect(moveEmit).toBeTruthy();
    expect(moveEmit?.[1]).toMatchObject({
      dayOfWeek: 2,
      fromSlot: '20:00',
      toSlot: '21:30',
    });
    expect(moveEmit?.[1]?.feature).toBe('day_zoom');
  });

  it('drag slot→zoom-biblioteca-trash DELETE + toast undo 5s + emit coach.day_zoom_dnd_remove', async () => {
    const React = await import('react');
    const { render, screen, waitFor } = await import('@testing-library/react');
    const { DayDetailZoom } = await loadComponent();

    apiRequestMock.mockResolvedValueOnce({ ok: true });

    render(
      React.createElement(DayDetailZoom as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );
    await screen.findByTestId('day-zoom-modal');

    await dispatchDragEnd({
      draggableId: 'tnt-1',
      source: { droppableId: 'zoom-cell-2-20:00', index: 0 },
      destination: { droppableId: 'zoom-biblioteca-trash', index: 0 },
    });

    await waitFor(() => {
      const delCall = apiRequestMock.mock.calls.find((c) => c[0] === 'DELETE');
      expect(delCall).toBeTruthy();
    });

    expect(await screen.findByTestId('day-zoom-undo-toast')).toBeInTheDocument();
    expect(await screen.findByTestId('day-zoom-undo-button')).toBeInTheDocument();

    const removeEmit = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_dnd_remove');
    expect(removeEmit).toBeTruthy();
    expect(removeEmit?.[1]).toMatchObject({
      dayOfWeek: 2,
      slot: '20:00',
    });
    expect(removeEmit?.[1]?.feature).toBe('day_zoom');
  });

  it('rollback otimistico em 4xx + day-zoom-error-toast presente', async () => {
    const React = await import('react');
    const { render, screen, waitFor } = await import('@testing-library/react');
    const { DayDetailZoom } = await loadComponent();

    // 4xx: apiRequest rejeita com Error (paridade queryClient.throwIfResNotOk).
    apiRequestMock.mockRejectedValueOnce(
      Object.assign(new Error('400: Bad Request'), {
        response: { status: 400, data: { message: 'Bad Request' } },
      }),
    );

    render(
      React.createElement(DayDetailZoom as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );
    await screen.findByTestId('day-zoom-modal');

    await dispatchDragEnd({
      draggableId: 'lib-card-42',
      source: { droppableId: 'biblioteca-embedded', index: 0 },
      destination: { droppableId: 'zoom-cell-2-20:00', index: 0 },
    });

    expect(await screen.findByTestId('day-zoom-error-toast')).toBeInTheDocument();

    // Sucesso emit NAO emitido — apenas rollback.
    const addEmit = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_dnd_add');
    expect(addEmit).toBeFalsy();
  });

  it('coluna dia=OFF: Droppable recebe isDropDisabled=true (via prop dayProfileOff)', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const { DayDetailZoom } = await loadComponent();

    render(
      React.createElement(DayDetailZoom as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
        dayProfileOff: true,
      }),
    );

    const modal = await screen.findByTestId('day-zoom-modal');
    // Implementer deve marcar atributo data-dnd-disabled="true" no container
    // de slots para o test verificar (data-testid estavel — lesson #2).
    const disabledMarker = modal.querySelector('[data-dnd-disabled="true"]');
    expect(disabledMarker).toBeTruthy();
  });

  it('click undo button chama mutation reversa + emit coach.day_zoom_undo action="remove"', async () => {
    const React = await import('react');
    const { render, screen, waitFor } = await import('@testing-library/react');
    const userEvent = (await import('@testing-library/user-event')).default;
    const { DayDetailZoom } = await loadComponent();

    // 1. DELETE bem sucedido pra produzir toast undo.
    apiRequestMock.mockResolvedValueOnce({ ok: true });
    // 2. Undo POST recria o torneio.
    apiRequestMock.mockResolvedValueOnce({
      id: 'tnt-1-restored',
      name: 'Sunday Million',
      site: 'PokerStars',
      dayOfWeek: 2,
      time: '20:00',
      profile: 'A',
    });

    render(
      React.createElement(DayDetailZoom as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );
    await screen.findByTestId('day-zoom-modal');

    await dispatchDragEnd({
      draggableId: 'tnt-1',
      source: { droppableId: 'zoom-cell-2-20:00', index: 0 },
      destination: { droppableId: 'zoom-biblioteca-trash', index: 0 },
    });

    const undoBtn = await screen.findByTestId('day-zoom-undo-button');
    const user = userEvent.setup();
    await user.click(undoBtn);

    await waitFor(() => {
      const postCall = apiRequestMock.mock.calls.find(
        (c) => c[0] === 'POST' && c[1] === '/api/planned-tournaments',
      );
      expect(postCall).toBeTruthy();
    });

    const undoEmit = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_undo');
    expect(undoEmit).toBeTruthy();
    expect(undoEmit?.[1]?.action).toBe('remove');
    expect(undoEmit?.[1]?.feature).toBe('day_zoom');
  });
});
