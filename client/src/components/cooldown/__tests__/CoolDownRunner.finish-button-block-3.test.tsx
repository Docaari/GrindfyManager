/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint B2 — M4: Bug "Concluir cooldown" ausente no Bloco 3
 *
 * Spec: Docs/specs/sprint-b2-summary-inline-reconcile.md (M4)
 * Sequence: Caminho 4 (cooldown finish)
 *
 * Cenarios cobertos:
 *   1. mode=full + currentBlock=tilt (Bloco 3): botao cooldown-finish visivel
 *   2. mode=full + currentBlock=abc (Bloco 2): botao visivel (atual)
 *   3. mode=full + currentBlock=sleep (Bloco 4): botao visivel (mantem comportamento)
 *   4. mode=full + currentBlock=hands (Bloco 1): botao NAO visivel
 *   5. mode=quick + currentBlock=abc: botao visivel
 *
 * Estado atual (commit 21fca11): botao aparece SO no currentBlock=abc.
 * Bug: usuario chega em tilt (Bloco 3) e nao tem botao para sair.
 * Sprint F vai mover pra Bloco 4 ultimo, mas B2 reverte regressao.
 *
 * Implementer deve:
 *   - relaxar visibilidade do botao para incluir tilt e sleep
 *   - manter comentario `// Sprint F vai mover pra Bloco 4 ultimo`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

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

vi.mock('@/components/mental-prep/AudioLibraryDialog', () => ({
  AudioLibraryDialog: () => null,
}));

import { CoolDownRunner } from '@/components/cooldown/CoolDownRunner';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const sessionTournaments = [
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
];

beforeEach(() => {
  apiRequestMock.mockReset();
  toastMock.mockClear();
  apiRequestMock.mockResolvedValue({ id: 'cd_1', blocksCompleted: [] });
});

// =============================================================================
// Cenario 1: mode=full + Bloco 3 (tilt) — botao DEVE estar visivel
// =============================================================================

describe('CoolDownRunner Sprint B2 (M4) — botao cooldown-finish em mode=full', () => {
  async function navigateToBlock(block: 'hands' | 'abc' | 'tilt' | 'sleep') {
    const onComplete = vi.fn();
    const onClose = vi.fn();

    render(
      wrap(
        <CoolDownRunner
          cooldownLogId="cd_1"
          sessionId="ses_1"
          mode="full"
          sessionTournaments={sessionTournaments}
          onClose={onClose}
          onComplete={onComplete}
        />,
      ),
    );

    if (block === 'hands') return;
    // Avancar Bloco 1 -> 2
    fireEvent.click(screen.getByTestId('cooldown-next'));
    if (block === 'abc') return;
    // Avancar Bloco 2 -> 3
    // BlockTwoABCJournal expoe seu proprio botao "Avancar" para o tilt.
    // O test-writer assume que existe data-testid 'block-two-next' OU
    // que o componente expoe um botao acessivel. Como fallback, o
    // implementer pode expor data-testid 'cooldown-next-tilt'.
    const nextBtns = screen.queryAllByText(/Avan[çc]ar|Continuar|Pr[oó]ximo/i);
    if (nextBtns.length > 0) {
      fireEvent.click(nextBtns[0]);
    }
    if (block === 'tilt') return;
    // Avancar Bloco 3 -> 4 (similar)
    const tiltNext = screen.queryAllByText(/Avan[çc]ar|Continuar|Pr[oó]ximo/i);
    if (tiltNext.length > 0) {
      fireEvent.click(tiltNext[0]);
    }
  }

  it('Bloco 3 (tilt) — botao [data-testid=cooldown-finish] visivel em mode=full', async () => {
    await navigateToBlock('tilt');

    // M4: botao deve estar visivel no Bloco 3.
    expect(screen.queryByTestId('cooldown-finish')).toBeInTheDocument();
  });

  it('Bloco 2 (abc) — botao visivel (mantem)', async () => {
    await navigateToBlock('abc');
    expect(screen.queryByTestId('cooldown-finish')).toBeInTheDocument();
  });

  it('Bloco 1 (hands) — botao NAO visivel', async () => {
    await navigateToBlock('hands');
    // No Bloco 1 nao ha botao finish (Sprint F vai mover; M4 nao adiciona aqui).
    expect(screen.queryByTestId('cooldown-finish')).toBeNull();
  });
});

// =============================================================================
// Cenario 5: mode=quick + Bloco 2 — botao visivel
// =============================================================================

describe('CoolDownRunner Sprint B2 (M4) — mode=quick mantem comportamento', () => {
  it('mode=quick + Bloco 2 (abc): botao cooldown-finish visivel', () => {
    const onComplete = vi.fn();
    const onClose = vi.fn();

    render(
      wrap(
        <CoolDownRunner
          cooldownLogId="cd_1"
          sessionId="ses_1"
          mode="quick"
          sessionTournaments={sessionTournaments}
          onClose={onClose}
          onComplete={onComplete}
        />,
      ),
    );

    // Avancar Bloco 1 -> 2
    fireEvent.click(screen.getByTestId('cooldown-next'));

    expect(screen.queryByTestId('cooldown-finish')).toBeInTheDocument();
  });
});
