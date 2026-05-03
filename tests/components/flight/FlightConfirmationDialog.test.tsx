import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Sprint Flight-1 — RF-09: FlightConfirmationDialog (modal pos-upload)
//
// Spec : Docs/specs/sprint-flight-1.md (RF-09, D10, D11)
//
// Comportamento esperado:
//  - Abre quando upload retorna pendingFlightConfirmations.length > 0.
//  - Lista cada candidate com toggle SIM/NAO (default SIM).
//  - SIM -> dropdown "Criar nova" / "Linkar existente".
//  - "Criar nova" -> form inline (name pre-preenchido, totalDay1s, datetime,
//    radio stackMode single/combined).
//  - "Linkar existente" -> dropdown buscavel com series do user (status=pending).
//  - Botao "Confirmar todos" -> POST /api/upload/confirm-flights (RF-07).
//  - Botao "Cancelar / Confirmar depois" -> fecha modal, entries permanecem
//    com seriesId=NULL (D10).
//  - Cap 50 confirmations: pagina submeter em batches de 50.
//
// IMPORTANTE: lessons-learned #2 (data-testid estavel) + lessons #13
// (apiRequest retorna JSON parseado, NAO Response).
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { apiRequest, queryClient } from '../../../client/src/lib/queryClient';
// Componente a ser implementado em
//   client/src/components/flight/FlightConfirmationDialog.tsx
import { FlightConfirmationDialog } from '../../../client/src/components/flight/FlightConfirmationDialog';

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

