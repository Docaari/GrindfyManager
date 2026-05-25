/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint day-detail-zoom-1 — RF-05 Telemetria 8 events ADR-207 alinhada.
 * Spec: Docs/specs/sprint-day-detail-zoom-1.md §RF-05.
 * ADR: Docs/architecture/decisions/210-day-detail-zoom-architecture.md §6.
 *
 * Cobre os 8 events `coach.day_zoom_*` (dot-namespace ADR-207-compliant):
 *
 *   1. coach.day_zoom_opened
 *   2. coach.day_zoom_closed (4 reasons: esc | backdrop | cta | navigation)
 *   3. coach.day_zoom_dnd_add (source: 'drag' | 'click_inline')
 *   4. coach.day_zoom_dnd_move
 *   5. coach.day_zoom_dnd_remove
 *   6. coach.day_zoom_filter_apply
 *   7. coach.day_zoom_search
 *   8. coach.day_zoom_undo
 *
 * Guards:
 *   - Nenhum event contem chaves de shared/pii-keys.
 *   - Cap delete TODO `// TODO(2026-08-23): cleanup day_zoom_* events` grep-able.
 *   - feature:'day_zoom' field em TODOS os events.
 *
 * Lessons: #2 / #14 / #28 / #38.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PII_KEYS_DENYLIST } from '@shared/pii-keys';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Spy compartilhado capturando todas as variantes de emit:
