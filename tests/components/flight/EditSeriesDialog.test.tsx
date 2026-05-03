import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Sprint Flight-1 — RF-14: EditSeriesDialog (edit-in-place)
//
// Spec : Docs/specs/sprint-flight-1.md (RF-14)
//
// Comportamento:
//  - Modal com campos editaveis: name, totalDay1s, day2DateTime, stackMode,
//    notes, day2Status.
//  - Submit -> PATCH /api/tournament-series/:id.
//  - Side-effect: se day2DateTime mudou, planned_tournaments Day 2 linkado eh
//    atualizado (server faz isso — RF-14 backend).
//  - Confirmacao explicita pra mudar stackMode se serie ja completed.
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { apiRequest, queryClient } from '../../../client/src/lib/queryClient';
import { EditSeriesDialog } from '../../../client/src/components/flight/EditSeriesDialog';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: async () => [] } },
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
  totalDay1s: 17,
  day2DateTime: '2026-05-10T19:00:00Z',
  day2Status: 'pending' as const,
  stackMode: 'combined' as const,
  notes: null,
};

describe('EditSeriesDialog — render (RF-14)', () => {
  it('renderiza com modal aberto', () => {
    render(withClient(
      <EditSeriesDialog open onOpenChange={() => {}} series={sampleSeries as any} />,
    ));
    expect(screen.getByTestId('edit-series-dialog')).toBeTruthy();
  });

  it('pre-preenche campos com valores atuais', () => {
    render(withClient(
      <EditSeriesDialog open onOpenChange={() => {}} series={sampleSeries as any} />,
    ));
    const nameInput = screen.getByTestId('edit-series-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Sunday Million Phased');
    const totalInput = screen.getByTestId('edit-series-total-day1s-input') as HTMLInputElement;
    expect(totalInput.value).toBe('17');
  });
});

describe('EditSeriesDialog — submit (RF-14)', () => {
  it('submit chama PATCH /api/tournament-series/:id', async () => {
    (apiRequest as any).mockResolvedValue({ ...sampleSeries, name: 'Renamed' });

    render(withClient(
      <EditSeriesDialog open onOpenChange={() => {}} series={sampleSeries as any} />,
    ));

    const nameInput = screen.getByTestId('edit-series-name-input') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByTestId('edit-series-submit'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        'PATCH',
        '/api/tournament-series/srs-1',
        expect.objectContaining({ name: 'Renamed' }),
      );
    });
  });

  it('apos sucesso, invalida queries', async () => {
    (apiRequest as any).mockResolvedValue(sampleSeries);

    render(withClient(
      <EditSeriesDialog open onOpenChange={() => {}} series={sampleSeries as any} />,
    ));
    fireEvent.click(screen.getByTestId('edit-series-submit'));

    await waitFor(() => {
      expect(queryClient.invalidateQueries).toHaveBeenCalled();
    });
  });

  it('mudar stackMode em serie completed mostra confirm warning', async () => {
    const completedSeries = { ...sampleSeries, day2Status: 'completed' as const };
    render(withClient(
      <EditSeriesDialog open onOpenChange={() => {}} series={completedSeries as any} />,
    ));

    // Clica radio para mudar stackMode
    const singleRadio = screen.getByTestId('edit-series-stackmode-single');
    fireEvent.click(singleRadio);

    await waitFor(() => {
      expect(screen.queryByTestId('edit-series-stackmode-warning')).toBeTruthy();
    });
  });
});