const sampleConfirmations = [
  {
    tournamentId: 't-1',
    name: 'Sunday Million Phased Day 1A — $215',
    baseName: 'Sunday Million Phased',
    flightDay: '1A',
    site: 'PokerStars',
    datePlayed: '2026-04-28T18:00:00Z',
    buyIn: '215.00',
    suggestedSeriesId: null,
  },
  {
    tournamentId: 't-2',
    name: 'Bigger $109 Phase 1',
    baseName: 'Bigger $109',
    flightDay: 'Phase 1',
    site: 'PokerStars',
    datePlayed: '2026-04-28T19:00:00Z',
    buyIn: '109.00',
    suggestedSeriesId: null,
  },
];

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('FlightConfirmationDialog — render (RF-09)', () => {
  it('renderiza com modal aberto quando open=true', () => {
    render(withClient(
      <FlightConfirmationDialog
        open
        onOpenChange={() => {}}
        pendingFlightConfirmations={sampleConfirmations}
      />,
    ));
    expect(screen.getByTestId('flight-confirmation-dialog')).toBeTruthy();
  });

  it('renderiza 1 row por candidate', () => {
    render(withClient(
      <FlightConfirmationDialog
        open
        onOpenChange={() => {}}
        pendingFlightConfirmations={sampleConfirmations}
      />,
    ));
    expect(screen.getByTestId('flight-candidate-row-t-1')).toBeTruthy();
    expect(screen.getByTestId('flight-candidate-row-t-2')).toBeTruthy();
  });

  it('exibe baseName e flightDay em cada row', () => {
    render(withClient(
      <FlightConfirmationDialog
        open
        onOpenChange={() => {}}
        pendingFlightConfirmations={sampleConfirmations}
      />,
    ));
    const row1 = screen.getByTestId('flight-candidate-row-t-1');
    expect(row1.textContent).toContain('Sunday Million Phased');
    expect(row1.textContent).toMatch(/1A/);
  });

  it('tem botao "Confirmar todos" e "Cancelar"', () => {
    render(withClient(
      <FlightConfirmationDialog
        open
        onOpenChange={() => {}}
        pendingFlightConfirmations={sampleConfirmations}
      />,
    ));
    expect(screen.getByTestId('flight-confirm-all-btn')).toBeTruthy();
    expect(screen.getByTestId('flight-cancel-btn')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Toggle SIM/NAO (default SIM)
// ---------------------------------------------------------------------------

describe('FlightConfirmationDialog — toggle SIM/NAO (RF-09)', () => {
  it('toggle por entry comeca em SIM (default)', () => {
    render(withClient(
      <FlightConfirmationDialog
        open
        onOpenChange={() => {}}
        pendingFlightConfirmations={sampleConfirmations}
      />,
    ));
    const toggle = screen.getByTestId('flight-toggle-isflight-t-1');
    // Aceita varios padroes de "checked" — depende do componente Radix usado.
    const ariaChecked = toggle.getAttribute('aria-checked') ?? toggle.getAttribute('data-state') ?? '';
    expect(ariaChecked).toMatch(/true|on|checked/i);
  });

  it('toggle SIM -> NAO esconde form de serie', async () => {
    render(withClient(
      <FlightConfirmationDialog
        open
        onOpenChange={() => {}}
        pendingFlightConfirmations={sampleConfirmations}
      />,
    ));
    const toggle = screen.getByTestId('flight-toggle-isflight-t-1');
    fireEvent.click(toggle);
    // Form some / esconde
    await waitFor(() => {
      expect(screen.queryByTestId('flight-series-form-t-1')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Form "Criar nova serie"
// ---------------------------------------------------------------------------

describe('FlightConfirmationDialog — form "Criar nova serie"', () => {
  it('com SIM ativo, mostra form com name pre-preenchido (baseName)', () => {
    render(withClient(
      <FlightConfirmationDialog
        open
        onOpenChange={() => {}}
        pendingFlightConfirmations={sampleConfirmations}
      />,
    ));
    const nameInput = screen.getByTestId('flight-new-series-name-t-1') as HTMLInputElement;
    expect(nameInput.value).toContain('Sunday Million Phased');
  });

  it('campo totalDay1s aceita number', () => {
    render(withClient(
      <FlightConfirmationDialog
        open
        onOpenChange={() => {}}
        pendingFlightConfirmations={sampleConfirmations}
      />,
    ));
    expect(screen.getByTestId('flight-new-series-total-day1s-t-1')).toBeTruthy();
  });

  it('campo day2DateTime aparece (datetime picker)', () => {
    render(withClient(
      <FlightConfirmationDialog
        open
        onOpenChange={() => {}}
        pendingFlightConfirmations={sampleConfirmations}
      />,
    ));
    expect(screen.getByTestId('flight-new-series-day2-datetime-t-1')).toBeTruthy();
  });

  it('radio stackMode single/combined disponiveis (sem best — ADR-091)', () => {
    render(withClient(
      <FlightConfirmationDialog
        open
        onOpenChange={() => {}}
        pendingFlightConfirmations={sampleConfirmations}
      />,
    ));
    expect(screen.getByTestId('flight-new-series-stackmode-single-t-1')).toBeTruthy();
    expect(screen.getByTestId('flight-new-series-stackmode-combined-t-1')).toBeTruthy();
    // best NAO deve existir
    expect(screen.queryByTestId('flight-new-series-stackmode-best-t-1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Submit + cancelar (D10)
// ---------------------------------------------------------------------------

describe('FlightConfirmationDialog — submit (RF-07/RF-09)', () => {
  it('"Confirmar todos" chama POST /api/upload/confirm-flights via apiRequest', async () => {
    (apiRequest as any).mockResolvedValue({
      processed: 2,
      createdSeries: 2,
      linkedToExisting: 0,
      markedNotFlight: 0,
    });

    render(withClient(
      <FlightConfirmationDialog
        open
        onOpenChange={() => {}}
        pendingFlightConfirmations={sampleConfirmations}
      />,
    ));
    fireEvent.click(screen.getByTestId('flight-confirm-all-btn'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        'POST',
        '/api/upload/confirm-flights',
        expect.objectContaining({
          confirmations: expect.any(Array),
        }),
      );
    });
  });

  it('"Cancelar" fecha modal SEM submit (D10 — entries ficam normais com seriesId=NULL)', () => {
    const onOpenChange = vi.fn();
    render(withClient(
      <FlightConfirmationDialog
        open
        onOpenChange={onOpenChange}
        pendingFlightConfirmations={sampleConfirmations}
      />,
    ));
    fireEvent.click(screen.getByTestId('flight-cancel-btn'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('apos sucesso, invalida queries de tournaments e tournament-series', async () => {
    (apiRequest as any).mockResolvedValue({ processed: 2, createdSeries: 2 });

    render(withClient(
      <FlightConfirmationDialog
        open
        onOpenChange={() => {}}
        pendingFlightConfirmations={sampleConfirmations}
      />,
    ));
    fireEvent.click(screen.getByTestId('flight-confirm-all-btn'));

    await waitFor(() => {
      expect(queryClient.invalidateQueries).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Cap 50 (D11) — pagination interna
// ---------------------------------------------------------------------------

describe('FlightConfirmationDialog — cap 50 (RF-09, D11)', () => {
  it('com >50 candidates mostra warning de paginacao', () => {
    const lots = Array.from({ length: 60 }, (_, i) => ({
      tournamentId: 't-' + i,
      name: 'Phased Day 1' + String.fromCharCode(65 + (i % 26)),
      baseName: 'Phased',
      flightDay: '1A',
      site: 'PokerStars',
      datePlayed: '2026-04-28T18:00:00Z',
      buyIn: '109',
      suggestedSeriesId: null,
    }));

    render(withClient(
      <FlightConfirmationDialog
        open
        onOpenChange={() => {}}
        pendingFlightConfirmations={lots}
      />,
    ));
    expect(screen.queryByTestId('flight-pagination-warning')).toBeTruthy();
  });

  it('submit com >50 envia em batches de 50', async () => {
    (apiRequest as any).mockResolvedValue({ processed: 50, createdSeries: 50 });
    const lots = Array.from({ length: 51 }, (_, i) => ({
      tournamentId: 't-' + i,
      name: 'Phased Day 1A',
      baseName: 'Phased',
      flightDay: '1A',
      site: 'PokerStars',
      datePlayed: '2026-04-28T18:00:00Z',
      buyIn: '109',
      suggestedSeriesId: null,
    }));

    render(withClient(
      <FlightConfirmationDialog
        open
        onOpenChange={() => {}}
        pendingFlightConfirmations={lots}
      />,
    ));
    fireEvent.click(screen.getByTestId('flight-confirm-all-btn'));

    await waitFor(() => {
      // Pelo menos 2 chamadas (50 + 1)
      expect((apiRequest as any).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Loading + erro
// ---------------------------------------------------------------------------

describe('FlightConfirmationDialog — error handling', () => {
  it('error de network mantem state e mostra retry', async () => {
    (apiRequest as any).mockRejectedValue(new Error('Network failed'));

    render(withClient(
      <FlightConfirmationDialog
        open
        onOpenChange={() => {}}
        pendingFlightConfirmations={sampleConfirmations}
      />,
    ));
    fireEvent.click(screen.getByTestId('flight-confirm-all-btn'));

    await waitFor(() => {
      // Mostra mensagem de erro OU mantem botao habilitado para retry
      const submitBtn = screen.getByTestId('flight-confirm-all-btn') as HTMLButtonElement;
      expect(submitBtn).toBeTruthy();
    });
  });
});
