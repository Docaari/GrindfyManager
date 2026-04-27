import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-2 — End-of-flow integration smoke
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 + RF-09)
//
// Smoke teste percorre o fluxo completo em mode='full':
//   Bloco 1 (1 star) -> Bloco 2 (4 textareas) -> Bloco 3 (3 sliders + 1 trigger)
//   -> Bloco 4 (sim, plano fechado)
//
// Verifica:
//   - Todos os PATCHes disparados na sequencia
//   - onComplete recebe payload com blocksCompleted=['hands','abc','tilt','sleep']
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

// ============================================================================
// Full flow Bloco 1->2->3->4
// ============================================================================

describe('CoolDownRunner - full flow mode=full (smoke)', () => {
  it('Bloco 1 -> 2 -> 3 -> 4 -> finish dispara PATCHes em sequencia', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const onClose = vi.fn();

    apiRequestMock.mockResolvedValue({ id: 'cd_1', blocksCompleted: [] });

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

    // Bloco 1
    expect(screen.getByTestId('cooldown-block-1')).toBeInTheDocument();
    await user.click(screen.getByTestId('cooldown-next'));

    // Bloco 2
    expect(screen.getByTestId('cooldown-block-2')).toBeInTheDocument();
    await user.click(screen.getByTestId('cooldown-next'));

    // Bloco 3
    expect(screen.getByTestId('cooldown-block-3')).toBeInTheDocument();
    await user.click(screen.getByTestId('cooldown-next'));

    // Bloco 4
    expect(screen.getByTestId('cooldown-block-4')).toBeInTheDocument();

    // Conclui
    apiRequestMock.mockResolvedValueOnce({
      id: 'cd_1',
      completedAt: '2026-04-26T10:10:00Z',
      blocksCompleted: ['hands', 'abc', 'tilt', 'sleep'],
    });
    await user.click(screen.getByTestId('cooldown-finish'));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it('PATCH count >= 3 (entre transicoes 1->2, 2->3, 3->4)', async () => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValue({ id: 'cd_1', blocksCompleted: [] });

    render(
      wrap(
        <CoolDownRunner
          cooldownLogId="cd_1"
          sessionId="ses_1"
          mode="full"
          sessionTournaments={sessionTournaments}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />,
      ),
    );

    await user.click(screen.getByTestId('cooldown-next'));
    await user.click(screen.getByTestId('cooldown-next'));
    await user.click(screen.getByTestId('cooldown-next'));

    await waitFor(() => {
      const patches = apiRequestMock.mock.calls.filter((args) =>
        /PATCH/i.test(JSON.stringify(args)),
      );
      expect(patches.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('onComplete recebe blocksCompleted=["hands","abc","tilt","sleep"]', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    apiRequestMock.mockResolvedValue({ id: 'cd_1', blocksCompleted: [] });

    render(
      wrap(
        <CoolDownRunner
          cooldownLogId="cd_1"
          sessionId="ses_1"
          mode="full"
          sessionTournaments={sessionTournaments}
          onClose={vi.fn()}
          onComplete={onComplete}
        />,
      ),
    );

    await user.click(screen.getByTestId('cooldown-next')); // 1->2
    await user.click(screen.getByTestId('cooldown-next')); // 2->3
    await user.click(screen.getByTestId('cooldown-next')); // 3->4

    apiRequestMock.mockResolvedValueOnce({
      id: 'cd_1',
      completedAt: '2026-04-26T10:10:00Z',
      blocksCompleted: ['hands', 'abc', 'tilt', 'sleep'],
    });

    await user.click(screen.getByTestId('cooldown-finish'));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
      const arg = onComplete.mock.calls[0]?.[0];
      const blocks = arg?.blocksCompleted ?? arg?.log?.blocksCompleted ?? [];
      // Aceita: array com 4 elementos OU contendo todos os tokens
      const hasAll = ['hands', 'abc', 'tilt', 'sleep'].every((b) =>
        Array.isArray(blocks) ? blocks.includes(b) : false,
      );
      expect(hasAll).toBe(true);
    });
  });

  it('Finish dispara POST com sleepIntent (completedAt vem server-side no response)', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    apiRequestMock.mockResolvedValue({ id: 'cd_1', blocksCompleted: [] });

    render(
      wrap(
        <CoolDownRunner
          cooldownLogId="cd_1"
          sessionId="ses_1"
          mode="full"
          sessionTournaments={sessionTournaments}
          onClose={vi.fn()}
          onComplete={onComplete}
        />,
      ),
    );

    await user.click(screen.getByTestId('cooldown-next'));
    await user.click(screen.getByTestId('cooldown-next'));
    await user.click(screen.getByTestId('cooldown-next'));
    apiRequestMock.mockResolvedValueOnce({
      id: 'cd_1',
      completedAt: '2026-04-26T10:10:00Z',
      durationMinutes: 10,
    });
    await user.click(screen.getByTestId('cooldown-finish'));

    await waitFor(() => {
      const flat = JSON.stringify(apiRequestMock.mock.calls);
      // POST /finish + sleepIntent (server calcula completedAt)
      expect(flat).toContain('/finish');
      expect(flat).toContain('sleepIntent');
    });
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
      const arg = onComplete.mock.calls[0]?.[0];
      expect(arg?.completedAt).toBeTruthy();
    });
  });

  it('NAO chama onClose com isDraft=true quando completou (Concluir != fechar abruptamente)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    apiRequestMock.mockResolvedValue({ id: 'cd_1', blocksCompleted: [] });

    render(
      wrap(
        <CoolDownRunner
          cooldownLogId="cd_1"
          sessionId="ses_1"
          mode="full"
          sessionTournaments={sessionTournaments}
          onClose={onClose}
          onComplete={vi.fn()}
        />,
      ),
    );

    await user.click(screen.getByTestId('cooldown-next'));
    await user.click(screen.getByTestId('cooldown-next'));
    await user.click(screen.getByTestId('cooldown-next'));

    apiRequestMock.mockResolvedValueOnce({
      id: 'cd_1',
      completedAt: '2026-04-26T10:10:00Z',
      blocksCompleted: ['hands', 'abc', 'tilt', 'sleep'],
    });
    await user.click(screen.getByTestId('cooldown-finish'));

    await waitFor(() => {
      // se onClose foi chamado, NAO deve ter isDraft=true
      if (onClose.mock.calls.length > 0) {
        const arg = onClose.mock.calls[onClose.mock.calls.length - 1]?.[0] ?? {};
        expect(arg.isDraft).not.toBe(true);
      }
    });
  });
});

