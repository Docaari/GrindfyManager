/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint F2 — W4: Telemetria do PendingSpotsTab (RF-Telemetria
 * `spot.reviewed` + `spot.review_later` com source='studies').
 *
 * Spec : Docs/specs/sprint-f2-spot-screenshots.md (Telemetria — source distinction)
 * Flow : Docs/architecture/feature-flows/spot-screenshots-flow.mermaid (FLUXO 2B)
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #2  data-testid estavel
 *   #3  shape REAL listPendingSpots (storage.ts:5167)
 *   #4  vi.hoisted (vitest 4)
 *   #11 default minimo
 *
 * NOTA W4 RED: green W3 (PendingSpotsTab.handleSave + handleReviewLater) NAO
 * emite telemetria. Esta suite espera que green W4 acrescente:
 *   track('spot.reviewed', { spotId, sessionTournamentId, hasConclusion, source: 'studies' })
 *   track('spot.review_later', { spotId, source: 'studies' })
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Mocks
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
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
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

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={freshClient()}>{ui}</QueryClientProvider>;
}

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
];

beforeEach(() => {
  apiRequestMock.mockReset();
  invalidateQueriesMock.mockClear();
  trackMock.mockClear();
  toastMock.mockClear();
});

// =============================================================================
// Cenario E-T1: handleSave dispara track('spot.reviewed', source='studies')
// Cobre RF-Telemetria: source distingue studies vs cooldown.
// =============================================================================

describe('PendingSpotsTab — telemetria spot.reviewed (studies source)', () => {
  it('save no modal dispara track("spot.reviewed") com source="studies"', async () => {
    const user = userEvent.setup();

    apiRequestMock.mockResolvedValueOnce({
      items: fixturesPending,
      total: fixturesPending.length,
      limit: 50,
      offset: 0,
    });
    apiRequestMock.mockResolvedValueOnce({
      id: 'sh-1',
      status: 'reviewed',
      reviewedAt: '2026-04-27T13:00:00.000Z',
      conclusion: 'X',
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

    const payload = trackMock.mock.calls.find((c) => c[0] === 'spot.reviewed')![1];
    expect(payload).toEqual(
      expect.objectContaining({
        spotId: 'sh-1',
        source: 'studies',
        hasConclusion: true,
      }),
    );
  });
});

// =============================================================================
// Cenario E-T2: handleReviewLater dispara track('spot.review_later', source='studies')
// =============================================================================

describe('PendingSpotsTab — telemetria spot.review_later (studies source)', () => {
  it('botao "Revisar Depois" no modal emite track("spot.review_later")', async () => {
    const user = userEvent.setup();

    apiRequestMock.mockResolvedValueOnce({
      items: fixturesPending,
      total: fixturesPending.length,
      limit: 50,
      offset: 0,
    });
    apiRequestMock.mockResolvedValueOnce({
      id: 'sh-1',
      reviewLater: true,
    });

    render(wrap(<PendingSpotsTab />));

    await waitFor(() => {
      expect(screen.getByTestId('pending-spot-review-sh-1')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('pending-spot-review-sh-1'));

    await waitFor(() => {
      expect(screen.getByTestId('spot-review-card')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('spot-review-later'));

    await waitFor(() => {
      const call = trackMock.mock.calls.find(
        (c) => c[0] === 'spot.review_later',
      );
      expect(call).toBeDefined();
    });

    const payload = trackMock.mock.calls.find(
      (c) => c[0] === 'spot.review_later',
    )![1];
    expect(payload).toEqual(
      expect.objectContaining({
        spotId: 'sh-1',
        source: 'studies',
      }),
    );
  });
});

// =============================================================================
// Cenario E-T3: NAO emite telemetria em erro
// =============================================================================

describe('PendingSpotsTab — telemetria NAO emite em erro', () => {
  it('PATCH /review com erro NAO chama track("spot.reviewed")', async () => {
    const user = userEvent.setup();

    apiRequestMock.mockResolvedValueOnce({
      items: fixturesPending,
      total: fixturesPending.length,
      limit: 50,
      offset: 0,
    });
    apiRequestMock.mockRejectedValueOnce(new Error('500 internal'));

    render(wrap(<PendingSpotsTab />));

    await waitFor(() => {
      expect(screen.getByTestId('pending-spot-review-sh-1')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('pending-spot-review-sh-1'));

    await waitFor(() => {
      expect(screen.getByTestId('spot-review-card')).toBeInTheDocument();
    });

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

    await new Promise((r) => setTimeout(r, 50));

    const call = trackMock.mock.calls.find((c) => c[0] === 'spot.reviewed');
    expect(call).toBeUndefined();
  });
});
