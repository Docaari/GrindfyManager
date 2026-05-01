/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint F2 — W3: Integration CoolDownRunner + SessionSpotsList + drop +
 * SpotReviewCard (fluxo completo cooldown drag-to-review)
 *
 * Spec:    Docs/specs/sprint-f2-spot-screenshots.md (RF-08 + RF-09)
 * Flow:    Docs/architecture/feature-flows/spot-screenshots-flow.mermaid (FLUXO 2A)
 * C4:      Docs/architecture/feature-flows/spot-screenshots-components.mermaid
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #2  data-testid estavel — todos os ids ja contratados nos tests unitarios
 *   #3  shape REAL — apiRequestMock retorna shape de listPendingSpots e PATCH /review
 *   #4  stub red-phase — SessionSpotsList + SpotReviewCard ainda renderizam null;
 *       este integration test FALHARA por motivo certo: testid nao encontrado.
 *       Implementer (W3 green) faz CoolDownRunner montar SessionSpotsList,
 *       wire-up onSpotDropped abre modal SpotReviewCard, save dispara PATCH
 *       e refetcha /pending.
 *   #11 default minimo — nada acontece automatico; user precisa drag+drop+save.
 *   #12 estado persistente via TanStack Query (lista refetcha apos save).
 *
 * Importante: este teste NAO valida o cooldown classico (Bloco 2/3/4) —
 * cobertura ja existe em CoolDownRunner.full-flow.test.tsx. Foco aqui eh
 * APENAS o wire-up SpotsList + drop + ReviewCard.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Mocks
// =============================================================================

// vi.hoisted (vitest 4) eleva a definicao das fns para junto da hoisting de
// vi.mock, evitando "Cannot access X before initialization" no factory.
// Lesson: nao referencie variaveis lexicas em vi.mock factory — use hoisted ou
// inline closures.
const mocks = vi.hoisted(() => {
  return {
    apiRequestMock: ((..._args: any[]) => undefined) as any,
    invalidateQueriesMock: ((..._args: any[]) => undefined) as any,
  };
});

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => mocks.apiRequestMock(...args),
  queryClient: {
    invalidateQueries: (...args: any[]) => mocks.invalidateQueriesMock(...args),
    setQueryData: () => {},
    getQueryData: () => {},
    fetchQuery: () => {},
  },
  getCsrfToken: () => null,
}));

const apiRequestMock = vi.fn();
const invalidateQueriesMock = vi.fn();
mocks.apiRequestMock = apiRequestMock;
mocks.invalidateQueriesMock = invalidateQueriesMock;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userPlatformId: 'USER-0001' } }),
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (a: any) => toastMock(a),
}));

vi.mock('@/lib/telemetry', () => ({
  track: vi.fn(),
}));

import { CoolDownRunner } from '@/components/cooldown/CoolDownRunner';

// =============================================================================
// Helpers
// =============================================================================

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function makeDataTransfer(initial?: Record<string, string>) {
  const store: Record<string, string> = { ...initial };
  return {
    setData(format: string, value: string) {
      store[format] = value;
    },
    getData(format: string) {
      return store[format] ?? '';
    },
    types: Object.keys(store),
    effectAllowed: 'move',
    dropEffect: 'move',
    files: [],
    items: [],
    clearData() {
      for (const k of Object.keys(store)) delete store[k];
    },
  } as any;
}

const sessionTournaments = [
  {
    id: 'st-1',
    sessionId: 'sess-1',
    site: 'PokerStars',
    name: '$11 Bounty',
    buyIn: '11',
    rebuys: 0,
    result: 'pending',
    status: 'completed',
    fromPlannedTournament: false,
  },
];

// listPendingSpots shape (server/storage.ts:5167)
const fixturesSpots = [
  {
    id: 'sh-A',
    userId: 'USER-0001',
    sessionId: 'sess-1',
    sessionTournamentId: null,
    type: 'spot_screenshot',
    spot: 'screenshot_pending',
    notes: null,
    imageUrl: '/uploads/spot-screenshots/sh-A.png',
    conclusion: null,
    reviewedAt: null,
    reviewLater: false,
    expiresAt: '2026-05-11T12:00:00.000Z',
    pastedAt: '2026-04-27T12:00:00.000Z',
    source: 'paste',
    status: 'pending',
    createdAt: '2026-04-27T12:00:00.000Z',
    tournamentName: null,
    tournamentSite: null,
    tournamentBuyIn: null,
  },
];

const baseProps = {
  cooldownLogId: 'cd_1',
  sessionId: 'sess-1',
  mode: 'full' as const,
  sessionTournaments,
  onClose: vi.fn(),
  onComplete: vi.fn(),
};

beforeEach(() => {
  apiRequestMock.mockReset();
  invalidateQueriesMock.mockClear();
  toastMock.mockClear();
});

// =============================================================================
// Cenario F1: SessionSpotsList renderiza no Bloco 1
// Cobre RF-08 AC: "Lista lateral renderizada em CooldownPage"
// =============================================================================