// - @/lib/tracker emit(...)
// - @/lib/activity-telemetry emitCoachEvent(...) / emitAudioEvent(...) etc.
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
// apiRequest mock — retorna shape REAL JSON parseado (lesson #13).
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
// Mock useDayDetail (paridade smoke).
// ---------------------------------------------------------------------------
vi.mock('@/hooks/useDayDetail', () => ({
  useDayDetail: () => ({
    data: {
      cards: { totalTournaments: 4, abiUsd: 5, investmentUsd: 22, bankrollNeeded: 50 },
      format: { pctPKO: 60, pctTurbo: 20, pctVanilla: 20 },
      volume: [{ site: 'PokerStars', count: 8 }],
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

async function loadZoom() {
  return await import('@/components/grade/DayDetailZoom');
}

// ---------------------------------------------------------------------------
// PII guard helper — recursivamente verifica que nenhuma chave do payload
// pertence ao denylist de shared/pii-keys.
// ---------------------------------------------------------------------------
function assertNoPii(payload: any) {
  function walk(obj: any) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(walk);
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      const lower = k.toLowerCase();
      expect(
        PII_KEYS_DENYLIST.has(lower),
        `Event payload contains PII key "${k}" (denylisted in shared/pii-keys)`,
      ).toBe(false);
      if (v && typeof v === 'object') walk(v);
    }
  }
  walk(payload);
}

// ---------------------------------------------------------------------------
// dispatchDragEnd helper — paridade com DayDetailZoom.dnd.test.tsx.
// ---------------------------------------------------------------------------
async function dispatchDragEnd(result: {
  draggableId: string;
  source: { droppableId: string; index: number };
  destination: { droppableId: string; index: number } | null;
}) {
  const dispatch = (window as any).__dayZoomDispatchDragEnd;
  if (typeof dispatch !== 'function') {
    throw new Error(
      'DayDetailZoom must expose window.__dayZoomDispatchDragEnd(result) for tests (RF-05).',
    );
  }
  await dispatch(result);
}

describe('RF-05 Telemetria — 8 events coach.day_zoom_* + PII guard + feature field', () => {
  it('coach.day_zoom_opened emitido ao abrir com dayOfWeek/profileLetter/source/breakpoint/library_count', async () => {
    const React = await import('react');
    const { render } = await import('@testing-library/react');
    const { DayDetailZoom } = await loadZoom();

    render(
      React.createElement(DayDetailZoom as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
        source: 'WeekGrid',
      }),
    );

    const openCall = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_opened');
    expect(openCall).toBeTruthy();
    expect(openCall?.[1]).toMatchObject({
      dayOfWeek: 2,
      profileLetter: 'A',
      source: 'WeekGrid',
    });
    expect(['lg', 'md', 'sm']).toContain(openCall?.[1]?.breakpoint);
    expect(typeof openCall?.[1]?.library_count === 'number' || openCall?.[1]?.library_count === undefined).toBe(true);
    expect(openCall?.[1]?.feature).toBe('day_zoom');
    assertNoPii(openCall?.[1]);
  });

  it('coach.day_zoom_closed emitido com 4 reasons possiveis + durationMs calculado', async () => {
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');
    const userEvent = (await import('@testing-library/user-event')).default;
    const { DayDetailZoom } = await loadZoom();

    render(
      React.createElement(DayDetailZoom as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );

    await screen.findByTestId('day-zoom-modal');
    const user = userEvent.setup();
    await user.keyboard('{Escape}');

    const closedCall = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_closed');
    expect(closedCall).toBeTruthy();
    expect(['esc', 'backdrop', 'cta', 'navigation']).toContain(closedCall?.[1]?.reason);
    expect(typeof closedCall?.[1]?.durationMs).toBe('number');
    expect(closedCall?.[1]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(closedCall?.[1]?.feature).toBe('day_zoom');
    assertNoPii(closedCall?.[1]);
  });

  it('coach.day_zoom_dnd_add com source:"drag" via DnD biblioteca→slot', async () => {
    apiRequestMock.mockResolvedValueOnce({
      id: 'tnt-new-1',
      name: 'Sunday Million',
      site: 'PokerStars',
      dayOfWeek: 2,
      time: '20:00',
      profile: 'A',
    });

    const React = await import('react');
    const { render, screen, waitFor } = await import('@testing-library/react');
    const { DayDetailZoom } = await loadZoom();

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
      const c = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_dnd_add');
      expect(c).toBeTruthy();
    });

    const addCall = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_dnd_add');
    expect(addCall?.[1]?.source).toBe('drag');
    expect(addCall?.[1]?.slot).toBe('20:00');
    expect(addCall?.[1]?.dayOfWeek).toBe(2);
    expect(addCall?.[1]?.feature).toBe('day_zoom');
    assertNoPii(addCall?.[1]);
  });

  it('coach.day_zoom_dnd_move com fromSlot/toSlot/tournamentId/dayOfWeek', async () => {
    apiRequestMock.mockResolvedValueOnce({
      id: 'tnt-1',
      time: '21:30',
      dayOfWeek: 2,
    });

    const React = await import('react');
    const { render, screen, waitFor } = await import('@testing-library/react');
    const { DayDetailZoom } = await loadZoom();

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
      const c = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_dnd_move');
      expect(c).toBeTruthy();
    });
    const moveCall = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_dnd_move');
    expect(moveCall?.[1]).toMatchObject({
      dayOfWeek: 2,
      fromSlot: '20:00',
      toSlot: '21:30',
      tournamentId: 'tnt-1',
    });
    expect(moveCall?.[1]?.feature).toBe('day_zoom');
    assertNoPii(moveCall?.[1]);
  });

  it('coach.day_zoom_dnd_remove com tournamentId/dayOfWeek/slot', async () => {
    apiRequestMock.mockResolvedValueOnce({ ok: true });

    const React = await import('react');
    const { render, screen, waitFor } = await import('@testing-library/react');
    const { DayDetailZoom } = await loadZoom();

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
      const c = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_dnd_remove');
      expect(c).toBeTruthy();
    });
    const removeCall = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_dnd_remove');
    expect(removeCall?.[1]).toMatchObject({
      dayOfWeek: 2,
      slot: '20:00',
      tournamentId: 'tnt-1',
    });
    expect(removeCall?.[1]?.feature).toBe('day_zoom');
    assertNoPii(removeCall?.[1]);
  });

  it('coach.day_zoom_filter_apply com filters object + resultCount', async () => {
    // Para filter_apply o flow vem do BibliotecaEmbedded; aqui validamos
    // que QUANDO emitido, o payload satisfaz contrato.
    // Disparamos via helper exposto pelo componente.
    const React = await import('react');
    const { render, screen, waitFor } = await import('@testing-library/react');
    const { DayDetailZoom } = await loadZoom();

    render(
      React.createElement(DayDetailZoom as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );
    await screen.findByTestId('day-zoom-modal');

    const dispatch = (window as any).__dayZoomDispatchFilterApply;
    if (typeof dispatch !== 'function') {
      throw new Error(
        'DayDetailZoom must expose window.__dayZoomDispatchFilterApply for telemetry tests (RF-05).',
      );
    }
    await dispatch({ site: 'PokerStars' }, false, 12);

    await waitFor(() => {
      const c = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_filter_apply');
      expect(c).toBeTruthy();
    });
    const filterCall = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_filter_apply');
    expect(filterCall?.[1]).toMatchObject({
      dayOfWeek: 2,
      profileLetter: 'A',
      resultCount: 12,
    });
    expect(filterCall?.[1]?.filters).toBeTruthy();
    expect(filterCall?.[1]?.feature).toBe('day_zoom');
    assertNoPii(filterCall?.[1]);
  });

  it('coach.day_zoom_search com query + resultCount + dayOfWeek + profileLetter', async () => {
    const React = await import('react');
    const { render, screen, waitFor } = await import('@testing-library/react');
    const { DayDetailZoom } = await loadZoom();

    render(
      React.createElement(DayDetailZoom as any, {
        open: true,
        onOpenChange: vi.fn(),
        dayOfWeek: 2,
        profileLetter: 'A',
      }),
    );
    await screen.findByTestId('day-zoom-modal');

    const dispatch = (window as any).__dayZoomDispatchSearch;
    if (typeof dispatch !== 'function') {
      throw new Error(
        'DayDetailZoom must expose window.__dayZoomDispatchSearch(query, resultCount) for telemetry tests (RF-05).',
      );
    }
    await dispatch('sunday', 3);

    await waitFor(() => {
      const c = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_search');
      expect(c).toBeTruthy();
    });
    const searchCall = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_search');
    expect(searchCall?.[1]).toMatchObject({
      dayOfWeek: 2,
      profileLetter: 'A',
      query: 'sunday',
      resultCount: 3,
    });
    expect(searchCall?.[1]?.feature).toBe('day_zoom');
    assertNoPii(searchCall?.[1]);
  });

  it('coach.day_zoom_undo emitido apos click no undo button com action correto', async () => {
    apiRequestMock.mockResolvedValueOnce({ ok: true });
    apiRequestMock.mockResolvedValueOnce({
      id: 'tnt-restored',
      time: '20:00',
      dayOfWeek: 2,
    });

    const React = await import('react');
    const { render, screen, waitFor } = await import('@testing-library/react');
    const userEvent = (await import('@testing-library/user-event')).default;
    const { DayDetailZoom } = await loadZoom();

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
      const c = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_undo');
      expect(c).toBeTruthy();
    });
    const undoCall = emitMock.mock.calls.find((c) => c[0] === 'coach.day_zoom_undo');
    expect(undoCall?.[1]?.action).toBe('remove');
    expect(undoCall?.[1]?.tournamentId).toBe('tnt-1');
    expect(undoCall?.[1]?.dayOfWeek).toBe(2);
    expect(undoCall?.[1]?.feature).toBe('day_zoom');
    assertNoPii(undoCall?.[1]);
  });

  it('todos os emits coach.day_zoom_* sao fire-and-forget (NAO throw se emit rejeita)', async () => {
    // Reset modules para garantir que o componente carregue com mock de emit que rejeita.
    vi.resetModules();
    vi.doMock('@/lib/tracker', () => ({
      emit: vi.fn(() => {
        throw new Error('boom');
      }),
    }));
    vi.doMock('@/lib/activity-telemetry', () => ({
      emitCoachEvent: vi.fn(() => Promise.reject(new Error('boom'))),
      emitAudioEvent: vi.fn(),
      emitLessonEvent: vi.fn(),
      emitLibraryEvent: vi.fn(),
    }));
    vi.doMock('@/hooks/useDayDetail', () => ({
      useDayDetail: () => ({
        data: {
          cards: { totalTournaments: 0, abiUsd: 0, investmentUsd: 0, bankrollNeeded: 0 },
          format: { pctPKO: 0, pctTurbo: 0, pctVanilla: 0 },
          volume: [],
          bankroll: [],
          list: [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      }),
      default: () => ({ data: null }),
    }));
    vi.doMock('@/components/grade/BibliotecaEmbedded', () => ({
      BibliotecaEmbedded: (_props: any) => null,
      default: () => null,
    }));

    const React = await import('react');
    const { render } = await import('@testing-library/react');
    const { DayDetailZoom } = await import('@/components/grade/DayDetailZoom');

    expect(() =>
      render(
        React.createElement(DayDetailZoom as any, {
          open: true,
          onOpenChange: vi.fn(),
          dayOfWeek: 2,
          profileLetter: 'A',
        }),
      ),
    ).not.toThrow();

    vi.doUnmock('@/lib/tracker');
    vi.doUnmock('@/lib/activity-telemetry');
    vi.doUnmock('@/hooks/useDayDetail');
    vi.doUnmock('@/components/grade/BibliotecaEmbedded');
    vi.resetModules();
  });

  it('cap delete: TODO grep-able presente em arquivo de tracker OU ADR/spec', () => {
    // Garante existencia de comentario grepavel `TODO(2026-08-23): cleanup day_zoom_*`
    // em pelo menos um dos arquivos de instrumentacao centralizados.
    const candidates = [
      path.resolve(process.cwd(), 'client/src/lib/tracker.ts'),
      path.resolve(process.cwd(), 'client/src/lib/activity-telemetry.ts'),
      path.resolve(process.cwd(), 'Docs/architecture/decisions/210-day-detail-zoom-architecture.md'),
      path.resolve(process.cwd(), 'Docs/specs/sprint-day-detail-zoom-1.md'),
    ];
    const hits = candidates.filter((p) => {
      try {
        if (!fs.existsSync(p)) return false;
        const src = fs.readFileSync(p, 'utf8');
        return /TODO\(2026-08-23\)/.test(src) && /day_zoom/i.test(src);
      } catch {
        return false;
      }
    });
    expect(
      hits.length,
      'Expected at least one of tracker.ts/activity-telemetry.ts/ADR-210/spec to contain "TODO(2026-08-23): cleanup day_zoom_* events" comment for cap delete grep.',
    ).toBeGreaterThan(0);
  });
});
