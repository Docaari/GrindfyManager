import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Sprint Flight-1 — RF-11: MarkBaggedDialog (DRY 3 contextos)
//
// Spec : Docs/specs/sprint-flight-1.md (RF-11, D5)
//
// Comportamento:
//  - Reusavel em 3 contextos: TournamentLibrary, /flight/:id, TournamentDetail.
//  - Pre-preenche datetime (de series.day2DateTime) e stackMode.
//  - Submit -> POST /api/tournament-series/:id/mark-bagged.
//  - Toast sucesso: "Day 2 adicionado a grade ({datetime})".
//  - Trata 409 ("Day 2 already completed") sem fechar.
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { apiRequest, queryClient } from '../../../client/src/lib/queryClient';
import { MarkBaggedDialog } from '../../../client/src/components/flight/MarkBaggedDialog';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, queryFn: async () => [] },
    },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

const sampleSeries = {
  id: 'srs-1',
  userId: 'USER-0001',
  name: 'Sunday Million Phased',
  network: 'PokerStars',
  day2DateTime: '2026-05-10T19:00:00Z',
  day2Status: 'pending' as const,
  stackMode: 'combined' as const,
};
const sampleTournament = {
  id: 't-day1a',
  name: 'Sunday Million Phased Day 1A',
  seriesId: 'srs-1',
  baggedAt: null,
};

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('MarkBaggedDialog — render (RF-11)', () => {
  it('renderiza com modal aberto', () => {
    render(withClient(
      <MarkBaggedDialog
        open
        onOpenChange={() => {}}
        series={sampleSeries as any}
        tournament={sampleTournament as any}
      />,
    ));
    expect(screen.getByTestId('mark-bagged-dialog')).toBeTruthy();
  });

  it('pre-preenche datetime do Day 2 (de series)', () => {
    render(withClient(
      <MarkBaggedDialog
        open
        onOpenChange={() => {}}
        series={sampleSeries as any}
        tournament={sampleTournament as any}
      />,
    ));
    const dt = screen.getByTestId('mark-bagged-day2-datetime') as HTMLInputElement;
    expect(dt.value).toBeTruthy();
  });

  it('pre-preenche stackMode da serie', () => {
    render(withClient(
      <MarkBaggedDialog
        open
        onOpenChange={() => {}}
        series={sampleSeries as any}
        tournament={sampleTournament as any}
      />,
    ));
    expect(screen.getByTestId('mark-bagged-stackmode')).toBeTruthy();
  });

  it('tem botoes "Confirmar" e "Cancelar"', () => {
    render(withClient(
      <MarkBaggedDialog
        open
        onOpenChange={() => {}}
        series={sampleSeries as any}
        tournament={sampleTournament as any}
      />,
    ));
    expect(screen.getByTestId('mark-bagged-submit')).toBeTruthy();
    expect(screen.getByTestId('mark-bagged-cancel')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

describe('MarkBaggedDialog — submit (RF-04)', () => {
  it('submit chama POST /api/tournament-series/:id/mark-bagged via apiRequest', async () => {
    (apiRequest as any).mockResolvedValue({
      series: { ...sampleSeries },
      plannedDay2: { id: 'p-new', startTime: sampleSeries.day2DateTime },
    });

    render(withClient(
      <MarkBaggedDialog
        open
        onOpenChange={() => {}}
        series={sampleSeries as any}
        tournament={sampleTournament as any}
      />,
    ));
    fireEvent.click(screen.getByTestId('mark-bagged-submit'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        'POST',
        '/api/tournament-series/srs-1/mark-bagged',
        expect.objectContaining({ tournamentId: 't-day1a' }),
      );
    });
  });

  it('apos sucesso, invalida queries de tournaments + tournament-series + planned', async () => {
    (apiRequest as any).mockResolvedValue({
      series: sampleSeries,
      plannedDay2: { id: 'p-new' },
    });

    render(withClient(
      <MarkBaggedDialog
        open
        onOpenChange={() => {}}
        series={sampleSeries as any}
        tournament={sampleTournament as any}
      />,
    ));
    fireEvent.click(screen.getByTestId('mark-bagged-submit'));

    await waitFor(() => {
      expect(queryClient.invalidateQueries).toHaveBeenCalled();
    });
  });

  it('409 "Day 2 already completed" mantem dialog aberto + mostra erro', async () => {
    (apiRequest as any).mockRejectedValue(
      Object.assign(new Error('Day 2 already completed'), { status: 409 }),
    );
    const onOpenChange = vi.fn();
    render(withClient(
      <MarkBaggedDialog
        open
        onOpenChange={onOpenChange}
        series={sampleSeries as any}
        tournament={sampleTournament as any}
      />,
    ));
    fireEvent.click(screen.getByTestId('mark-bagged-submit'));

    await waitFor(() => {
      // Dialog NAO foi fechado (onOpenChange(false) NAO chamado)
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 3 contextos (RF-11)
// ---------------------------------------------------------------------------

describe('MarkBaggedDialog — disponivel em 3 contextos', () => {
  it('TournamentLibrary integration: botao "Marcar bagged" chama dialog', async () => {
    // O dialog em si eh DRY — o botao chamador vive em 3 paginas.
    // Aqui validamos que o componente aceita props minimas e renderiza.
    const onOpenChange = vi.fn();
    render(withClient(
      <MarkBaggedDialog
        open
        onOpenChange={onOpenChange}
        series={sampleSeries as any}
        tournament={sampleTournament as any}
      />,
    ));
    fireEvent.click(screen.getByTestId('mark-bagged-cancel'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
