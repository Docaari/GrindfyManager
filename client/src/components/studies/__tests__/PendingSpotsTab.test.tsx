/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint F2 — W3: PendingSpotsTab (aba "Spots Pendentes" em /studies)
 *
 * Spec:    Docs/specs/sprint-f2-spot-screenshots.md (RF-10 + RF-11)
 * Flow:    Docs/architecture/feature-flows/spot-screenshots-flow.mermaid (FLUXO 2B)
 * C4:      Docs/architecture/feature-flows/spot-screenshots-components.mermaid
 *
 * Lessons aplicadas:
 *   #1  hooks first (useQuery / useMutation antes de qualquer return)
 *   #2  data-testid estavel
 *   #3  shape REAL — items vem do storage.ts:5167 (id, imageUrl, pastedAt,
 *       sessionTournamentId, status, reviewLater, tournamentName, etc)
 *   #4  stub red-phase em PendingSpotsTab.tsx
 *   #11 default minimo — botoes "Revisar agora" e "Descartar" so disparam
 *       quando user clica explicitamente
 *   #12 estado persistente via TanStack Query (queryKey
 *       ['/api/starred-hands/pending', { reviewLater: 'all' }])
 *
 * data-testids contratados:
 *   pending-spots-tab            container root
 *   pending-spots-loading        skeleton enquanto query carrega
 *   pending-spots-empty          empty state quando items=[]
 *   pending-spot-{id}            cada item da lista
 *   pending-spot-review-{id}     botao "Revisar agora" inline
 *   pending-spot-discard-{id}    botao "Descartar" inline
 *   spot-review-card             modal SpotReviewCard quando "Revisar agora"
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Mocks
// =============================================================================

// Use vi.hoisted to avoid TDZ when vi.mock factory runs before const init.
// (Same pattern as CoolDownRunner.spots-list.test.tsx; see lesson #4 vitest 4.)
const mocks = vi.hoisted(() => ({
  apiRequestMock: ((..._args: any[]) => undefined) as any,
  invalidateQueriesMock: ((..._args: any[]) => undefined) as any,
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => mocks.apiRequestMock(...args),
  queryClient: {
    invalidateQueries: (...args: any[]) => mocks.invalidateQueriesMock(...args),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
  getCsrfToken: () => null,
}));

const apiRequestMock = vi.fn();
const invalidateQueriesMock = vi.fn();
mocks.apiRequestMock = apiRequestMock;
mocks.invalidateQueriesMock = invalidateQueriesMock;

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (a: any) => toastMock(a),
}));

import PendingSpotsTab from '../PendingSpotsTab';

// =============================================================================
// Helpers
// =============================================================================

function freshClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function wrap(ui: React.ReactNode, qc: QueryClient = freshClient()) {
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

// Shape REAL retornado por listPendingSpots (server/storage.ts:5167)
const fixturesPending = [
  {
    id: 'sh-1',
    userId: 'USER-0001',
    sessionId: 'sess-A',
    sessionTournamentId: 'st-1',
    type: 'spot_screenshot',
    spot: 'screenshot_pending',
    notes: null,
    imageUrl: '/uploads/spot-screenshots/sh-1.png',
    conclusion: null,
    reviewedAt: null,
    reviewLater: true,
    expiresAt: '2026-05-11T12:00:00.000Z',
    pastedAt: '2026-04-27T12:00:00.000Z',
    source: 'paste',
    status: 'pending',
    createdAt: '2026-04-27T12:00:00.000Z',
    tournamentName: 'Sunday Million',
    tournamentSite: 'PokerStars',
    tournamentBuyIn: '215.00',
  },
  {
    id: 'sh-2',
    userId: 'USER-0001',
    sessionId: 'sess-B',
    sessionTournamentId: 'st-2',
    type: 'spot_screenshot',
    spot: 'screenshot_pending',
    notes: null,
    imageUrl: '/uploads/spot-screenshots/sh-2.png',
    conclusion: null,
    reviewedAt: null,
    reviewLater: false,
    expiresAt: '2026-05-12T12:00:00.000Z',
    pastedAt: '2026-04-28T12:00:00.000Z',
    source: 'paste',
    status: 'pending',
    createdAt: '2026-04-28T12:00:00.000Z',
    tournamentName: 'Bounty Builder $22',
    tournamentSite: 'PokerStars',
    tournamentBuyIn: '22.00',
  },
];

beforeEach(() => {
  apiRequestMock.mockReset();
  invalidateQueriesMock.mockClear();
  toastMock.mockClear();
});

// =============================================================================
// Cenario E1: Loading state — query em flight
// Cobre RF-10 AC: skeleton enquanto carrega
// =============================================================================

describe('PendingSpotsTab — loading state', () => {
  it('mostra pending-spots-loading enquanto query esta em flight', async () => {
    // apiRequestMock retorna promessa que NAO resolve durante a renderizacao.
    let resolveFn: (v: any) => void = () => {};
    apiRequestMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
    );
    render(wrap(<PendingSpotsTab />));

    expect(screen.getByTestId('pending-spots-loading')).toBeInTheDocument();

    // Resolve promessa para evitar leak (limpa query) — nao ha cleanup explicito.
    resolveFn({ items: [], total: 0, limit: 50, offset: 0 });
  });
});

