/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint B2 — M3: Wallets eligibility por plataformas jogadas (lado client)
 *
 * Spec: Docs/specs/sprint-b2-summary-inline-reconcile.md (M3)
 * ADR-048: Wallets eligibility platforms played
 * Sequence: Caminho 3 (banner amber + cadastro inline)
 *
 * Cenarios cobertos:
 *   1. missingPlatforms=['Suprema','GG']: banner amber [data-testid=missing-platforms-banner]
 *      renderiza com lista
 *   2. CTAs cta-start-cooldown e cta-finalize-session ficam disabled
 *      quando missingPlatforms.length > 0
 *   3. Click [data-testid=register-wallet-cta] abre WalletCreateDialog inline
 *      com prefill={ platform, nativeCurrency }
 *   4. Apos criar wallet (POST /api/wallets 201): banner some, CTAs habilitam
 *   5. Mapping platform->currency: Suprema=BRL, GGNetwork=USD, PokerStars=USD,
 *      CoinPoker=USDT, Chico=USD, etc (ADR-048)
 *   6. Truncamento "+N mais" quando >3 plataformas faltando
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
    invalidateQueries: (...a: any[]) => invalidateQueriesMock(...a),
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

const supremaWallet = {
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
};

const baseProps: any = {
  show: true,
  summaryData: baseSummary,
  finalNotes: '',
  setFinalNotes: vi.fn(),
  onContinueSession: vi.fn(),
  onEndSession: vi.fn(),
  bankrollManagementEnabled: true,
  reconcilableWallets: [supremaWallet],
  missingPlatforms: ['GGNetwork'],
  playedPlatforms: ['Suprema', 'GGNetwork'],
};

beforeEach(() => {
  apiRequestMock.mockReset();
  toastMock.mockClear();
  trackMock.mockClear();
  invalidateQueriesMock.mockClear();
});

// =============================================================================
// Cenario 1: banner amber renderiza com lista de plataformas
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M3) — banner missing-platforms-banner', () => {
  it('renderiza [data-testid=missing-platforms-banner] quando missingPlatforms tem items', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    expect(screen.getByTestId('missing-platforms-banner')).toBeInTheDocument();
  });

  it('banner contem nome da plataforma faltante (GGNetwork)', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    const banner = screen.getByTestId('missing-platforms-banner');
    expect(banner.textContent).toMatch(/GG/i);
  });

  it('NAO renderiza banner quando missingPlatforms eh vazio', () => {
    render(
      wrap(
        <SessionSummaryModal
          {...baseProps}
          missingPlatforms={[]}
        />,
      ),
    );
    expect(screen.queryByTestId('missing-platforms-banner')).toBeNull();
  });

  it('emite telemetria summary_missing_platforms_shown ao montar com missingPlatforms', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    const event = trackMock.mock.calls.find(
      (c: any[]) => c[0] === 'summary_missing_platforms_shown',
    );
    expect(event).toBeDefined();
  });
});

// =============================================================================
// Cenario 2: CTAs disabled com missingPlatforms
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M3) — CTAs disabled com missingPlatforms', () => {
  it('cta-start-cooldown fica disabled quando missingPlatforms.length > 0', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    const cta = screen.getByTestId('cta-start-cooldown') as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });

  it('cta-finalize-session fica disabled quando missingPlatforms.length > 0', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    const cta = screen.getByTestId('cta-finalize-session') as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });

  it('CTAs habilitam quando missingPlatforms vazio', () => {
    render(
      wrap(
        <SessionSummaryModal
          {...baseProps}
          missingPlatforms={[]}
        />,
      ),
    );
    const cooldown = screen.getByTestId('cta-start-cooldown') as HTMLButtonElement;
    const finalize = screen.getByTestId('cta-finalize-session') as HTMLButtonElement;
    expect(cooldown.disabled).toBe(false);
    expect(finalize.disabled).toBe(false);
  });

  it('click em CTA disabled NAO dispara apiRequest (defesa)', async () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    const cta = screen.getByTestId('cta-start-cooldown');
    fireEvent.click(cta);
    // Wait nada — defensive: garante que nada foi chamado.
    await new Promise((r) => setTimeout(r, 30));
    const reconcileCalls = apiRequestMock.mock.calls.filter((c: any[]) =>
      typeof c[1] === 'string' && c[1].includes('/reconcile-wallets'),
    );
    expect(reconcileCalls.length).toBe(0);
  });
});

