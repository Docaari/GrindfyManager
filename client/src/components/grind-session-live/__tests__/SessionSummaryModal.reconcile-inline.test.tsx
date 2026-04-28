/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint B2 — M1: Reconcile Inline em SessionSummaryModal
 *
 * Spec: Docs/specs/sprint-b2-summary-inline-reconcile.md (M1)
 * ADR-047: Summary inline reconcile
 * Sequence: Docs/architecture/flows/grind/sequence-session-end-b2.mermaid (Caminho 1)
 *
 * Cenarios cobertos:
 *   1. Render secao [data-testid='bankroll-reconcile-section'] com 1 row por wallet quando
 *      bankrollManagementEnabled=true e ha matched wallets
 *   2. Inputs [data-testid='wallet-balance-input-:walletId'] pre-preenchidos com expectedClosingBalance
 *   3. Edicao de input mostra preview [data-testid='wallet-adjustment-preview-:walletId'] +/- com cor
 *   4. Click cta-start-cooldown com adjustments != 0 dispara POST /reconcile-wallets
 *      ANTES do POST /api/cooldown-logs
 *   5. Click cta-finalize-session reconcile primeiro, depois finalize
 *   6. adjustments == 0: pula POST /reconcile-wallets, telemetria reconcile_skipped_no_changes
 *   7. WalletReconciliationDialog separado NAO eh renderizado (deprecated)
 *
 * Nota TDD: o componente SessionSummaryModal atual NAO tem reconcile inline.
 * Os testes vao falhar ate o implementer adicionar:
 *   - prop `bankrollManagementEnabled: boolean`
 *   - prop `reconcilableWallets: ReconcilableWalletV2[]`
 *   - prop `missingPlatforms: string[]`
 *   - data-testid `bankroll-reconcile-section`, `wallet-balance-input-:walletId`,
 *     `wallet-adjustment-preview-:walletId`, `cta-start-cooldown`,
 *     `cta-finalize-session`
 *   - submit handler que chama POST /reconcile-wallets ANTES do CTA action
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

// useLocation Wouter — mock do setLocation usado em redirect.
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

// Wallets candidatas pre-fetched (server side já calculou expectedDelta).
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
];

const baseProps: any = {
  show: true,
  summaryData: baseSummary,
  finalNotes: '',
  setFinalNotes: vi.fn(),
  onContinueSession: vi.fn(),
  onEndSession: vi.fn(),
  // Sprint B2 props novas — implementer aceita (red ate la).
  bankrollManagementEnabled: true,
  reconcilableWallets: wallets,
  missingPlatforms: [],
  playedPlatforms: ['Suprema', 'GGNetwork'],
};

beforeEach(() => {
  apiRequestMock.mockReset();
  toastMock.mockClear();
  trackMock.mockClear();
  setLocationMock.mockClear();
});

// =============================================================================
// 1. Layout — secao Bancas com 1 row por wallet
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M1) — secao bancas inline', () => {
  it('renderiza [data-testid=bankroll-reconcile-section] quando bankrollManagementEnabled=true e ha wallets', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    expect(screen.getByTestId('bankroll-reconcile-section')).toBeInTheDocument();
  });

  it('renderiza 1 row por wallet (input + preview)', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    // Inputs por walletId
    expect(screen.getByTestId('wallet-balance-input-w_suprema')).toBeInTheDocument();
    expect(screen.getByTestId('wallet-balance-input-w_gg')).toBeInTheDocument();
    // Previews por walletId
    expect(screen.getByTestId('wallet-adjustment-preview-w_suprema')).toBeInTheDocument();
    expect(screen.getByTestId('wallet-adjustment-preview-w_gg')).toBeInTheDocument();
  });

  it('input pre-preenchido com expectedClosingBalance da wallet', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    const supremaInput = screen.getByTestId('wallet-balance-input-w_suprema') as HTMLInputElement;
    const ggInput = screen.getByTestId('wallet-balance-input-w_gg') as HTMLInputElement;
    expect(supremaInput.value).toBe('450');
    expect(ggInput.value).toBe('225');
  });

  it('NAO renderiza WalletReconciliationDialog separado (deprecated em B2)', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    expect(screen.queryByTestId('wallet-reconciliation-dialog')).toBeNull();
    expect(screen.queryByTestId('reconcile-dialog')).toBeNull();
  });
});

