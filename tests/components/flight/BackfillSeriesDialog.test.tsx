import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Sprint Flight-1 — RF-13: BackfillSeriesDialog (criar serie retroativa)
//
// Spec : Docs/specs/sprint-flight-1.md (RF-13)
//
// Comportamento:
//  - Etapa 1: form criar serie (name, network, totalDay1s, day2DateTime, stackMode)
//  - Etapa 2: multi-select tournaments existentes (filter por site/periodo)
//  - Submit:
//     1. POST /api/tournament-series (cria serie)
//     2. Para cada tournament, PATCH /api/tournaments/:id (linkar via seriesId)
//        — Promise.all (sem endpoint batch — D8 founder)
//     3. Se algum PATCH falha, warning toast com lista de IDs nao-linkados.
//  - Apos sucesso, redirect para /flight/:newSeriesId.
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { apiRequest, queryClient } from '../../../client/src/lib/queryClient';
import { BackfillSeriesDialog } from '../../../client/src/components/flight/BackfillSeriesDialog';

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

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('BackfillSeriesDialog — render (RF-13)', () => {
  it('renderiza modal aberto', () => {
    render(withClient(
      <BackfillSeriesDialog open onOpenChange={() => {}} />,
    ));
    expect(screen.getByTestId('backfill-series-dialog')).toBeTruthy();
  });

  it('etapa 1 mostra form de criar serie', () => {
    render(withClient(
      <BackfillSeriesDialog open onOpenChange={() => {}} />,
    ));
    expect(screen.getByTestId('backfill-series-name-input')).toBeTruthy();
    expect(screen.getByTestId('backfill-series-network-input')).toBeTruthy();
    expect(screen.getByTestId('backfill-series-total-day1s-input')).toBeTruthy();
    expect(screen.getByTestId('backfill-series-day2-datetime-input')).toBeTruthy();
    // stackMode radio sem 'best' (ADR-091)
    expect(screen.getByTestId('backfill-series-stackmode-single')).toBeTruthy();
    expect(screen.getByTestId('backfill-series-stackmode-combined')).toBeTruthy();
    expect(screen.queryByTestId('backfill-series-stackmode-best')).toBeNull();
  });

  it('etapa 2 (multi-select tournaments) aparece apos serie criada', async () => {
    (apiRequest as any).mockResolvedValueOnce({
      id: 'srs-new',
      userId: 'USER-0001',
      name: 'Test Series',
    });

    render(withClient(
      <BackfillSeriesDialog open onOpenChange={() => {}} />,
    ));
    fireEvent.click(screen.getByTestId('backfill-series-create-step1-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('backfill-series-multiselect')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Submit serie (Etapa 1)
// ---------------------------------------------------------------------------

describe('BackfillSeriesDialog — Etapa 1 cria serie via POST', () => {
  it('submit chama POST /api/tournament-series', async () => {
    (apiRequest as any).mockResolvedValueOnce({ id: 'srs-x' });

    render(withClient(
      <BackfillSeriesDialog open onOpenChange={() => {}} />,
    ));
    fireEvent.click(screen.getByTestId('backfill-series-create-step1-btn'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        'POST',
        '/api/tournament-series',
        expect.any(Object),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Submit linkagem N PATCHs (Etapa 2)
// ---------------------------------------------------------------------------

describe('BackfillSeriesDialog — Etapa 2 link via N PATCHs (RF-13, D8)', () => {
  it('para cada tournament selecionado, chama PATCH /api/tournaments/:id', async () => {
    // 1a chamada: cria serie
    (apiRequest as any).mockResolvedValueOnce({ id: 'srs-new' });
    // Subsequentes: PATCHs
    (apiRequest as any).mockResolvedValue({ ok: true });

    render(withClient(
      <BackfillSeriesDialog
        open
        onOpenChange={() => {}}
        // helper test prop: pre-seleciona tournament IDs
        defaultSelectedTournamentIds={['t-1', 't-2', 't-3']}
      />,
    ));

    fireEvent.click(screen.getByTestId('backfill-series-create-step1-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('backfill-series-link-btn')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('backfill-series-link-btn'));

    await waitFor(() => {
      // 1 POST + 3 PATCHs = 4 total
      const calls = (apiRequest as any).mock.calls;
      const patchCalls = calls.filter((c: any[]) => c[0] === 'PATCH');
      expect(patchCalls.length).toBe(3);
      expect(patchCalls[0][1]).toMatch(/^\/api\/tournaments\/t-/);
    });
  });

  it('falha em 1 PATCH -> serie permanece, warning de IDs nao-linkados', async () => {
    (apiRequest as any).mockImplementation((method: string, url: string) => {
      if (method === 'POST') return Promise.resolve({ id: 'srs-x' });
      if (method === 'PATCH' && url.includes('t-fail')) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve({ ok: true });
    });

    render(withClient(
      <BackfillSeriesDialog
        open
        onOpenChange={() => {}}
        defaultSelectedTournamentIds={['t-ok', 't-fail']}
      />,
    ));

    fireEvent.click(screen.getByTestId('backfill-series-create-step1-btn'));
    await waitFor(() => screen.getByTestId('backfill-series-link-btn'));
    fireEvent.click(screen.getByTestId('backfill-series-link-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('backfill-series-partial-warning')).toBeTruthy();
    });
  });
});
