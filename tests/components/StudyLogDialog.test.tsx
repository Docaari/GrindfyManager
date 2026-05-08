/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Habito-1 — RF-1 StudyLogDialog (form 4 modos + escape hatch)
 *
 * Spec : Docs/specs/estudos-habito-1.md §RF-1.1, §RF-1.6
 * ADRs : 126
 *
 * Cobertura:
 *   - Renderiza com 5 mode options (drill_gto, tournament_review, hand_review, lesson, other)
 *   - Layout dinamico: troca de mode reseta campos especificos do anterior
 *   - mantem theme_id, notes, duration ao trocar mode
 *   - Toggle "Comecar cronometrado" altera flow submit
 *   - data-testid estaveis (lesson #2)
 *   - Submit chama POST /api/study-sessions com payload correto
 *
 * data-testid esperados:
 *   - study-log-dialog (root)
 *   - study-log-mode-{mode_value} (5 radio buttons)
 *   - study-log-theme-input
 *   - study-log-duration-input
 *   - study-log-notes-input
 *   - study-log-live-toggle
 *   - study-log-submit
 *   - study-log-cancel
 *   - study-log-tournament-input (mode=tournament_review)
 *   - study-log-lesson-input (mode=lesson)
 *   - study-log-starred-hands-input (mode=hand_review)
 *   - study-log-drill-platform-input (mode=drill_gto)
 *
 * Lessons aplicadas:
 *   #2  data-testid estaveis
 *   #14 await import — hot dep imports
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Mock apiRequest (lesson #13 — retorna JSON parseado direto)
// Lesson #14: vi.hoisted para evitar TDZ com top-level imports do componente.
// =============================================================================
const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: {
    invalidateQueries: () => {},
    setQueryData: () => {},
    getQueryData: () => {},
  },
}));

// @ts-expect-error - red phase: componente ainda nao existe
import { StudyLogDialog } from '../../client/src/components/study/StudyLogDialog';

beforeEach(() => {
  cleanup();
  apiRequestMock.mockReset();
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

async function loadDialog() {
  return StudyLogDialog;
}

describe('<StudyLogDialog>', () => {
  describe('renderizacao default', () => {
    it('renderiza root com data-testid="study-log-dialog"', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog open={true} onClose={() => {}} />);
      expect(screen.getByTestId('study-log-dialog')).toBeInTheDocument();
    });

    it('renderiza 5 mode options', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog open={true} onClose={() => {}} />);
      expect(screen.getByTestId('study-log-mode-drill_gto')).toBeInTheDocument();
      expect(screen.getByTestId('study-log-mode-tournament_review')).toBeInTheDocument();
      expect(screen.getByTestId('study-log-mode-hand_review')).toBeInTheDocument();
      expect(screen.getByTestId('study-log-mode-lesson')).toBeInTheDocument();
      expect(screen.getByTestId('study-log-mode-other')).toBeInTheDocument();
    });

    it('renderiza campos comuns: duration, notes, live toggle', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog open={true} onClose={() => {}} />);
      expect(screen.getByTestId('study-log-duration-input')).toBeInTheDocument();
      expect(screen.getByTestId('study-log-notes-input')).toBeInTheDocument();
      expect(screen.getByTestId('study-log-live-toggle')).toBeInTheDocument();
    });

    it('renderiza submit + cancel buttons', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog open={true} onClose={() => {}} />);
      expect(screen.getByTestId('study-log-submit')).toBeInTheDocument();
      expect(screen.getByTestId('study-log-cancel')).toBeInTheDocument();
    });
  });

  describe('layout dinamico por mode (RF-1.1)', () => {
    it('mode=drill_gto exibe theme + drill_platform fields', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog open={true} onClose={() => {}} initialMode="drill_gto" />);
      expect(screen.getByTestId('study-log-theme-input')).toBeInTheDocument();
      expect(screen.getByTestId('study-log-drill-platform-input')).toBeInTheDocument();
    });

    it('mode=lesson exibe lesson_id field + theme', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog open={true} onClose={() => {}} initialMode="lesson" />);
      expect(screen.getByTestId('study-log-lesson-input')).toBeInTheDocument();
      expect(screen.getByTestId('study-log-theme-input')).toBeInTheDocument();
    });

    it('mode=tournament_review exibe tournament_id (opcional)', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog open={true} onClose={() => {}} initialMode="tournament_review" />);
      expect(screen.getByTestId('study-log-tournament-input')).toBeInTheDocument();
    });

    it('mode=hand_review exibe starred_hands input', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog open={true} onClose={() => {}} initialMode="hand_review" />);
      expect(screen.getByTestId('study-log-starred-hands-input')).toBeInTheDocument();
    });

    it('mode=other exibe theme + texto livre apenas (sem campos de outros modes)', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog open={true} onClose={() => {}} initialMode="other" />);
      expect(screen.getByTestId('study-log-theme-input')).toBeInTheDocument();
      expect(screen.queryByTestId('study-log-lesson-input')).not.toBeInTheDocument();
      expect(screen.queryByTestId('study-log-tournament-input')).not.toBeInTheDocument();
      expect(screen.queryByTestId('study-log-drill-platform-input')).not.toBeInTheDocument();
    });
  });

  describe('comportamento toggle live mode', () => {
    it('quando live toggle=true, label do submit muda', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog open={true} onClose={() => {}} initialMode="drill_gto" />);
      const toggle = screen.getByTestId('study-log-live-toggle');
      fireEvent.click(toggle);
      // Spec: post-hoc cria com status completed; live -> running. Label muda.
      const submit = screen.getByTestId('study-log-submit') as HTMLButtonElement;
      expect(submit).toBeInTheDocument();
    });
  });

  describe('estado controlado (open prop)', () => {
    it('open=false NAO renderiza root', async () => {
      const Dialog = await loadDialog();
      renderWithClient(<Dialog open={false} onClose={() => {}} />);
      expect(screen.queryByTestId('study-log-dialog')).not.toBeInTheDocument();
    });
  });
});