// =============================================================================
// Cenario E2: Empty state — items=[]
// Cobre RF-10 AC: "Empty state amigavel"
// =============================================================================

describe('PendingSpotsTab — empty state', () => {
  it('quando items=[], renderiza pending-spots-empty', async () => {
    apiRequestMock.mockResolvedValueOnce({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    });
    render(wrap(<PendingSpotsTab />));

    await waitFor(() => {
      expect(screen.getByTestId('pending-spots-empty')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// Cenario E3: Lista renderiza items com testid pending-spot-{id}
// Cobre RF-10 AC: "Lista carrega prints pendentes corretamente"
// =============================================================================

describe('PendingSpotsTab — render items', () => {
  it('renderiza pending-spot-{id} para cada item retornado', async () => {
    apiRequestMock.mockResolvedValueOnce({
      items: fixturesPending,
      total: fixturesPending.length,
      limit: 50,
      offset: 0,
    });
    render(wrap(<PendingSpotsTab />));

    await waitFor(() => {
      expect(screen.getByTestId('pending-spot-sh-1')).toBeInTheDocument();
      expect(screen.getByTestId('pending-spot-sh-2')).toBeInTheDocument();
    });
  });

  it('cada item exibe thumbnail + meta do torneio (nome ou buyIn)', async () => {
    apiRequestMock.mockResolvedValueOnce({
      items: fixturesPending,
      total: fixturesPending.length,
      limit: 50,
      offset: 0,
    });
    render(wrap(<PendingSpotsTab />));

    await waitFor(() => {
      expect(screen.getByTestId('pending-spot-sh-1')).toBeInTheDocument();
    });
    const item = screen.getByTestId('pending-spot-sh-1');
    const img = item.querySelector('img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toContain('/api/starred-hands/sh-1/image');
    // Pelo menos uma das informacoes meta aparece (tournamentName, site ou buyIn).
    const text = item.textContent ?? '';
    const hasMeta =
      text.includes('Sunday Million') ||
      text.includes('PokerStars') ||
      text.includes('215');
    expect(hasMeta).toBe(true);
  });

  it('botoes pending-spot-review-{id} e pending-spot-discard-{id} existem', async () => {
    apiRequestMock.mockResolvedValueOnce({
      items: fixturesPending,
      total: fixturesPending.length,
      limit: 50,
      offset: 0,
    });
    render(wrap(<PendingSpotsTab />));

    await waitFor(() => {
      expect(screen.getByTestId('pending-spot-review-sh-1')).toBeInTheDocument();
      expect(screen.getByTestId('pending-spot-discard-sh-1')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// Cenario E4: Click "Revisar agora" abre modal SpotReviewCard
// Cobre RF-10 AC: "Revisar abre modal e atualiza tab"
// =============================================================================

describe('PendingSpotsTab — click Revisar agora', () => {
  it('click em pending-spot-review-sh-1 abre spot-review-card', async () => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValueOnce({
      items: fixturesPending,
      total: fixturesPending.length,
      limit: 50,
      offset: 0,
    });
    render(wrap(<PendingSpotsTab />));

    await waitFor(() => {
      expect(screen.getByTestId('pending-spot-review-sh-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('pending-spot-review-sh-1'));

    await waitFor(() => {
      expect(screen.getByTestId('spot-review-card')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// Cenario E5: Click "Descartar" dispara DELETE /api/starred-hands/:id/discard
// Cobre RF-10 AC: "Descartar move pra status discarded e some da lista"
// =============================================================================

describe('PendingSpotsTab — click Descartar', () => {
  it('dispara DELETE /api/starred-hands/sh-1/discard', async () => {
    const user = userEvent.setup();
    // Primeira chamada: GET /pending
    apiRequestMock.mockResolvedValueOnce({
      items: fixturesPending,
      total: fixturesPending.length,
      limit: 50,
      offset: 0,
    });
    // Segunda chamada: DELETE /:id/discard (resposta 204 = vazio)
    apiRequestMock.mockResolvedValueOnce(undefined);

    render(wrap(<PendingSpotsTab />));

    await waitFor(() => {
      expect(screen.getByTestId('pending-spot-discard-sh-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('pending-spot-discard-sh-1'));

    await waitFor(() => {
      const calls = apiRequestMock.mock.calls;
      // Pelo menos uma chamada DELETE com path .../sh-1/discard
      const deleteCall = calls.find(
        (c) =>
          (c[0] === 'DELETE' || /^DELETE$/i.test(String(c[0]))) &&
          /\/api\/starred-hands\/sh-1\/discard/.test(String(c[1])),
      );
      expect(deleteCall).toBeDefined();
    });
  });

  it('apos descartar, invalida query /api/starred-hands/pending', async () => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValueOnce({
      items: fixturesPending,
      total: fixturesPending.length,
      limit: 50,
      offset: 0,
    });
    apiRequestMock.mockResolvedValueOnce(undefined);

    render(wrap(<PendingSpotsTab />));

    await waitFor(() => {
      expect(screen.getByTestId('pending-spot-discard-sh-2')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('pending-spot-discard-sh-2'));

    await waitFor(() => {
      // invalidateQueries chamado com queryKey contendo /pending
      const calls = invalidateQueriesMock.mock.calls;
      const matched = calls.find((c) => {
        const arg = c[0] ?? {};
        const key = arg.queryKey;
        if (!key) return false;
        const flat = JSON.stringify(key);
        return /starred-hands\/pending|starred-hands.*pending/.test(flat);
      });
      expect(matched).toBeDefined();
    });
  });
});

// =============================================================================
// Cenario E6: Save no modal apos Revisar agora — invalida query e modal fecha
// Cobre RF-10 AC: "Apos save, spot some da lista"
// =============================================================================

describe('PendingSpotsTab — save no modal', () => {
  it('PATCH /:id/review com conclusion invalida /pending', async () => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValueOnce({
      items: fixturesPending,
      total: fixturesPending.length,
      limit: 50,
      offset: 0,
    });
    // PATCH /review response shape (RF-03 contract)
    apiRequestMock.mockResolvedValueOnce({
      id: 'sh-1',
      status: 'reviewed',
      reviewedAt: '2026-04-27T13:00:00.000Z',
      conclusion: 'Bluff catcher',
      type: 'leak',
      spot: 'river',
      sessionTournamentId: 'st-1',
    });

    render(wrap(<PendingSpotsTab />));

    await waitFor(() => {
      expect(screen.getByTestId('pending-spot-review-sh-1')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('pending-spot-review-sh-1'));

    await waitFor(() => {
      expect(screen.getByTestId('spot-review-card')).toBeInTheDocument();
    });

    // Preenche form mininal e salva.
    const typeSel = screen.getByTestId('spot-review-type') as HTMLSelectElement;
    const spotSel = screen.getByTestId('spot-review-spot') as HTMLSelectElement;
    await user.selectOptions(typeSel, 'leak');
    await user.selectOptions(spotSel, 'river');
    await user.type(screen.getByTestId('spot-review-conclusion'), 'Bluff catcher');

    await user.click(screen.getByTestId('spot-review-save'));

    await waitFor(() => {
      // PATCH chamado
      const calls = apiRequestMock.mock.calls;
      const patchCall = calls.find(
        (c) =>
          /^PATCH$/i.test(String(c[0])) &&
          /\/api\/starred-hands\/sh-1\/review/.test(String(c[1])),
      );
      expect(patchCall).toBeDefined();
    });

    // invalidateQueries para /pending apos save.
    await waitFor(() => {
      const calls = invalidateQueriesMock.mock.calls;
      const matched = calls.find((c) => {
        const arg = c[0] ?? {};
        const key = arg.queryKey;
        if (!key) return false;
        const flat = JSON.stringify(key);
        return /starred-hands\/pending|starred-hands.*pending/.test(flat);
      });
      expect(matched).toBeDefined();
    });
  });
});