// =============================================================================
// Cenario 3: Click register-wallet-cta abre WalletCreateDialog inline com prefill
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M3) — register-wallet-cta abre dialog inline', () => {
  it('renderiza [data-testid=register-wallet-cta] dentro do banner', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    expect(screen.getByTestId('register-wallet-cta')).toBeInTheDocument();
  });

  it('click register-wallet-cta abre WalletCreateDialog (visivel via [data-testid=wallet-create-dialog])', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    fireEvent.click(screen.getByTestId('register-wallet-cta'));
    // WalletCreateDialog deve aparecer.
    // O componente real usa data-testid implicito atraves do form; mas para o
    // teste TDD verificamos que algum elemento marcador do dialog aparece.
    expect(screen.queryByTestId('wallet-create-dialog')).toBeInTheDocument();
  });

  it('emite telemetria summary_missing_platforms_create_clicked com platform', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    fireEvent.click(screen.getByTestId('register-wallet-cta'));
    const event = trackMock.mock.calls.find(
      (c: any[]) => c[0] === 'summary_missing_platforms_create_clicked',
    );
    expect(event).toBeDefined();
    // Payload contem platform = primeira missing
    expect(event[1].platform).toBe('GGNetwork');
  });
});

// =============================================================================
// Cenario 4: apos criar wallet, banner some, CTAs habilitam
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M3) — apos criar wallet refetch desbloqueia', () => {
  it('quando missingPlatforms passa a vazio (refetch atualizou), banner some e CTAs habilitam', () => {
    const { rerender } = render(wrap(<SessionSummaryModal {...baseProps} />));
    // Inicialmente: banner visivel, CTAs disabled
    expect(screen.getByTestId('missing-platforms-banner')).toBeInTheDocument();
    expect((screen.getByTestId('cta-start-cooldown') as HTMLButtonElement).disabled).toBe(true);

    // Simula refetch: missingPlatforms vazio
    rerender(
      wrap(
        <SessionSummaryModal
          {...baseProps}
          missingPlatforms={[]}
          reconcilableWallets={[
            supremaWallet,
            {
              walletId: 'w_gg',
              name: 'GG Main',
              platform: 'GGNetwork',
              nativeCurrency: 'USD',
              openingBalance: 200,
              balance: 200,
              expectedPreviousBalance: 200,
              expectedDelta: 25,
              expectedClosingBalance: 225,
              contributingTournaments: ['st_2'],
              hadActivityInSession: true,
              tieBreakStrategy: 'single',
            },
          ]}
        />,
      ),
    );

    expect(screen.queryByTestId('missing-platforms-banner')).toBeNull();
    expect((screen.getByTestId('cta-start-cooldown') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('cta-finalize-session') as HTMLButtonElement).disabled).toBe(false);
  });
});

// =============================================================================
// Cenario 5: mapping platform -> currency default (ADR-048)
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M3) — mapping platform->currency no register-wallet-cta', () => {
  // Tabela ADR-048
  const cases: Array<[string, string]> = [
    ['Suprema', 'BRL'],
    ['GGNetwork', 'USD'],
    ['PokerStars', 'USD'],
    ['CoinPoker', 'USDT'],
    ['Chico', 'USD'],
  ];

  it.each(cases)(
    'platform=%s -> nativeCurrency=%s ao abrir register-wallet-cta',
    (platform, expectedCurrency) => {
      render(
        wrap(
          <SessionSummaryModal
            {...baseProps}
            missingPlatforms={[platform]}
          />,
        ),
      );
      fireEvent.click(screen.getByTestId('register-wallet-cta'));
      const event = trackMock.mock.calls.find(
        (c: any[]) => c[0] === 'summary_missing_platforms_create_clicked',
      );
      expect(event).toBeDefined();
      // O test-writer espera que SessionSummaryModal passe nativeCurrency
      // derivada para o WalletCreateDialog via prefill. Telemetria reflete
      // a moeda escolhida para a plataforma.
      expect(event[1].nativeCurrency).toBe(expectedCurrency);
    },
  );
});

// =============================================================================
// Cenario 6: truncamento "+N mais" quando >3 plataformas faltando
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M3) — truncamento +N mais', () => {
  it('com 5 missingPlatforms, banner mostra primeiras 3 + "+2 mais"', () => {
    render(
      wrap(
        <SessionSummaryModal
          {...baseProps}
          missingPlatforms={['Suprema', 'GGNetwork', 'PokerStars', 'CoinPoker', 'Chico']}
        />,
      ),
    );
    const banner = screen.getByTestId('missing-platforms-banner');
    // Inclui as 3 primeiras
    expect(banner.textContent).toMatch(/Suprema/);
    expect(banner.textContent).toMatch(/GG/i);
    expect(banner.textContent).toMatch(/Stars|PokerStars/);
    // Texto de truncamento
    expect(banner.textContent).toMatch(/\+2 mais|2 mais/i);
  });

  it('com 3 missingPlatforms, NAO usa truncamento "+N mais"', () => {
    render(
      wrap(
        <SessionSummaryModal
          {...baseProps}
          missingPlatforms={['Suprema', 'GGNetwork', 'PokerStars']}
        />,
      ),
    );
    const banner = screen.getByTestId('missing-platforms-banner');
    expect(banner.textContent).not.toMatch(/\+\d+ mais|\d+ mais/);
  });
});
