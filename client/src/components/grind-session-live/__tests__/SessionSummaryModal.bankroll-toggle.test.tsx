/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint B2 — M2: Setting bankrollManagementEnabled (lado SessionSummaryModal)
 *
 * Spec: Docs/specs/sprint-b2-summary-inline-reconcile.md (M2 Cenario 3)
 * ADR-047 + ADR-048
 * Sequence: Docs/architecture/flows/grind/sequence-session-end-b2.mermaid (Caminho 2)
 *
 * Cenarios cobertos:
 *   1. setting=false: secao bankroll-reconcile-section NAO renderiza
 *   2. setting=false: CTAs NAO chamam POST /reconcile-wallets, vao direto pra acao
 *   3. setting=false: telemetria reconcile_skipped_setting_off emitida (client side)
 *   4. setting=true + 0 wallets: secao renderiza vazia (ou nao renderiza, conforme spec edge case)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

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

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (a: any) => toastMock(a),
}));

const trackMock = vi.fn();
vi.mock('@/lib/telemetry', () => ({
  track: (...args: any[]) => trackMock(...args),
}));

const setLocationMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/grind/active', setLocationMock],
}));

import SessionSummaryModal from '../SessionSummaryModal';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const baseSummary = {
  sessionId: 'ses_1',
  volume: 5,
  invested: 50,
  profit: 100,
  roi: 50,
  fts: 1,
  wins: 0,
  bestResult: null,
  mentalAverages: {
    focus: 8,
    energy: 7,
    confidence: 8,
    emotionalIntelligence: 8,
    interference: 2,
  },
  objectiveStatus: 'completed',
  sessionTime: '02:00',
  objectives: 'objetivo da sessao',
  quickNotes: [],
  endTime: '2026-04-26T20:00:00Z',
  abiMed: 10,
  duration: 120,
  focoMedio: 8,
  inteligenciaEmocionalMedia: 8,
  interferenciasMedia: 2,
};

const wallets = [
  {
    walletId: 'w_suprema',
    name: 'Suprema Main',
    platform: 'Suprema',
    nativeCurrency: 'BRL',
    openingBalance: 500,
    balance: 500,
    expectedPreviousBalance: 500,
    expectedDelta: -50,
    expectedClosingBalance: 450,
    contributingTournaments: ['st_1'],
    hadActivityInSession: true,
    tieBreakStrategy: 'single',
  },
];

const baseProps: any = {
  show: true,
  summaryData: baseSummary,
  finalNotes: '',
  setFinalNotes: vi.fn(),
  onContinueSession: vi.fn(),
  onEndSession: vi.fn(),
  bankrollManagementEnabled: false, // toggle OFF
  reconcilableWallets: wallets,
  missingPlatforms: [],
  playedPlatforms: ['Suprema'],
};

beforeEach(() => {
  apiRequestMock.mockReset();
  toastMock.mockClear();
  trackMock.mockClear();
  setLocationMock.mockClear();
});

// =============================================================================
// Cenario 1: setting OFF esconde secao Bancas
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M2) — bankrollManagementEnabled=false esconde reconcile', () => {
  it('NAO renderiza [data-testid=bankroll-reconcile-section]', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    expect(screen.queryByTestId('bankroll-reconcile-section')).toBeNull();
  });

  it('NAO renderiza inputs por wallet', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    expect(screen.queryByTestId('wallet-balance-input-w_suprema')).toBeNull();
  });

  it('NAO renderiza banner missing-platforms-banner mesmo com missingPlatforms != []', () => {
    render(
      wrap(
        <SessionSummaryModal
          {...baseProps}
          missingPlatforms={['GGNetwork']}
        />,
      ),
    );
    expect(screen.queryByTestId('missing-platforms-banner')).toBeNull();
  });
});

// =============================================================================
// Cenario 2: setting OFF — CTA pula reconcile e vai direto pra acao
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M2) — setting=false NAO chama /reconcile-wallets', () => {
  // cta-start-cooldown removido (cooldown removal 2363509) — cool-down roda via
  // /cooldown standalone. O CTA terminal do modal agora e cta-finalize-session.

  it('click cta-finalize-session vai direto para onEndSession sem reconcile', async () => {
    const onEndSession = vi.fn();

    render(
      wrap(
        <SessionSummaryModal
          {...baseProps}
          onEndSession={onEndSession}
        />,
      ),
    );

    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    // Acao terminal disparada
    await waitFor(() => {
      expect(onEndSession).toHaveBeenCalled();
    });

    // Sem reconcile
    const reconcileCalls = apiRequestMock.mock.calls.filter((c: any[]) =>
      typeof c[1] === 'string' && c[1].includes('/reconcile-wallets'),
    );
    expect(reconcileCalls.length).toBe(0);
  });
});

// =============================================================================
// Cenario 3: telemetria reconcile_skipped_setting_off (client-side)
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M2) — telemetria reconcile_skipped_setting_off', () => {
  it('emite reconcile_skipped_setting_off quando o CTA terminal eh clicado com setting=false', async () => {
    render(wrap(<SessionSummaryModal {...baseProps} onEndSession={vi.fn()} />));

    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => {
      const skipEvent = trackMock.mock.calls.find(
        (c: any[]) => c[0] === 'reconcile_skipped_setting_off',
      );
      expect(skipEvent).toBeDefined();
    });
  });
});

// =============================================================================
// Cenario 4: setting=true + 0 wallets
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M2) — setting=true + 0 wallets ativas', () => {
  it('NAO renderiza secao bancas quando reconcilableWallets vazio (mesmo com setting on)', () => {
    render(
      wrap(
        <SessionSummaryModal
          {...baseProps}
          bankrollManagementEnabled={true}
          reconcilableWallets={[]}
          missingPlatforms={[]}
        />,
      ),
    );
    expect(screen.queryByTestId('bankroll-reconcile-section')).toBeNull();
  });
});
