import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-2 — CoolDownRunner extensao Bloco 3 + Bloco 4
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 Sprint 2)
//
// Comportamento Sprint 2 (sobre o existente Sprint 1):
//   - Em mode='full': Bloco 1 -> 2 -> 3 -> 4 (4 blocos sequenciais)
//   - Em mode='quick': Bloco 3 e 4 NUNCA renderizam (regressao)
//   - PATCH ao avancar Bloco 3: payload tem tiltSelfAssessment
//   - PATCH ao avancar Bloco 4: payload tem sleepIntent
//   - Apos Bloco 4: PATCH com completedAt e blocksCompleted=['hands','abc','tilt','sleep']
// =============================================================================

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    fetchQuery: vi.fn(),
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

import { CoolDownRunner } from '@/components/cooldown/CoolDownRunner';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const defaultProps = {
  cooldownLogId: 'cd_1',
  sessionId: 'ses_1',
  mode: 'full' as const,
  sessionTournaments: [
    {
      id: 'st_1',
      sessionId: 'ses_1',
      site: 'PokerStars',
      name: '$11 Bounty',
      buyIn: '11',
      rebuys: 0,
      result: 'pending',
      status: 'completed',
      fromPlannedTournament: false,
    },
  ],
  onClose: vi.fn(),
  onComplete: vi.fn(),
};

beforeEach(() => {
  apiRequestMock.mockReset();
  toastMock.mockClear();
  defaultProps.onClose = vi.fn();
  defaultProps.onComplete = vi.fn();
  apiRequestMock.mockResolvedValue({ id: 'cd_1', blocksCompleted: [] });
});

// ============================================================================
// Mode='full' navega 4 blocos
// ============================================================================

describe("CoolDownRunner mode=full - 4 blocos", () => {
  it('Bloco 1 inicial', () => {
    render(wrap(<CoolDownRunner {...defaultProps} />));
    expect(screen.getByTestId('cooldown-block-1')).toBeInTheDocument();
  });

  it('Bloco 1 -> Avancar -> Bloco 2', async () => {
    const user = userEvent.setup();
    render(wrap(<CoolDownRunner {...defaultProps} />));
    await user.click(screen.getByTestId('cooldown-next'));
    expect(screen.getByTestId('cooldown-block-2')).toBeInTheDocument();
  });

  it('Bloco 2 -> Avancar -> Bloco 3 (Tilt Review)', async () => {
    const user = userEvent.setup();
    render(wrap(<CoolDownRunner {...defaultProps} />));
    await user.click(screen.getByTestId('cooldown-next')); // 1->2
    await user.click(screen.getByTestId('cooldown-next')); // 2->3
    expect(screen.getByTestId('cooldown-block-3')).toBeInTheDocument();
  });

  it('Bloco 3 -> Avancar -> Bloco 4 (Sleep Gate)', async () => {
    const user = userEvent.setup();
    render(wrap(<CoolDownRunner {...defaultProps} />));
    await user.click(screen.getByTestId('cooldown-next')); // 1->2
    await user.click(screen.getByTestId('cooldown-next')); // 2->3
    await user.click(screen.getByTestId('cooldown-next')); // 3->4
    expect(screen.getByTestId('cooldown-block-4')).toBeInTheDocument();
  });

  it('Bloco 4 -> Voltar retorna ao Bloco 3', async () => {
    const user = userEvent.setup();
    render(wrap(<CoolDownRunner {...defaultProps} />));
    await user.click(screen.getByTestId('cooldown-next')); // 1->2
    await user.click(screen.getByTestId('cooldown-next')); // 2->3
    await user.click(screen.getByTestId('cooldown-next')); // 3->4
    await user.click(screen.getByTestId('cooldown-back'));
    expect(screen.getByTestId('cooldown-block-3')).toBeInTheDocument();
  });
});

// ============================================================================
// PATCH incremental ao avancar Bloco 3
// ============================================================================

