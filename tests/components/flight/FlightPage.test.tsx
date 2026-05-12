import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Sprint Flight-1 — RF-10: Pagina /flight + sidebar item
//
// Spec : Docs/specs/sprint-flight-1.md (RF-10, D14)
//
// Comportamento:
//  - Rota /flight registrada em Wouter (testada via App.test ou rota separada)
//  - Sidebar tem item "Flight" sob FERRAMENTAS, icone Layers (D14)
//  - Pagina renderiza:
//     * Header com titulo + "Adicionar Series Retroativo"
//     * Tabs "Pendentes" / "Concluidas" / "Canceladas" / "Todas"
//     * Cards de series com metadata + ações
//  - useQuery(['tournament-series', { status }]) faz fetch
//  - Empty state com CTA quando lista vazia
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { apiRequest } from '../../../client/src/lib/queryClient';
// Componente esperado em client/src/pages/Flight.tsx
import FlightPage from '../../../client/src/pages/Flight';

function withClient(ui: React.ReactNode, queryFn?: any) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: queryFn ?? (async () => []),
      },
    },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

const samplePendingSeries = [
  {
    id: 'srs-1',
    userId: 'USER-0001',
    name: 'Sunday Million Phased',
    network: 'PokerStars',
    totalDay1s: 17,
    day2DateTime: '2026-05-10T19:00:00Z',
    day2Status: 'pending',
    stackMode: 'combined',
    notes: null,
    createdAt: '2026-04-28T00:00:00Z',
    updatedAt: '2026-04-28T00:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('FlightPage — render (RF-10)', () => {
  it('renderiza header com titulo "Flight" e botao de back-fill', () => {
    render(withClient(<FlightPage />));
    expect(screen.getByTestId('flight-page-header')).toBeTruthy();
    expect(screen.getByTestId('flight-page-backfill-btn')).toBeTruthy();
  });

  it('renderiza tabs Pendentes / Concluidas / Canceladas / Todas', () => {
    render(withClient(<FlightPage />));
    expect(screen.getByTestId('flight-tab-pending')).toBeTruthy();
    expect(screen.getByTestId('flight-tab-completed')).toBeTruthy();
    expect(screen.getByTestId('flight-tab-cancelled')).toBeTruthy();
    expect(screen.getByTestId('flight-tab-all')).toBeTruthy();
  });

  it('renderiza card por serie quando query retorna data', async () => {
    render(withClient(
      <FlightPage />,
      async () => samplePendingSeries,
    ));

    await waitFor(() => {
      expect(screen.getByTestId('flight-series-card-srs-1')).toBeTruthy();
    });
  });

  it('card mostra nome, network, status pill, stackMode badge', async () => {
    render(withClient(
      <FlightPage />,
      async () => samplePendingSeries,
    ));

    await waitFor(() => {
      const card = screen.getByTestId('flight-series-card-srs-1');
      expect(card.textContent).toContain('Sunday Million Phased');
      expect(card.textContent).toMatch(/PokerStars|Combined|Pending|combined/i);
    });
  });

  it('card mostra "X / N Day 1s pagos"', async () => {
    render(withClient(
      <FlightPage />,
      async () => samplePendingSeries,
    ));
    await waitFor(() => {
      const card = screen.getByTestId('flight-series-card-srs-1');
      // Format: "0 / 17 Day 1s pagos" ou similar
      expect(card.textContent).toMatch(/0\s*\/\s*17/);
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('FlightPage — empty state', () => {
  it('mostra empty state com CTA quando lista vazia', async () => {
    render(withClient(
      <FlightPage />,
      async () => [],
    ));

    await waitFor(() => {
      expect(screen.getByTestId('flight-empty-state')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Tabs filtram via query
// ---------------------------------------------------------------------------

describe('FlightPage — tabs filtram lista (RF-10)', () => {
  it('tab "Concluidas" muda filter para status=completed', async () => {
    let lastQueryKey: any = null;
    const queryFn = async ({ queryKey }: any) => {
      lastQueryKey = queryKey;
      return [];
    };

    render(withClient(<FlightPage />, queryFn));

    await waitFor(() => expect(lastQueryKey).toBeTruthy());

    fireEvent.click(screen.getByTestId('flight-tab-completed'));

    await waitFor(() => {
      const key = JSON.stringify(lastQueryKey);
      expect(key).toMatch(/completed/);
    });
  });
});

// ---------------------------------------------------------------------------
// Sidebar item (D14)
// ---------------------------------------------------------------------------

describe('Sidebar — item "Flight" (RF-10, D14)', () => {
  it('Sidebar inclui item "Flight" sob FERRAMENTAS', async () => {
    // Componente esperado: client/src/components/layout/Sidebar.tsx OU
    // Sidebar.tsx no diretorio raiz de pages.
    const SidebarMod = await import('../../../client/src/components/layout/Sidebar');
    const Sidebar = (SidebarMod as any).default ?? (SidebarMod as any).Sidebar;
    if (!Sidebar) throw new Error('Sidebar component not exported');

    render(withClient(<Sidebar />));
    // O item Flight aponta pra /coach?tab=flights (coach-page-reform-1), entao o
    // testid derivado do path mudou. Validamos pelo label, que e estavel.
    expect(screen.getByText('Flight')).toBeTruthy();
  });
});