describe('CoolDownRunner.spots-list — render lateral', () => {
  it('SessionSpotsList aparece no Bloco 1 (cooldown-block-1 + session-spots-list)', async () => {
    apiRequestMock.mockImplementation((method: string, path: string) => {
      if (method === 'GET' && /\/api\/starred-hands\/pending/.test(path)) {
        return Promise.resolve({
          items: fixturesSpots,
          total: fixturesSpots.length,
          limit: 50,
          offset: 0,
        });
      }
      return Promise.resolve({ id: 'cd_1', blocksCompleted: [] });
    });

    render(wrap(<CoolDownRunner {...baseProps} />));

    // Bloco 1 montado
    expect(screen.getByTestId('cooldown-block-1')).toBeInTheDocument();

    // SessionSpotsList aparece (testid contratado em SessionSpotsList.test.tsx)
    await waitFor(() => {
      expect(screen.getByTestId('session-spots-list')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// Cenario F2: GET /api/starred-hands/pending eh chamado com sessionId atual
// Cobre RF-08 AC: "Query GET /pending?sessionId={id}"
// =============================================================================

describe('CoolDownRunner.spots-list — fetch /pending', () => {
  it('chama GET /api/starred-hands/pending com sessionId=sess-1', async () => {
    apiRequestMock.mockImplementation((method: string, path: string) => {
      if (method === 'GET' && /\/api\/starred-hands\/pending/.test(path)) {
        return Promise.resolve({
          items: fixturesSpots,
          total: fixturesSpots.length,
          limit: 50,
          offset: 0,
        });
      }
      return Promise.resolve({ id: 'cd_1', blocksCompleted: [] });
    });

    render(wrap(<CoolDownRunner {...baseProps} />));

    await waitFor(() => {
      const calls = apiRequestMock.mock.calls;
      const found = calls.find(
        (c) =>
          /^GET$/i.test(String(c[0])) &&
          /\/api\/starred-hands\/pending/.test(String(c[1])) &&
          /sess-1|sessionId=sess-1/.test(String(c[1])),
      );
      expect(found).toBeDefined();
    });
  });
});

// =============================================================================
// Cenario F3: Item da lista renderiza com testid session-spot-item-{id}
// Cobre RF-08 AC: "Lista mostra apenas prints da sessao"
// =============================================================================

describe('CoolDownRunner.spots-list — items renderizados', () => {
  it('apos fetch, session-spot-item-sh-A aparece', async () => {
    apiRequestMock.mockImplementation((method: string, path: string) => {
      if (method === 'GET' && /\/api\/starred-hands\/pending/.test(path)) {
        return Promise.resolve({
          items: fixturesSpots,
          total: fixturesSpots.length,
          limit: 50,
          offset: 0,
        });
      }
      return Promise.resolve({ id: 'cd_1', blocksCompleted: [] });
    });

    render(wrap(<CoolDownRunner {...baseProps} />));

    await waitFor(() => {
      expect(screen.getByTestId('session-spot-item-sh-A')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// Cenario F4: Drop em torneio abre SpotReviewCard
// Cobre RF-09 AC: "Modal abre com preview e selects"
// =============================================================================

describe('CoolDownRunner.spots-list — drop abre SpotReviewCard', () => {
  it('drop em bloco1-tournament-st-1 abre spot-review-card', async () => {
    apiRequestMock.mockImplementation((method: string, path: string) => {
      if (method === 'GET' && /\/api\/starred-hands\/pending/.test(path)) {
        return Promise.resolve({
          items: fixturesSpots,
          total: fixturesSpots.length,
          limit: 50,
          offset: 0,
        });
      }
      return Promise.resolve({ id: 'cd_1', blocksCompleted: [] });
    });

    render(wrap(<CoolDownRunner {...baseProps} />));

    await waitFor(() => {
      expect(screen.getByTestId('bloco1-tournament-st-1')).toBeInTheDocument();
      expect(screen.getByTestId('session-spot-item-sh-A')).toBeInTheDocument();
    });

    const card = screen.getByTestId('bloco1-tournament-st-1');
    const dt = makeDataTransfer({ 'application/x-spot-id': 'sh-A' });
    fireEvent.dragOver(card, { dataTransfer: dt });
    fireEvent.drop(card, { dataTransfer: dt });

    await waitFor(() => {
      expect(screen.getByTestId('spot-review-card')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// Cenario F5: Save no modal dispara PATCH /:id/review com sessionTournamentId
// resolvido pelo drop target.
// Cobre RF-09 AC: "Salvar PATCH chama endpoint" + "sessionTournamentId vem do alvo"
// =============================================================================

describe('CoolDownRunner.spots-list — save dispara PATCH', () => {
  it('preenche modal e save dispara PATCH /api/starred-hands/sh-A/review', async () => {
    const user = userEvent.setup();

    apiRequestMock.mockImplementation((method: string, path: string) => {
      if (method === 'GET' && /\/api\/starred-hands\/pending/.test(path)) {
        return Promise.resolve({
          items: fixturesSpots,
          total: fixturesSpots.length,
          limit: 50,
          offset: 0,
        });
      }
      if (method === 'PATCH' && /\/api\/starred-hands\/sh-A\/review/.test(path)) {
        return Promise.resolve({
          id: 'sh-A',
          status: 'reviewed',
          reviewedAt: '2026-04-27T13:00:00.000Z',
          conclusion: 'Bluff catcher',
          type: 'leak',
          spot: 'river',
          sessionTournamentId: 'st-1',
        });
      }
      return Promise.resolve({ id: 'cd_1', blocksCompleted: [] });
    });

    render(wrap(<CoolDownRunner {...baseProps} />));

    await waitFor(() => {
      expect(screen.getByTestId('session-spot-item-sh-A')).toBeInTheDocument();
    });

    const card = screen.getByTestId('bloco1-tournament-st-1');
    const dt = makeDataTransfer({ 'application/x-spot-id': 'sh-A' });
    fireEvent.dragOver(card, { dataTransfer: dt });
    fireEvent.drop(card, { dataTransfer: dt });

    await waitFor(() => {
      expect(screen.getByTestId('spot-review-card')).toBeInTheDocument();
    });

    // Preenche form
    const typeSel = screen.getByTestId('spot-review-type') as HTMLSelectElement;
    const spotSel = screen.getByTestId('spot-review-spot') as HTMLSelectElement;
    await user.selectOptions(typeSel, 'leak');
    await user.selectOptions(spotSel, 'river');
    await user.type(screen.getByTestId('spot-review-conclusion'), 'Bluff catcher');

    await user.click(screen.getByTestId('spot-review-save'));

    await waitFor(() => {
      const calls = apiRequestMock.mock.calls;
      const patchCall = calls.find(
        (c) =>
          /^PATCH$/i.test(String(c[0])) &&
          /\/api\/starred-hands\/sh-A\/review/.test(String(c[1])),
      );
      expect(patchCall).toBeDefined();
      // Body: sessionTournamentId='st-1' (vindo do drop target)
      const body = patchCall?.[2] ?? {};
      expect(body.sessionTournamentId).toBe('st-1');
      expect(body.type).toBe('leak');
      expect(body.spot).toBe('river');
      expect(body.conclusion).toBe('Bluff catcher');
    });
  });
});

// =============================================================================
// Cenario F6: Apos save, lista refetcha (invalidateQueries) e modal fecha
// Cobre RF-09 AC: "Print desaparece da lista lateral apos sucesso"
// =============================================================================

describe('CoolDownRunner.spots-list — refetch apos save', () => {
  it('apos save bem-sucedido, invalidateQueries para /pending eh chamado', async () => {
    const user = userEvent.setup();

    apiRequestMock.mockImplementation((method: string, path: string) => {
      if (method === 'GET' && /\/api\/starred-hands\/pending/.test(path)) {
        return Promise.resolve({
          items: fixturesSpots,
          total: fixturesSpots.length,
          limit: 50,
          offset: 0,
        });
      }
      if (method === 'PATCH' && /\/api\/starred-hands\/sh-A\/review/.test(path)) {
        return Promise.resolve({
          id: 'sh-A',
          status: 'reviewed',
          reviewedAt: '2026-04-27T13:00:00.000Z',
          conclusion: 'OK',
          type: 'leak',
          spot: 'river',
          sessionTournamentId: 'st-1',
        });
      }
      return Promise.resolve({ id: 'cd_1', blocksCompleted: [] });
    });

    render(wrap(<CoolDownRunner {...baseProps} />));

    await waitFor(() => {
      expect(screen.getByTestId('session-spot-item-sh-A')).toBeInTheDocument();
    });

    const cardEl = screen.getByTestId('bloco1-tournament-st-1');
    const dt = makeDataTransfer({ 'application/x-spot-id': 'sh-A' });
    fireEvent.dragOver(cardEl, { dataTransfer: dt });
    fireEvent.drop(cardEl, { dataTransfer: dt });

    await waitFor(() => {
      expect(screen.getByTestId('spot-review-card')).toBeInTheDocument();
    });

    const typeSel = screen.getByTestId('spot-review-type') as HTMLSelectElement;
    const spotSel = screen.getByTestId('spot-review-spot') as HTMLSelectElement;
    await user.selectOptions(typeSel, 'leak');
    await user.selectOptions(spotSel, 'river');
    await user.type(screen.getByTestId('spot-review-conclusion'), 'OK');
    await user.click(screen.getByTestId('spot-review-save'));

    // Apos save, invalidateQueries chamado com queryKey contendo
    // /api/starred-hands/pending.
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

    // Modal fecha (spot-review-card desaparece).
    await waitFor(() => {
      expect(screen.queryByTestId('spot-review-card')).not.toBeInTheDocument();
    });
  });
});
