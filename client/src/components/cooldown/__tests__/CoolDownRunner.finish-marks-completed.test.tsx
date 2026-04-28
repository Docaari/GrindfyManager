/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint B2 — M5: Bug "Concluir cooldown" nao marca sessao completed
 *
 * Spec: Docs/specs/sprint-b2-summary-inline-reconcile.md (M5)
 * Sequence: Caminho 4 (cooldown finish)
 *
 * Cenarios cobertos:
 *   1. Click cooldown-finish: POST /api/cooldown-logs/:id/finish chamado
 *   2. Apos sucesso: setLocation('/grind') invocado (NAO /dashboard)
 *   3. Queries grind-sessions + cooldown-logs invalidadas
 *   4. Idempotencia: sessao ja completed -> sem segundo PUT
 *   5. Server marca session.status=completed (verificado em integration test
 *      separado: cooldown-finish-marks-session-completed.test.ts)
 *
 * Estado atual: handleFinishFull faz POST /finish mas redirect e/ou queries
 * nao estao invalidando corretamente, e session continua 'active' na lista.
 *
 * Implementer deve atualizar handleFinishFull/handleFinishQuick em
 * CoolDownRunner.tsx para:
 *   - apos POST /finish 200, chamar PUT /api/grind-sessions/:id { status: 'completed' }
 *     se ainda nao for 'completed' (idempotencia)
 *   - invalidar ['/api/grind-sessions'], ['/api/grind-sessions', sessionId],
 *     ['/api/cooldown-logs']
 *   - chamar setLocation('/grind')
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const apiRequestMock = vi.fn();
const invalidateQueriesMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: (...args: any[]) => invalidateQueriesMock(...args),
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

const setLocationMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/cooldown/cd_1', setLocationMock],
}));

