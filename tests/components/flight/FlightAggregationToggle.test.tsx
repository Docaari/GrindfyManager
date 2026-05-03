import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Sprint Flight-1 — RF-16: FlightAggregationToggle
//
// Spec : Docs/specs/sprint-flight-1.md (RF-16, D13)
//
// Comportamento:
//  - Toggle com 2 opcoes: "Agregar series" (default) | "Expandir entries".
//  - Persistido em user_settings.reportsExpandFlightSeries via PATCH.
//  - Mudanca trigger refetch das queries de reports.
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { apiRequest, queryClient } from '../../../client/src/lib/queryClient';
import { FlightAggregationToggle } from '../../../client/src/components/flight/FlightAggregationToggle';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: async () => ({}) } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FlightAggregationToggle — render (RF-16)', () => {
  it('renderiza toggle', () => {
    render(withClient(<FlightAggregationToggle />));
    expect(screen.getByTestId('flight-aggregation-toggle')).toBeTruthy();
  });

  it('mostra opcao "Agregar" e "Expandir"', () => {
    render(withClient(<FlightAggregationToggle />));
    expect(screen.getByTestId('flight-aggregation-aggregate')).toBeTruthy();
    expect(screen.getByTestId('flight-aggregation-expand')).toBeTruthy();
  });
});

describe('FlightAggregationToggle — submit (RF-16, D13)', () => {
  it('clicar "Expandir" chama PATCH /api/user/settings com reportsExpandFlightSeries=true', async () => {
    (apiRequest as any).mockResolvedValue({
      reportsExpandFlightSeries: true,
    });

    render(withClient(<FlightAggregationToggle />));
    fireEvent.click(screen.getByTestId('flight-aggregation-expand'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        'PATCH',
        expect.stringMatching(/\/api\/user\/settings|\/api\/users\/me\/settings/),
        expect.objectContaining({ reportsExpandFlightSeries: true }),
      );
    });
  });

  it('mudanca invalida queries de reports', async () => {
    (apiRequest as any).mockResolvedValue({ reportsExpandFlightSeries: true });

    render(withClient(<FlightAggregationToggle />));
    fireEvent.click(screen.getByTestId('flight-aggregation-expand'));

    await waitFor(() => {
      expect(queryClient.invalidateQueries).toHaveBeenCalled();
    });
  });
});
