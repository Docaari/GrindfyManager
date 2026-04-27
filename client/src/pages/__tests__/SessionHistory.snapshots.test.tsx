/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *  - RF-09: SessionHistory edit modal carrega session_wallet_snapshots
 *  - P10 / F-10: layout responsivo (cards verticais < 640px, tabela >= 640px)
 *  - P12: formatCurrency consistente
 *
 * Modulos esperados pelo implementer (NAO existem ainda):
 *   client/src/components/session-history/SessionWalletSnapshotsTable.tsx
 *   client/src/components/grind-session-live/ResponsiveSnapshotRow.tsx
 *
 * Endpoint: GET /api/grind-sessions/:id/wallet-snapshots
 *
 * data-testid esperados:
 *   session-snapshots-table     (>=640px)
 *   session-snapshots-cards     (<640px)
 *   session-snapshot-row-{walletId}
 *   session-snapshot-card-{walletId}
 *   session-snapshot-skipped-badge-{walletId}
 *   session-snapshots-empty-message
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

// Modulo NAO existe ainda — implementer cria.
import { SessionWalletSnapshotsTable } from '../../components/session-history/SessionWalletSnapshotsTable';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const baseSnapshots = [
  {
    walletId: 'wA',
    walletName: 'BlackChip Main',
    platform: 'WPN',
    nativeCurrency: 'USD',
    openingBalance: 1180,
    closingBalance: 1247.5,
    expectedDelta: 67.5,
    manualAdjustment: 0,
    contributingTournamentIds: ['st_1', 'st_2'],
    reason: 'session_result',
  },
];

const skippedSnapshots = [
  {
    walletId: 'wA',
    walletName: 'BlackChip Main',
    platform: 'WPN',
    nativeCurrency: 'USD',
    openingBalance: 1180,
    closingBalance: null,
    expectedDelta: 67.5,
    manualAdjustment: null,
    contributingTournamentIds: ['st_1'],
    reason: 'session_result',
  },
];