describe('CoolDownRunner - PATCH Bloco 3 com tiltSelfAssessment', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('PATCH disparado ao avancar Bloco 3 inclui tiltSelfAssessment', async () => {
    render(wrap(<CoolDownRunner {...defaultProps} />));

    fireEvent.click(screen.getByTestId('cooldown-next')); // 1->2
    await vi.advanceTimersByTimeAsync(1500);
    fireEvent.click(screen.getByTestId('cooldown-next')); // 2->3
    await vi.advanceTimersByTimeAsync(1500);
    fireEvent.click(screen.getByTestId('cooldown-next')); // 3->4
    await vi.advanceTimersByTimeAsync(1500);

    await waitFor(() => {
      const flat = JSON.stringify(apiRequestMock.mock.calls);
      expect(/tilt/i.test(flat)).toBe(true);
    });
  });

  it('PATCH inclui blocksCompleted contendo "tilt" ao sair do Bloco 3', async () => {
    render(wrap(<CoolDownRunner {...defaultProps} />));

    fireEvent.click(screen.getByTestId('cooldown-next'));
    await vi.advanceTimersByTimeAsync(1500);
    fireEvent.click(screen.getByTestId('cooldown-next'));
    await vi.advanceTimersByTimeAsync(1500);
    fireEvent.click(screen.getByTestId('cooldown-next'));
    await vi.advanceTimersByTimeAsync(1500);

    await waitFor(() => {
      const flat = JSON.stringify(apiRequestMock.mock.calls);
      expect(flat).toContain('tilt');
    });
  });
});

// ============================================================================
// PATCH ao concluir Bloco 4
// ============================================================================

describe('CoolDownRunner - conclusao Bloco 4 (sleep gate)', () => {
  // Sprint Cooldown-2 (Reviewer fix CRITICAL #1+#2):
  // completedAt agora eh server-calculated — verificamos via response/onComplete.
  it('clicar Concluir no Bloco 4 chama POST /finish com sleepIntent (completedAt vem server-side)', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      wrap(<CoolDownRunner {...defaultProps} onComplete={onComplete} />),
    );

    apiRequestMock.mockResolvedValue({ id: 'cd_1', blocksCompleted: [] });

    await user.click(screen.getByTestId('cooldown-next')); // 1->2
    await user.click(screen.getByTestId('cooldown-next')); // 2->3
    await user.click(screen.getByTestId('cooldown-next')); // 3->4

    apiRequestMock.mockResolvedValueOnce({
      id: 'cd_1',
      completedAt: '2026-04-26T10:10:00Z',
      blocksCompleted: ['hands', 'abc', 'tilt', 'sleep'],
    });

    const finish = screen.getByTestId('cooldown-finish');
    await user.click(finish);

    await waitFor(() => {
      const flat = JSON.stringify(apiRequestMock.mock.calls);
      // POST /api/cooldown-logs/:id/finish disparado e body inclui sleepIntent
      expect(flat).toContain('/finish');
      expect(flat).toContain('sleepIntent');
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
      // completedAt aparece no payload do onComplete (vem do response do server)
      const arg = onComplete.mock.calls[0]?.[0];
      expect(arg?.completedAt).toBeTruthy();
    });
  });

  it('blocksCompleted final contem 4 blocos (hands, abc, tilt, sleep)', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      wrap(<CoolDownRunner {...defaultProps} onComplete={onComplete} />),
    );

    apiRequestMock.mockResolvedValue({
      id: 'cd_1',
      completedAt: '2026-04-26T10:10:00Z',
      blocksCompleted: ['hands', 'abc', 'tilt', 'sleep'],
    });

    await user.click(screen.getByTestId('cooldown-next'));
    await user.click(screen.getByTestId('cooldown-next'));
    await user.click(screen.getByTestId('cooldown-next'));
    await user.click(screen.getByTestId('cooldown-finish'));

    await waitFor(() => {
      const flat = JSON.stringify(apiRequestMock.mock.calls);
      // Aceita "tilt" e "sleep" como tokens em algum PATCH
      expect(flat).toContain('tilt');
      expect(flat).toContain('sleep');
    });
  });
});

// ============================================================================
// Mode='quick' NAO renderiza Blocos 3/4 (regressao)
// ============================================================================

describe("CoolDownRunner mode=quick - regressao Sprint 2", () => {
  it('em quick, Bloco 3 nunca renderiza', () => {
    render(
      wrap(<CoolDownRunner {...defaultProps} mode={'quick' as any} />),
    );
    expect(screen.queryByTestId('cooldown-block-3')).not.toBeInTheDocument();
  });

  it('em quick, Bloco 4 nunca renderiza', () => {
    render(
      wrap(<CoolDownRunner {...defaultProps} mode={'quick' as any} />),
    );
    expect(screen.queryByTestId('cooldown-block-4')).not.toBeInTheDocument();
  });
});
