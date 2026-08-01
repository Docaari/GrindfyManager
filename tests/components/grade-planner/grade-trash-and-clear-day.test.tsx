/**
 * Sprint grade-trash-clear-day.
 *
 * Cobre as duas adicoes na grade semanal:
 *   1. DragTrashZone — zona de descarte no rodape. Fica SEMPRE montada (o rbd
 *      mede os droppables no lift; um Droppable que nasce durante o drag nunca
 *      recebe o drop) e so acende quando ha drag em andamento.
 *   2. Botao "Limpar" no cabecalho do dia — aparece so quando o dia tem
 *      torneios no perfil ativo e delega a confirmacao pro GradePlanner.
 *
 * Lessons aplicadas: #2 (data-testid estavel), #14 (import estatico),
 * #11 (prop opcional nao ganha comportamento default).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Droppable minimo: repassa o estado de "isDraggingOver" que o teste pedir.
let droppableOver = false;
vi.mock('@/components/grade-planner/StrictModeDroppable', () => ({
  StrictModeDroppable: ({ children }: any) =>
    children(
      { droppableProps: {}, innerRef: () => {}, placeholder: null },
      { isDraggingOver: droppableOver },
    ),
}));

vi.mock('react-beautiful-dnd', () => ({
  Draggable: ({ children }: any) =>
    children(
      { draggableProps: {}, dragHandleProps: {}, innerRef: () => {} },
      {},
    ),
}));

import {
  DragTrashZone,
  GRADE_TRASH_DROPPABLE_ID,
} from '@/components/grade-planner/DragTrashZone';
import { WeekGrid } from '@/components/grade-planner/WeekGrid';

beforeEach(() => {
  droppableOver = false;
});

describe('DragTrashZone — zona de descarte', () => {
  it('fica montada mesmo sem drag (o rbd mede os droppables no lift)', () => {
    render(<DragTrashZone dragging={null} />);
    const zone = screen.getByTestId('grade-trash-zone');
    expect(zone).toBeInTheDocument();
    expect(zone.getAttribute('data-active')).toBe('false');
    // Invisivel e sem capturar clique enquanto nao ha drag.
    expect(zone.className).toContain('opacity-0');
    expect(zone.className).toContain('pointer-events-none');
  });

  it('acende quando ha torneio da grade sendo arrastado', () => {
    render(<DragTrashZone dragging="cell" />);
    const zone = screen.getByTestId('grade-trash-zone');
    expect(zone.getAttribute('data-active')).toBe('true');
    expect(zone.className).toContain('opacity-100');
    expect(screen.getByText(/tirar da grade/i)).toBeInTheDocument();
  });

  it('muda o texto quando a origem e a biblioteca', () => {
    render(<DragTrashZone dragging="library" />);
    expect(screen.getByText(/lixeira da biblioteca/i)).toBeInTheDocument();
  });

  it('anuncia o drop quando o item esta sobre a zona', () => {
    droppableOver = true;
    render(<DragTrashZone dragging="cell" />);
    const zone = screen.getByTestId('grade-trash-zone');
    expect(zone.getAttribute('data-over')).toBe('true');
    expect(screen.getByText(/solte para remover/i)).toBeInTheDocument();
  });

  it('expoe o id do droppable para o handler de drop', () => {
    expect(GRADE_TRASH_DROPPABLE_ID).toBe('grade-trash');
  });
});

function renderWeekGrid(overrides: any = {}) {
  const defaultProps = {
    plannedTournaments: [] as any[],
    viewMode: 'compact' as const,
    getActiveProfile: () => 'A' as const,
    setActiveProfile: vi.fn(),
    onClickTournament: vi.fn(),
    onClickEmptyCell: vi.fn(),
    onRemoveTournament: vi.fn(),
    gradeStartHour: 18,
    gradeEndHour: 23,
    onOpenSettings: vi.fn(),
    // onShowDayDetails omitido de proposito: DayHoverTooltip exige
    // QueryClientProvider e nao e o alvo deste teste.
  };
  return render(<WeekGrid {...defaultProps} {...overrides} />);
}

const tournamentOnMonday = {
  id: 'PT-1',
  dayOfWeek: 1,
  profile: 'A',
  site: 'PokerStars',
  name: 'Daily $22',
  buyIn: '22',
  time: '20:00',
  type: 'Vanilla',
  speed: 'Normal',
};

describe('WeekGrid — botao "Limpar" do dia', () => {
  it('nao renderiza quando o dia nao tem torneios', () => {
    renderWeekGrid({ onClearDay: vi.fn() });
    expect(screen.queryByTestId('week-grid-day-clear-1')).toBeNull();
  });

  it('renderiza no dia que tem torneios do perfil ativo', () => {
    renderWeekGrid({
      plannedTournaments: [tournamentOnMonday],
      onClearDay: vi.fn(),
    });
    expect(screen.getByTestId('week-grid-day-clear-1')).toBeInTheDocument();
    // Terca continua sem o botao.
    expect(screen.queryByTestId('week-grid-day-clear-2')).toBeNull();
  });

  it('nao renderiza quando onClearDay nao e passado (lesson #11)', () => {
    renderWeekGrid({ plannedTournaments: [tournamentOnMonday] });
    expect(screen.queryByTestId('week-grid-day-clear-1')).toBeNull();
  });

  it('dispara onClearDay com o dia clicado', async () => {
    const onClearDay = vi.fn();
    renderWeekGrid({ plannedTournaments: [tournamentOnMonday], onClearDay });
    await userEvent.click(screen.getByTestId('week-grid-day-clear-1'));
    expect(onClearDay).toHaveBeenCalledWith(1);
  });
});
