/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint UX-QW-2 — RF-02
 * Spec: Docs/specs/sprint-ux-qw-2.md
 *
 * Empty state da grade quando:
 *   plannedTournaments.length === 0 && (activeProfile === 'OFF' || !activeProfile)
 *
 * Renderiza `<EmptyState area="grade-planner-empty">` com:
 *   - title: "Sua grade esta vazia"
 *   - description: "Ative um perfil A/B/C e clique em uma celula..."
 *   - primaryCTA: "Ativar Perfil A" -> setActiveProfile(?, 'A')
 *   - secondaryCTA: "Ver tour rapido" -> toast informativo (RF-02 default)
 *
 * NOTA: implementer pode optar por colocar o empty state dentro do WeekGrid
 * (mais natural) ou em GradePlanner como wrapper. Os tests aqui exercitam
 * o componente WeekGrid em isolamento. Se implementer mover a logica para
 * GradePlanner, ele cria um wrapper que segue a mesma interface visual e
 * adapta os tests minimamente.
 *
 * Lessons aplicadas:
 *   #2  data-testid estavel.
 *   #11 prop opcional sem default decorativo (componente NAO renderiza empty
 *       state quando ha torneios OU ha perfil ativo).
 *   #14 import estatico.
 *   #28 mock por path: se mockar EmptyState, o path tem que casar com o
 *       import do consumidor.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// react-beautiful-dnd precisa de DragDropContext envolvendo Droppable. Para
// testes isolados de WeekGrid, fazemos mock minimo dos componentes DnD.
vi.mock('react-beautiful-dnd', () => ({
  Draggable: ({ children }: any) =>
    children(
      { draggableProps: {}, dragHandleProps: {}, innerRef: () => {} },
      {},
    ),
}));

vi.mock('@/components/grade-planner/StrictModeDroppable', () => ({
  StrictModeDroppable: ({ children }: any) =>
    children(
      { droppableProps: {}, innerRef: () => {}, placeholder: null },
      {},
    ),
}));

// Import estatico (lesson #14/#26).
import { WeekGrid } from '@/components/grade-planner/WeekGrid';

function renderWeekGrid(overrides: any = {}) {
  const defaultProps = {
    plannedTournaments: [] as any[],
    viewMode: 'compact' as const,
    getActiveProfile: () => 'OFF' as const,
    setActiveProfile: vi.fn(),
    onClickTournament: vi.fn(),
    onClickEmptyCell: vi.fn(),
    onRemoveTournament: vi.fn(),
    gradeStartHour: 18,
    gradeEndHour: 23,
    onOpenSettings: vi.fn(),
    onShowDayDetails: vi.fn(),
  };
  return render(<WeekGrid {...defaultProps} {...overrides} />);
}

describe('RF-02 WeekGrid — empty state (grade-planner-empty)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza EmptyState quando plannedTournaments=[] e nenhum perfil ativo', () => {
    renderWeekGrid({
      plannedTournaments: [],
      getActiveProfile: () => 'OFF' as const,
    });
    const empty = screen.queryByTestId('empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty!.getAttribute('data-area')).toBe('grade-planner-empty');
  });

  it('exibe headline "Sua grade esta vazia"', () => {
    renderWeekGrid({
      plannedTournaments: [],
      getActiveProfile: () => 'OFF' as const,
    });
    expect(screen.getByText(/Sua grade esta vazia/i)).toBeInTheDocument();
  });

  it('expoe CTA primario "Ativar Perfil A"', () => {
    renderWeekGrid({
      plannedTournaments: [],
      getActiveProfile: () => 'OFF' as const,
    });
    const cta = screen.getByTestId('empty-state-cta');
    expect(cta.textContent).toMatch(/Ativar Perfil A/i);
  });

  it('expoe CTA secundario "Ver tour" (data-testid="empty-state-secondary-cta")', () => {
    renderWeekGrid({
      plannedTournaments: [],
      getActiveProfile: () => 'OFF' as const,
    });
    const secondary = screen.queryByTestId('empty-state-secondary-cta');
    expect(secondary).toBeInTheDocument();
    expect(secondary!.textContent).toMatch(/tour/i);
  });

  it('click "Ativar Perfil A" chama setActiveProfile(?, "A")', async () => {
    const setActiveProfile = vi.fn();
    renderWeekGrid({
      plannedTournaments: [],
      getActiveProfile: () => 'OFF' as const,
      setActiveProfile,
    });
    await userEvent.click(screen.getByTestId('empty-state-cta'));
    expect(setActiveProfile).toHaveBeenCalled();
    const callArgs = setActiveProfile.mock.calls[0];
    // segundo argumento e 'A'
    expect(callArgs[callArgs.length - 1]).toBe('A');
  });
});

describe('RF-02 WeekGrid — empty state NAO aparece (regras de negocio)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('NAO renderiza empty state quando ha torneios planejados (mesmo com perfil OFF)', () => {
    renderWeekGrid({
      plannedTournaments: [
        {
          id: 't1',
          dayOfWeek: 1,
          time: '20:00',
          name: 'Bounty Builder',
          buyIn: '11',
          site: 'PokerStars',
          profile: 'A',
        },
      ],
      getActiveProfile: () => 'OFF' as const,
    });
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });

  it('NAO renderiza empty state quando ha perfil ativo (mesmo sem torneios)', () => {
    renderWeekGrid({
      plannedTournaments: [],
      getActiveProfile: (day: number) => (day === 1 ? 'A' : 'OFF'),
    });
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });

  it('NAO renderiza empty state quando perfil B ativo em qualquer dia', () => {
    renderWeekGrid({
      plannedTournaments: [],
      getActiveProfile: (day: number) => (day === 3 ? 'B' : 'OFF'),
    });
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });
});

describe('RF-02 WeekGrid — empty state secondary CTA (tour)', () => {
  it('click "Ver tour" NAO chama setActiveProfile (so tour)', async () => {
    const setActiveProfile = vi.fn();
    renderWeekGrid({
      plannedTournaments: [],
      getActiveProfile: () => 'OFF' as const,
      setActiveProfile,
    });
    await userEvent.click(screen.getByTestId('empty-state-secondary-cta'));
    expect(setActiveProfile).not.toHaveBeenCalled();
  });
});