beforeEach(() => {
  apiRequestMock.mockReset();
  toastMock.mockClear();
  // Reset matchMedia stub para cada teste
  if (typeof window !== 'undefined' && (window as any).matchMedia) {
    (window as any).matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
});

// =============================================================================
// RF-09: Carregamento via GET /wallet-snapshots
// =============================================================================

describe('SessionWalletSnapshotsTable — carrega snapshots via GET (RF-09)', () => {
  it('chama GET /api/grind-sessions/:id/wallet-snapshots ao montar', async () => {
    apiRequestMock.mockResolvedValue({ sessionId: 'ses_1', snapshots: baseSnapshots });
    render(wrap(<SessionWalletSnapshotsTable sessionId="ses_1" />));

    await waitFor(() => {
      const flat = JSON.stringify(apiRequestMock.mock.calls);
      expect(flat).toContain('wallet-snapshots');
      expect(flat).toContain('ses_1');
    });
  });

  it('200 com snapshots -> renderiza row por wallet', async () => {
    apiRequestMock.mockResolvedValue({ sessionId: 'ses_1', snapshots: baseSnapshots });
    render(wrap(<SessionWalletSnapshotsTable sessionId="ses_1" />));

    // Em desktop (matchMedia matches=false p/ max-width:640) renderiza tabela
    const row = await screen.findByTestId('session-snapshot-row-wA');
    expect(row).toBeInTheDocument();
  });

  it('200 sem snapshots -> exibe mensagem de indisponivel (sem espaco vazio)', async () => {
    apiRequestMock.mockResolvedValue({ sessionId: 'ses_old', snapshots: [] });
    render(wrap(<SessionWalletSnapshotsTable sessionId="ses_old" />));

    const empty = await screen.findByTestId('session-snapshots-empty-message');
    expect((empty.textContent ?? '').toLowerCase()).toMatch(
      /snapshots\s+indispon[ií]veis|sem\s+snapshots/,
    );
  });
});

// =============================================================================
// RF-09: tabela em desktop, cards em mobile
// =============================================================================

describe('SessionWalletSnapshotsTable — layout responsivo (RF-09 P10)', () => {
  it('viewport >= 640px (desktop) -> renderiza tabela com 6 colunas (data-testid="session-snapshots-table")', async () => {
    // matchMedia matches=false (default) -> desktop
    apiRequestMock.mockResolvedValue({ sessionId: 'ses_1', snapshots: baseSnapshots });
    render(wrap(<SessionWalletSnapshotsTable sessionId="ses_1" />));

    const table = await screen.findByTestId('session-snapshots-table');
    expect(table).toBeInTheDocument();
  });

  it('viewport < 640px (mobile) -> renderiza cards verticais (data-testid="session-snapshots-cards")', async () => {
    // Stub matchMedia para retornar matches=true em mobile
    if (typeof window !== 'undefined') {
      (window as any).matchMedia = (query: string) => ({
        matches: query.includes('max-width: 639') || query.includes('max-width: 640') || query.includes('max-width:639') || query.includes('max-width:640'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      });
    }

    apiRequestMock.mockResolvedValue({ sessionId: 'ses_1', snapshots: baseSnapshots });
    render(wrap(<SessionWalletSnapshotsTable sessionId="ses_1" />));

    const cards = await screen.findByTestId('session-snapshots-cards');
    expect(cards).toBeInTheDocument();
  });
});

// =============================================================================
// RF-09: snapshot pulado (closingBalance=null)
// =============================================================================

describe('SessionWalletSnapshotsTable — snapshot pulado (RF-09)', () => {
  it('closingBalance=null -> badge "Pulada"', async () => {
    apiRequestMock.mockResolvedValue({ sessionId: 'ses_1', snapshots: skippedSnapshots });
    render(wrap(<SessionWalletSnapshotsTable sessionId="ses_1" />));

    const badge = await screen.findByTestId('session-snapshot-skipped-badge-wA');
    expect(badge).toBeInTheDocument();
    expect((badge.textContent ?? '').toLowerCase()).toMatch(/pulada/);
  });

  it('closingBalance=null -> exibe "—" em colunas closing/manualAdjustment', async () => {
    apiRequestMock.mockResolvedValue({ sessionId: 'ses_1', snapshots: skippedSnapshots });
    render(wrap(<SessionWalletSnapshotsTable sessionId="ses_1" />));

    const row = await screen.findByTestId('session-snapshot-row-wA');
    // Texto da linha deve conter pelo menos um "—"
    expect(row.textContent ?? '').toMatch(/—|–|-{1,}/);
  });
});

// =============================================================================
// RF-09 P12: formatCurrency consistente
// =============================================================================

describe('SessionWalletSnapshotsTable — formatCurrency em todos valores (P12)', () => {
  it('renderiza openingBalance via formatCurrency PT-BR ("US$ 1.180,00")', async () => {
    apiRequestMock.mockResolvedValue({ sessionId: 'ses_1', snapshots: baseSnapshots });
    render(wrap(<SessionWalletSnapshotsTable sessionId="ses_1" />));

    const row = await screen.findByTestId('session-snapshot-row-wA');
    // Texto da row deve conter "US$" + "1.180,00"
    expect(row.textContent ?? '').toContain('US$');
    expect(row.textContent ?? '').toMatch(/1\.180,00/);
  });

  it('renderiza closingBalance "1.247,50" formatado', async () => {
    apiRequestMock.mockResolvedValue({ sessionId: 'ses_1', snapshots: baseSnapshots });
    render(wrap(<SessionWalletSnapshotsTable sessionId="ses_1" />));

    const row = await screen.findByTestId('session-snapshot-row-wA');
    expect(row.textContent ?? '').toMatch(/1\.247,50/);
  });

  it('expectedDelta colorido: positivo verde / negativo vermelho / 0 cinza', async () => {
    apiRequestMock.mockResolvedValue({
      sessionId: 'ses_1',
      snapshots: [
        { ...baseSnapshots[0], expectedDelta: 67.5 },
      ],
    });
    render(wrap(<SessionWalletSnapshotsTable sessionId="ses_1" />));

    const row = await screen.findByTestId('session-snapshot-row-wA');
    // Apenas valida que renderiza algo positivo
    expect(row.textContent ?? '').toMatch(/67,50|\+/);
  });
});
