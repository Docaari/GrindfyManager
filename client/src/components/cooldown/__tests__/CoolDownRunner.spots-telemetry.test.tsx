/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint F2 — W4: Telemetria do cooldown drag-to-review (RF-Telemetria
 * `spot.reviewed` + `spot.review_later` com source='cooldown').
 *
 * Spec : Docs/specs/sprint-f2-spot-screenshots.md (Telemetria)
 * Flow : Docs/architecture/feature-flows/spot-screenshots-flow.mermaid (FLUXO 2A)
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #2  data-testid estavel — todos contratados em CoolDownRunner.spots-list.test.tsx
 *   #3  shape REAL apiRequestMock retorna shape de listPendingSpots + PATCH /review
 *   #4  vi.hoisted (vitest 4) para resolver TDZ no factory de vi.mock
 *   #11 default minimo
 *
 * NOTA W4 RED: a implementacao W3 (CoolDownRunner.tsx green em handleSaveSpotReview
 * e handleReviewSpotLater) NAO emite telemetria. Estes testes esperam que a
 * green W4 acrescente:
 *   track('spot.reviewed', { spotId, sessionTournamentId, hasConclusion, source: 'cooldown' })
 *   track('spot.review_later', { spotId, source: 'cooldown' })
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Mocks (mesmo pattern de CoolDownRunner.spots-list.test.tsx)
// =============================================================================

const mocks = vi.hoisted(() => ({
  apiRequestMock: ((..._args: any[]) => undefined) as any,
  invalidateQueriesMock: ((..._args: any[]) => undefined) as any,
  trackMock: ((..._args: any[]) => undefined) as any,
}));

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

vi.mock('@/lib/telemetry', () => ({
  track: (...args: any[]) => mocks.trackMock(...args),
}));

const apiRequestMock = vi.fn();
const invalidateQueriesMock = vi.fn();
const trackMock = vi.fn();
mocks.apiRequestMock = apiRequestMock;
mocks.invalidateQueriesMock = invalidateQueriesMock;
mocks.trackMock = trackMock;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userPlatformId: 'USER-0001' } }),
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (a: any) => toastMock(a),
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
  trackMock.mockClear();
  toastMock.mockClear();
});

async function dragSpotToTournament(spotId: string, targetTestId: string) {
  await waitFor(() => {
    expect(screen.getByTestId(`session-spot-item-${spotId}`)).toBeInTheDocument();
  });
  const target = screen.getByTestId(targetTestId);
  const dt = makeDataTransfer({ 'application/x-spot-id': spotId });
  fireEvent.dragOver(target, { dataTransfer: dt });
  fireEvent.drop(target, { dataTransfer: dt });
  await waitFor(() => {
    expect(screen.getByTestId('spot-review-card')).toBeInTheDocument();
  });
}

// =============================================================================
// Cenario CT1: handleSaveSpotReview emite track('spot.reviewed', ...)
// Cobre RF-Telemetria: "spot.reviewed | PATCH com conclusion | { id,
// sessionTournamentId, hadConclusion, source }"
// =============================================================================

describe('CoolDownRunner — telemetria spot.reviewed (cooldown source)', () => {
  it('save review dispara track("spot.reviewed") com source="cooldown"', async () => {
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

    await dragSpotToTournament('sh-A', 'bloco1-tournament-st-1');

    // Preenche e salva
    await user.selectOptions(
      screen.getByTestId('spot-review-type') as HTMLSelectElement,
      'leak',
    );
    await user.selectOptions(
      screen.getByTestId('spot-review-spot') as HTMLSelectElement,
      'river',
    );
    await user.type(screen.getByTestId('spot-review-conclusion'), 'Bluff catcher');
    await user.click(screen.getByTestId('spot-review-save'));

    await waitFor(() => {
      const call = trackMock.mock.calls.find((c) => c[0] === 'spot.reviewed');
      expect(call).toBeDefined();
    });
  });

  it('payload tem spotId, sessionTournamentId, hasConclusion=true, source="cooldown"', async () => {
    // Cobre RF-Telemetria payload shape: { spotId, sessionTournamentId, hasConclusion, source }
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
          sessionTournamentId: 'st-1',
        });
      }
      return Promise.resolve({});
    });

    render(wrap(<CoolDownRunner {...baseProps} />));

    await dragSpotToTournament('sh-A', 'bloco1-tournament-st-1');

    await user.selectOptions(
      screen.getByTestId('spot-review-type') as HTMLSelectElement,
      'leak',
    );
    await user.selectOptions(
      screen.getByTestId('spot-review-spot') as HTMLSelectElement,
      'river',
    );
    await user.type(screen.getByTestId('spot-review-conclusion'), 'Conclusao texto');
    await user.click(screen.getByTestId('spot-review-save'));

    await waitFor(() => {
      const call = trackMock.mock.calls.find((c) => c[0] === 'spot.reviewed');
      expect(call).toBeDefined();
    });

    const payload = trackMock.mock.calls.find((c) => c[0] === 'spot.reviewed')![1];
    expect(payload).toEqual(
      expect.objectContaining({
        spotId: 'sh-A',
        sessionTournamentId: 'st-1',
        hasConclusion: true,
        source: 'cooldown',
      }),
    );
  });
});

// =============================================================================
// Cenario CT2: handleReviewSpotLater emite track('spot.review_later', ...)
// Cobre RF-Telemetria: "spot.review_later | PATCH com reviewLater=true | { id, sessionId }"
// W4 acrescenta `source: 'cooldown'` para distinguir surface.
// =============================================================================

describe('CoolDownRunner — telemetria spot.review_later (cooldown source)', () => {
  it('review later dispara track("spot.review_later") com source="cooldown"', async () => {
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
          reviewLater: true,
        });
      }
      return Promise.resolve({});
    });

    render(wrap(<CoolDownRunner {...baseProps} />));

    await dragSpotToTournament('sh-A', 'bloco1-tournament-st-1');

    // Click "Revisar Depois"
    await user.click(screen.getByTestId('spot-review-later'));

    await waitFor(() => {
      const call = trackMock.mock.calls.find((c) => c[0] === 'spot.review_later');
      expect(call).toBeDefined();
    });

    const payload = trackMock.mock.calls.find(
      (c) => c[0] === 'spot.review_later',
    )![1];
    expect(payload).toEqual(
      expect.objectContaining({
        spotId: 'sh-A',
        source: 'cooldown',
      }),
    );
  });
});

// =============================================================================
// Cenario CT3: NAO emite telemetria em erro (PATCH falhou)
// Cobre garantia: telemetria so emite quando PATCH retorna 200.
// =============================================================================

describe('CoolDownRunner — telemetria NAO emite em erro', () => {
  it('PATCH /review com erro 500 NAO chama track("spot.reviewed")', async () => {
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
        return Promise.reject(new Error('500 internal'));
      }
      return Promise.resolve({});
    });

    render(wrap(<CoolDownRunner {...baseProps} />));

    await dragSpotToTournament('sh-A', 'bloco1-tournament-st-1');

    await user.selectOptions(
      screen.getByTestId('spot-review-type') as HTMLSelectElement,
      'leak',
    );
    await user.selectOptions(
      screen.getByTestId('spot-review-spot') as HTMLSelectElement,
      'river',
    );
    await user.type(screen.getByTestId('spot-review-conclusion'), 'X');
    await user.click(screen.getByTestId('spot-review-save'));

    // Aguarda processar erro
    await new Promise((r) => setTimeout(r, 50));

    const call = trackMock.mock.calls.find((c) => c[0] === 'spot.reviewed');
    expect(call).toBeUndefined();
  });
});