// =============================================================================
// 2. Preview manualAdjustment em tempo real
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M1) — preview manualAdjustment', () => {
  it('preview mostra +X.XX com cor positiva quando reportedBalance > expectedClosingBalance', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    const input = screen.getByTestId('wallet-balance-input-w_suprema') as HTMLInputElement;

    // Edita: 450 -> 470 (saldo final maior que esperado, adjustment +20)
    fireEvent.change(input, { target: { value: '470' } });

    const preview = screen.getByTestId('wallet-adjustment-preview-w_suprema');
    expect(preview.textContent).toMatch(/\+/);
    // Cor verde (positivo)
    expect(preview.getAttribute('data-tone')).toBe('positive');
  });

  it('preview mostra -X.XX com cor negativa quando reportedBalance < expectedClosingBalance', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    const input = screen.getByTestId('wallet-balance-input-w_suprema') as HTMLInputElement;

    // Edita: 450 -> 430 (saldo final menor que esperado, adjustment -20)
    fireEvent.change(input, { target: { value: '430' } });

    const preview = screen.getByTestId('wallet-adjustment-preview-w_suprema');
    expect(preview.textContent).toMatch(/-/);
    expect(preview.getAttribute('data-tone')).toBe('negative');
  });

  it('preview mostra estado neutro quando reportedBalance == expectedClosingBalance', () => {
    render(wrap(<SessionSummaryModal {...baseProps} />));
    const preview = screen.getByTestId('wallet-adjustment-preview-w_suprema');
    expect(preview.getAttribute('data-tone')).toBe('neutral');
  });
});

// =============================================================================
// 3. Submit: CTA cooldown chama reconcile ANTES de cooldown create
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M1) — submit cooldown encadeia reconcile + cooldown', () => {
  it('click cta-start-cooldown com adjustments != 0 dispara POST /reconcile-wallets ANTES do POST /api/cooldown-logs', async () => {
    // 1a chamada: POST /reconcile-wallets (response 200)
    // 2a chamada: POST /api/cooldown-logs (response com id)
    apiRequestMock
      .mockResolvedValueOnce({ snapshotsCreated: 1, txCreated: [{ id: 'tx_1' }] })
      .mockResolvedValueOnce({ id: 'cd_1' });

    render(
      wrap(
        <SessionSummaryModal
          {...baseProps}
          onStartFullCooldown={vi.fn()}
          onStartQuickCooldown={vi.fn()}
        />,
      ),
    );

    // Edita saldo da Suprema para gerar adjustment != 0
    const supremaInput = screen.getByTestId('wallet-balance-input-w_suprema') as HTMLInputElement;
    fireEvent.change(supremaInput, { target: { value: '440' } });

    // Click no CTA "Iniciar cool-down" (mode default - full ou primeiro CTA visivel)
    const cta = screen.getByTestId('cta-start-cooldown');
    fireEvent.click(cta);

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });

    // Primeira chamada deve ser reconcile-wallets
    const firstCall = apiRequestMock.mock.calls[0];
    expect(firstCall[0]).toBe('POST');
    expect(firstCall[1]).toMatch(/\/api\/grind-sessions\/ses_1\/reconcile-wallets/);

    // Segunda chamada deve ser cooldown-logs
    await waitFor(() => {
      expect(apiRequestMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    const secondCall = apiRequestMock.mock.calls[1];
    expect(secondCall[0]).toBe('POST');
    expect(secondCall[1]).toMatch(/\/api\/cooldown-logs/);
  });

  it('payload do POST /reconcile-wallets contem apenas wallets com manualAdjustment != 0', async () => {
    apiRequestMock
      .mockResolvedValueOnce({ snapshotsCreated: 1, txCreated: [] })
      .mockResolvedValueOnce({ id: 'cd_1' });

    render(
      wrap(
        <SessionSummaryModal
          {...baseProps}
          onStartFullCooldown={vi.fn()}
          onStartQuickCooldown={vi.fn()}
        />,
      ),
    );

    // Edita SO suprema (gg fica com adjustment 0)
    fireEvent.change(screen.getByTestId('wallet-balance-input-w_suprema'), {
      target: { value: '440' },
    });

    fireEvent.click(screen.getByTestId('cta-start-cooldown'));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });

    // Body do POST /reconcile-wallets eh args[2]
    const reconcileCall = apiRequestMock.mock.calls[0];
    const body = reconcileCall[2];
    // Deve incluir array adjustments — apenas suprema (manualAdjustment != 0)
    expect(body.adjustments).toBeDefined();
    expect(Array.isArray(body.adjustments)).toBe(true);
    const walletIds = body.adjustments.map((a: any) => a.walletId);
    expect(walletIds).toContain('w_suprema');
    // gg NAO entra (adjustment 0) — implementacao filtra
    expect(walletIds).not.toContain('w_gg');
  });
});