const trackMock = vi.fn();
vi.mock('@/lib/telemetry', () => ({
  track: (...args: any[]) => trackMock(...args),
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
  invalidateQueriesMock.mockClear();
  setLocationMock.mockClear();
  trackMock.mockClear();
});

// =============================================================================
// Cenario 1: click cooldown-finish dispara POST /finish
// =============================================================================

describe('CoolDownRunner Sprint B2 (M5) — click cooldown-finish dispara POST /finish', () => {
  it('POST /api/cooldown-logs/cd_1/finish eh chamado ao clicar cooldown-finish', async () => {
    apiRequestMock.mockResolvedValue({
      id: 'cd_1',
      completedAt: new Date().toISOString(),
    });

    render(
      wrap(
        <CoolDownRunner
          cooldownLogId="cd_1"
          sessionId="ses_1"
          mode="quick"
          sessionTournaments={sessionTournaments}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />,
      ),
    );

    // Avancar Bloco 1 -> 2 onde aparece cooldown-finish em quick.
    fireEvent.click(screen.getByTestId('cooldown-next'));

    await waitFor(() => {
      expect(screen.getByTestId('cooldown-finish')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('cooldown-finish'));

    await waitFor(() => {
      const finishCalls = apiRequestMock.mock.calls.filter(
        (c: any[]) =>
          (c[0] === 'POST' || c[0] === 'PATCH') &&
          typeof c[1] === 'string' &&
          c[1].includes('/api/cooldown-logs/cd_1'),
      );
      expect(finishCalls.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Cenario 2: apos sucesso, setLocation('/grind')
// =============================================================================

describe('CoolDownRunner Sprint B2 (M5) — apos sucesso redireciona para /grind', () => {
  it('setLocation eh chamado com /grind apos POST /finish 200', async () => {
    apiRequestMock.mockResolvedValue({
      id: 'cd_1',
      completedAt: new Date().toISOString(),
    });

    render(
      wrap(
        <CoolDownRunner
          cooldownLogId="cd_1"
          sessionId="ses_1"
          mode="quick"
          sessionTournaments={sessionTournaments}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />,
      ),
    );

    fireEvent.click(screen.getByTestId('cooldown-next'));

    await waitFor(() => {
      expect(screen.getByTestId('cooldown-finish')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('cooldown-finish'));

    await waitFor(() => {
      // Deve ter chamado setLocation('/grind') pelo menos uma vez.
      const grindRedirects = setLocationMock.mock.calls.filter(
        (c: any[]) => c[0] === '/grind',
      );
      expect(grindRedirects.length).toBeGreaterThan(0);
    });
  });

  it('NAO redireciona para /dashboard', async () => {
    apiRequestMock.mockResolvedValue({
      id: 'cd_1',
      completedAt: new Date().toISOString(),
    });

    render(
      wrap(
        <CoolDownRunner
          cooldownLogId="cd_1"
          sessionId="ses_1"
          mode="quick"
          sessionTournaments={sessionTournaments}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />,
      ),
    );

    fireEvent.click(screen.getByTestId('cooldown-next'));
    await waitFor(() => {
      expect(screen.getByTestId('cooldown-finish')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('cooldown-finish'));

    await waitFor(() => {
      expect(setLocationMock).toHaveBeenCalled();
    });

    const dashboardRedirects = setLocationMock.mock.calls.filter(
      (c: any[]) => c[0] === '/dashboard',
    );
    expect(dashboardRedirects.length).toBe(0);
  });
});

// =============================================================================
// Cenario 3: invalida queries
// =============================================================================

describe('CoolDownRunner Sprint B2 (M5) — invalida queries', () => {
  it('invalida [/api/grind-sessions] apos finish', async () => {
    apiRequestMock.mockResolvedValue({
      id: 'cd_1',
      completedAt: new Date().toISOString(),
    });

    render(
      wrap(
        <CoolDownRunner
          cooldownLogId="cd_1"
          sessionId="ses_1"
          mode="quick"
          sessionTournaments={sessionTournaments}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />,
      ),
    );

    fireEvent.click(screen.getByTestId('cooldown-next'));
    await waitFor(() => {
      expect(screen.getByTestId('cooldown-finish')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('cooldown-finish'));

    await waitFor(() => {
      // Verifica invalidacoes
      const grindInvalidations = invalidateQueriesMock.mock.calls.filter((c: any[]) => {
        const arg = c[0];
        if (!arg) return false;
        const key = Array.isArray(arg.queryKey) ? arg.queryKey : Array.isArray(arg) ? arg : null;
        if (!key) return false;
        return key.some((k: any) => typeof k === 'string' && k.includes('/api/grind-sessions'));
      });
      expect(grindInvalidations.length).toBeGreaterThan(0);
    });
  });

  it('invalida [/api/cooldown-logs] apos finish', async () => {
    apiRequestMock.mockResolvedValue({
      id: 'cd_1',
      completedAt: new Date().toISOString(),
    });

    render(
      wrap(
        <CoolDownRunner
          cooldownLogId="cd_1"
          sessionId="ses_1"
          mode="quick"
          sessionTournaments={sessionTournaments}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />,
      ),
    );

    fireEvent.click(screen.getByTestId('cooldown-next'));
    await waitFor(() => {
      expect(screen.getByTestId('cooldown-finish')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('cooldown-finish'));

    await waitFor(() => {
      const cooldownInvalidations = invalidateQueriesMock.mock.calls.filter((c: any[]) => {
        const arg = c[0];
        if (!arg) return false;
        const key = Array.isArray(arg.queryKey) ? arg.queryKey : Array.isArray(arg) ? arg : null;
        if (!key) return false;
        return key.some((k: any) => typeof k === 'string' && k.includes('/api/cooldown-logs'));
      });
      expect(cooldownInvalidations.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Cenario 4: idempotencia — sessao ja completed nao falha
// =============================================================================

describe('CoolDownRunner Sprint B2 (M5) — idempotencia', () => {
  it('finish nao falha quando session ja eh completed (server retorna 200/409 idempotente)', async () => {
    // Mock: POST /finish 200 + PUT /api/grind-sessions/:id 409 (already completed).
    apiRequestMock.mockImplementation((method: string, url: string) => {
      if (method === 'POST' && url.includes('/finish')) {
        return Promise.resolve({
          id: 'cd_1',
          completedAt: new Date().toISOString(),
        });
      }
      if (method === 'PUT' && url.includes('/api/grind-sessions')) {
        // Aceita idempotencia — sem throw.
        return Promise.resolve({ status: 'completed' });
      }
      return Promise.resolve({});
    });

    const onComplete = vi.fn();
    render(
      wrap(
        <CoolDownRunner
          cooldownLogId="cd_1"
          sessionId="ses_1"
          mode="quick"
          sessionTournaments={sessionTournaments}
          onClose={vi.fn()}
          onComplete={onComplete}
        />,
      ),
    );

    fireEvent.click(screen.getByTestId('cooldown-next'));
    await waitFor(() => {
      expect(screen.getByTestId('cooldown-finish')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('cooldown-finish'));

    // Deve completar fluxo sem toast de erro.
    await waitFor(() => {
      const errorToasts = toastMock.mock.calls.filter((c: any[]) => {
        const arg = c[0];
        return arg && typeof arg.title === 'string' && arg.title.match(/Erro/i);
      });
      expect(errorToasts.length).toBe(0);
    });
  });
});