// ============================================================================
// Sprint Cooldown-2 — Reviewer fix CRITICAL #1+#2
//
// Cliente NAO calcula nextMorning() local + NAO chama PATCH /api/grind-sessions.
// Tudo ocorre via SINGLE POST /api/cooldown-logs/:id/finish (server-side).
// ============================================================================

describe('CoolDownRunner - Sprint 2 server-side unified finish', () => {
  it('finish dispara POST /api/cooldown-logs/:id/finish (e NAO PATCH /api/grind-sessions)', async () => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValue({ id: 'cd_1', blocksCompleted: [] });

    render(
      wrap(
        <CoolDownRunner
          cooldownLogId="cd_1"
          sessionId="ses_1"
          mode="full"
          sessionTournaments={sessionTournaments}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />,
      ),
    );

    await user.click(screen.getByTestId('cooldown-next')); // 1->2
    await user.click(screen.getByTestId('cooldown-next')); // 2->3
    await user.click(screen.getByTestId('cooldown-next')); // 3->4

    apiRequestMock.mockResolvedValueOnce({
      id: 'cd_1',
      completedAt: '2026-04-26T10:10:00Z',
      durationMinutes: 10,
      dashboardSnoozedUntil: null,
    });
    await user.click(screen.getByTestId('cooldown-finish'));

    await waitFor(() => {
      const calls = apiRequestMock.mock.calls;
      // Pelo menos 1 chamada POST a /api/cooldown-logs/cd_1/finish
      const finishCall = calls.find(
        (args) =>
          args[0] === 'POST' &&
          typeof args[1] === 'string' &&
          /\/api\/cooldown-logs\/cd_1\/finish$/.test(args[1]),
      );
      expect(finishCall).toBeDefined();

      // ZERO chamadas a PATCH /api/grind-sessions/...
      const grindSessionPatch = calls.find(
        (args) =>
          args[0] === 'PATCH' &&
          typeof args[1] === 'string' &&
          /\/api\/grind-sessions\//.test(args[1]),
      );
      expect(grindSessionPatch).toBeUndefined();
    });
  });

  it('CLIENT NAO calcula data — body do POST /finish nao contem dashboardSnoozedUntil', async () => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValue({ id: 'cd_1', blocksCompleted: [] });

    render(
      wrap(
        <CoolDownRunner
          cooldownLogId="cd_1"
          sessionId="ses_1"
          mode="full"
          sessionTournaments={sessionTournaments}
          onClose={vi.fn()}
          onComplete={vi.fn()}
        />,
      ),
    );

    await user.click(screen.getByTestId('cooldown-next'));
    await user.click(screen.getByTestId('cooldown-next'));
    await user.click(screen.getByTestId('cooldown-next'));

    apiRequestMock.mockResolvedValueOnce({
      id: 'cd_1',
      completedAt: '2026-04-26T10:10:00Z',
      dashboardSnoozedUntil: '2026-04-27T08:00:00.000Z',
    });
    await user.click(screen.getByTestId('cooldown-finish'));

    await waitFor(() => {
      const finishCall = apiRequestMock.mock.calls.find(
        (args) =>
          args[0] === 'POST' &&
          typeof args[1] === 'string' &&
          /\/api\/cooldown-logs\/cd_1\/finish$/.test(args[1]),
      );
      expect(finishCall).toBeDefined();
      const body = finishCall![2] as Record<string, any>;
      // body deve ter sleepIntent (boolean) + planClosed (boolean) — apenas booleans
      expect(typeof body.sleepIntent).toBe('boolean');
      expect(typeof body.planClosed).toBe('boolean');
      // body NAO deve incluir dashboardSnoozedUntil (server-calculated)
      expect(body).not.toHaveProperty('dashboardSnoozedUntil');
      // body NAO deve incluir completedAt (server-calculated)
      expect(body).not.toHaveProperty('completedAt');
    });
  });
});
