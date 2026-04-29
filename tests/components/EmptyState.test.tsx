import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// =============================================================================
// Sprint F4 W1 — EmptyState (compartilhado, RF-22)
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (RF-22 + Parte E)
//
// Reusado em 3 contextos:
//   - DayDetailDrawer (dia OFF)
//   - PrimedopeWizard (0 buckets)
//   - PrimedopePanel (bankroll=0)
//
// Props:
//   - icon: ReactNode | string (lucide icon name)
//   - title: string (PT-BR)
//   - description?: string
//   - action?: { label: string, onClick: () => void }
//
// data-testid:
//   - empty-state
//   - empty-state-icon
//   - empty-state-title
//   - empty-state-description
//   - empty-state-cta
// =============================================================================

import { EmptyState } from '../../client/src/components/empty-state';

beforeEach(() => {
  cleanup();
});

describe('<EmptyState>', () => {
  it('renderiza icone, titulo e descricao', () => {
    render(
      <EmptyState
        icon="CalendarOff"
        title="Nenhum torneio planejado neste dia."
        description="Adicione torneios pela WeekGrid."
      />
    );

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-icon')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-title')).toBeInTheDocument();
    expect(screen.getByText(/Nenhum torneio planejado/)).toBeInTheDocument();
    expect(screen.getByText(/Adicione torneios pela WeekGrid/)).toBeInTheDocument();
  });

  it('CTA opcional renderiza quando action passado e dispara onClick', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <EmptyState
        icon="Plus"
        title="Sem torneios."
        action={{ label: 'Adicionar torneios', onClick }}
      />
    );

    expect(screen.getByTestId('empty-state-cta')).toBeInTheDocument();
    expect(screen.getByText(/Adicionar torneios/)).toBeInTheDocument();
    await user.click(screen.getByTestId('empty-state-cta'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('sem action prop -> NAO renderiza CTA', () => {
    render(<EmptyState icon="X" title="Vazio." />);
    expect(screen.queryByTestId('empty-state-cta')).not.toBeInTheDocument();
  });

  it('sem description prop -> nao renderiza description elemento', () => {
    render(<EmptyState icon="X" title="So titulo." />);
    expect(screen.queryByTestId('empty-state-description')).not.toBeInTheDocument();
  });
});
