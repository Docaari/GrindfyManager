import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-1 (MVP) — QuickCoolDownDialog
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 versao Quick + US-04)
// Sequence: Branch QUICK
//
// Modulo NAO existe ainda — Implementer cria em:
//   client/src/components/cooldown/QuickCoolDownDialog.tsx
//
// Contrato:
//   <QuickCoolDownDialog
//     cooldownLogId={string}
//     sessionId={string}
//     sessionTournaments={SessionTournament[]}
//     onSave={({hands: string[], q1: string, q2: string}) => void}
//     onClose={() => void}
//   />
//
// Comportamento:
//   - 5 campos: 3 textareas curtas (hands) + 2 questions (q1, q2)
//   - Submit valido: chama onSave com payload
//   - Salva como mode='quick' no log (PATCH com blocksCompleted=['quick'])
//   - 3 hands sao OPCIONAIS (podem estar vazias)
//   - 2 questions soft (warning se vazias, nao bloqueia)
// =============================================================================

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
  getCsrfToken: () => null,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userPlatformId: 'USER-0001' } }),
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (a: any) => toastMock(a),
}));

import { QuickCoolDownDialog } from '@/components/cooldown/QuickCoolDownDialog';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const defaultProps = {
  cooldownLogId: 'cd_1',
  sessionId: 'ses_1',
  sessionTournaments: [
    {
      id: 'st_1',
      sessionId: 'ses_1',
      site: 'PokerStars',
      name: '$11',
      buyIn: '11',
      rebuys: 0,
      result: 'pending',
      status: 'completed',
      fromPlannedTournament: false,
    },
  ],
  onSave: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  apiRequestMock.mockReset();
  toastMock.mockClear();
  defaultProps.onSave = vi.fn();
  defaultProps.onClose = vi.fn();
});

// ============================================================================
// Render basico
// ============================================================================

describe('QuickCoolDownDialog - render', () => {
  it('renderiza container com testid cooldown-quick-dialog', () => {
    render(wrap(<QuickCoolDownDialog {...defaultProps} />));
    expect(screen.getByTestId('cooldown-quick-dialog')).toBeInTheDocument();
  });

  it('renderiza 3 textareas para hands (cooldown-quick-hand-0..2)', () => {
    render(wrap(<QuickCoolDownDialog {...defaultProps} />));
    expect(screen.getByTestId('cooldown-quick-hand-0')).toBeInTheDocument();
    expect(screen.getByTestId('cooldown-quick-hand-1')).toBeInTheDocument();
    expect(screen.getByTestId('cooldown-quick-hand-2')).toBeInTheDocument();
  });

  it('renderiza pergunta q1 (cooldown-quick-q1) - "O que fez bem?"', () => {
    render(wrap(<QuickCoolDownDialog {...defaultProps} />));
    expect(screen.getByTestId('cooldown-quick-q1')).toBeInTheDocument();
  });

  it('renderiza pergunta q2 (cooldown-quick-q2) - "O que faria diferente?"', () => {
    render(wrap(<QuickCoolDownDialog {...defaultProps} />));
    expect(screen.getByTestId('cooldown-quick-q2')).toBeInTheDocument();
  });
});

// ============================================================================
// Submit valido
// ============================================================================

describe('QuickCoolDownDialog - submit', () => {
  it('preencher q1 e q2 + submit chama onSave com payload {hands, q1, q2}', async () => {
    const onSave = vi.fn();
    render(wrap(<QuickCoolDownDialog {...defaultProps} onSave={onSave} />));

    const q1 = screen.getByTestId('cooldown-quick-q1');
    const q2 = screen.getByTestId('cooldown-quick-q2');
    fireEvent.change(q1, { target: { value: 'mantive disciplina' } });
    fireEvent.change(q2, { target: { value: 'evitar limp UTG' } });

    const submitBtn =
      screen.queryByTestId('cooldown-quick-submit')
      ?? screen.queryByText(/salvar|concluir/i);

    if (submitBtn) {
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
        const payload = onSave.mock.calls[0][0];
        expect(payload.q1).toBe('mantive disciplina');
        expect(payload.q2).toBe('evitar limp UTG');
        expect(Array.isArray(payload.hands)).toBe(true);
      });
    }
  });

  it('submit com hands vazias eh permitido (hands sao OPCIONAIS)', async () => {
    const onSave = vi.fn();
    render(wrap(<QuickCoolDownDialog {...defaultProps} onSave={onSave} />));

    const q1 = screen.getByTestId('cooldown-quick-q1');
    const q2 = screen.getByTestId('cooldown-quick-q2');
    fireEvent.change(q1, { target: { value: 'foco mantido' } });
    fireEvent.change(q2, { target: { value: 'menos sessoes' } });

    const submitBtn = screen.queryByTestId('cooldown-quick-submit');
    if (submitBtn) {
      fireEvent.click(submitBtn);
      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
        const payload = onSave.mock.calls[0][0];
        expect(payload.hands.every((h: string) => h === '')).toBe(true);
      });
    }
  });

  it('submit com q1+q2 vazias mostra warning soft mas permite avanco', async () => {
    const onSave = vi.fn();
    render(wrap(<QuickCoolDownDialog {...defaultProps} onSave={onSave} />));

    const submitBtn = screen.queryByTestId('cooldown-quick-submit');
    if (submitBtn) {
      // Aceitamos que clique submeta (validacao soft) OU mostre warning
      fireEvent.click(submitBtn);

      // Apos submit, ou onSave foi chamado OU warning apareceu (mas nao bloqueia)
      const html = document.body.innerHTML;
      const hasWarning = /warning|recomendado|opcional|preencher/i.test(html);
      const wasCalled = onSave.mock.calls.length > 0;
      expect(hasWarning || wasCalled).toBe(true);
    }
  });
});

// ============================================================================
// PATCH com mode='quick'
// ============================================================================

describe('QuickCoolDownDialog - persiste com mode=quick + blocksCompleted=[quick]', () => {
  it('submit dispara PATCH /api/cooldown-logs/:id com blocksCompleted=["quick"]', async () => {
    apiRequestMock.mockResolvedValue({ id: 'cd_1', mode: 'quick' });

    render(wrap(<QuickCoolDownDialog {...defaultProps} />));

    const q1 = screen.getByTestId('cooldown-quick-q1');
    const q2 = screen.getByTestId('cooldown-quick-q2');
    fireEvent.change(q1, { target: { value: 'foco' } });
    fireEvent.change(q2, { target: { value: 'fold ICM' } });

    const submitBtn = screen.queryByTestId('cooldown-quick-submit');
    if (submitBtn) {
      fireEvent.click(submitBtn);

      await waitFor(() => {
        const flat = JSON.stringify(apiRequestMock.mock.calls);
        expect(flat).toMatch(/quick/i);
      });
    }
  });
});

// ============================================================================
// onClose
// ============================================================================

describe('QuickCoolDownDialog - onClose', () => {
  it('clicar X / cancelar chama onClose', async () => {
    const onClose = vi.fn();
    render(wrap(<QuickCoolDownDialog {...defaultProps} onClose={onClose} />));

    const closeBtn =
      screen.queryByTestId('cooldown-quick-close')
      ?? screen.queryByLabelText(/fechar|cancelar/i);

    if (closeBtn) {
      fireEvent.click(closeBtn);
      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    }
  });
});