describe('SessionSummaryModal Sprint B2 (M1) — submit finalize encadeia reconcile + finalize', () => {
  it('click cta-finalize-session com adjustments != 0 dispara POST /reconcile-wallets ANTES de onEndSession', async () => {
    apiRequestMock.mockResolvedValueOnce({
      snapshotsCreated: 1,
      txCreated: [{ id: 'tx_1' }],
    });

    const onEndSession = vi.fn();
    render(
      wrap(
        <SessionSummaryModal
          {...baseProps}
          onEndSession={onEndSession}
        />,
      ),
    );

    fireEvent.change(screen.getByTestId('wallet-balance-input-w_gg'), {
      target: { value: '230' },
    });

    fireEvent.click(screen.getByTestId('cta-finalize-session'));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });

    const firstCall = apiRequestMock.mock.calls[0];
    expect(firstCall[0]).toBe('POST');
    expect(firstCall[1]).toMatch(/\/api\/grind-sessions\/ses_1\/reconcile-wallets/);

    await waitFor(() => {
      expect(onEndSession).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// 4. Adjustments == 0: pula reconcile, telemetria skip
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M1) — pula reconcile quando todos adjustments=0', () => {
  it('NAO dispara POST /reconcile-wallets quando todos inputs == expectedClosingBalance', async () => {
    apiRequestMock.mockResolvedValueOnce({ id: 'cd_1' });

    render(
      wrap(
        <SessionSummaryModal
          {...baseProps}
          onStartFullCooldown={vi.fn()}
          onStartQuickCooldown={vi.fn()}
        />,
      ),
    );

    // Sem editar nenhum input — adjustments == 0 para todas
    fireEvent.click(screen.getByTestId('cta-start-cooldown'));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });

    // Primeira (e unica esperada) chamada deve ser cooldown-logs DIRETO,
    // sem POST /reconcile-wallets antes.
    const firstCall = apiRequestMock.mock.calls[0];
    expect(firstCall[1]).toMatch(/\/api\/cooldown-logs/);

    // NENHUMA chamada para /reconcile-wallets
    const reconcileCalls = apiRequestMock.mock.calls.filter((c: any[]) =>
      typeof c[1] === 'string' && c[1].includes('/reconcile-wallets'),
    );
    expect(reconcileCalls.length).toBe(0);
  });

  it('emite telemetria summary_inline_reconcile_skipped_no_changes quando todos adjustments=0', async () => {
    apiRequestMock.mockResolvedValueOnce({ id: 'cd_1' });

    render(
      wrap(
        <SessionSummaryModal
          {...baseProps}
          onStartFullCooldown={vi.fn()}
          onStartQuickCooldown={vi.fn()}
        />,
      ),
    );

    fireEvent.click(screen.getByTestId('cta-start-cooldown'));

    await waitFor(() => {
      const skipEvent = trackMock.mock.calls.find(
        (c: any[]) => c[0] === 'summary_inline_reconcile_skipped_no_changes',
      );
      expect(skipEvent).toBeDefined();
    });
  });
});

// =============================================================================
// 5. Setting bankrollManagementEnabled=false (parcial — guarda) + 0 wallets
// =============================================================================

describe('SessionSummaryModal Sprint B2 (M1) — guardas de render', () => {
  it('NAO renderiza secao bankroll-reconcile-section quando bankrollManagementEnabled=false', () => {
    render(
      wrap(
        <SessionSummaryModal
          {...baseProps}
          bankrollManagementEnabled={false}
        />,
      ),
    );
    expect(screen.queryByTestId('bankroll-reconcile-section')).toBeNull();
  });

  it('NAO renderiza secao quando reconcilableWallets eh array vazio', () => {
    render(
      wrap(
        <SessionSummaryModal
          {...baseProps}
          reconcilableWallets={[]}
        />,
      ),
    );
    expect(screen.queryByTestId('bankroll-reconcile-section')).toBeNull();
  });
});
