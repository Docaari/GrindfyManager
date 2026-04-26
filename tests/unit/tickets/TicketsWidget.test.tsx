import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD: client/src/components/dashboard/TicketsWidget.tsx (RF-04)
//
// Fonte: docs/specs/satellite-tickets-management.md (RF-04)
//
// Contrato:
//  - useQuery(['/api/tickets', {status:'available'}]).
//  - Empty state com CTA "Registrar manualmente" abre RegisterTicketDialog.
//  - Lista cards com targetName/targetSite/ticketValueUSD/earnedAt humanizado.
//  - Badge "Expira em Xd" quando expiresAt < 7d.
//  - Badge "Hoje!" quando expiresAt < 24h.
//  - Ordenacao: expiresAt ASC NULLS LAST.
//  - Acao "Cancelar" por card (PATCH /api/tickets/:id/cancel) com confirm dialog.
//  - Card destacado (border vermelho) quando expiresAt < 24h.
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { apiRequest, queryClient } from '../../../client/src/lib/queryClient';
import { TicketsWidget } from '../../../client/src/components/dashboard/TicketsWidget';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

const NOW = new Date('2026-04-26T12:00:00Z').getTime();

function fixedDate(offsetMs: number) {
  return new Date(NOW + offsetMs).toISOString();
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('TicketsWidget - empty state', () => {
  it('quando nao ha tickets ativos, mostra empty state', async () => {
    (apiRequest as any).mockResolvedValue({ tickets: [] });

    render(withClient(<TicketsWidget />));

    await waitFor(() => {
      expect(screen.getByTestId('tickets-widget-empty')).toBeTruthy();
    });
  });

  it('empty state tem CTA "Registrar manualmente"', async () => {
    (apiRequest as any).mockResolvedValue({ tickets: [] });

    render(withClient(<TicketsWidget />));

    await waitFor(() => {
      expect(screen.getByTestId('tickets-widget-empty-cta')).toBeTruthy();
    });
  });

  it('clicar na CTA empty abre RegisterTicketDialog', async () => {
    (apiRequest as any).mockResolvedValue({ tickets: [] });

    render(withClient(<TicketsWidget />));

    await waitFor(() => screen.getByTestId('tickets-widget-empty-cta'));
    fireEvent.click(screen.getByTestId('tickets-widget-empty-cta'));

    await waitFor(() => {
      expect(screen.getByTestId('register-ticket-dialog')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Lista de tickets
// ---------------------------------------------------------------------------

describe('TicketsWidget - list', () => {
  it('renderiza um card por ticket ativo (testid tickets-widget-card-:id)', async () => {
    (apiRequest as any).mockResolvedValue({
      tickets: [
        {
          id: 'tkt-1', status: 'available',
          targetName: 'WSOP ME', targetSite: 'GG',
          ticketValueUSD: '215',
          earnedAt: fixedDate(-3 * 24 * 60 * 60 * 1000),
          expiresAt: null,
        },
        {
          id: 'tkt-2', status: 'available',
          targetName: 'Sunday Storm', targetSite: 'PokerStars',
          ticketValueUSD: '109',
          earnedAt: fixedDate(-1 * 24 * 60 * 60 * 1000),
          expiresAt: fixedDate(5 * 24 * 60 * 60 * 1000),
        },
      ],
    });

    render(withClient(<TicketsWidget />));

    await waitFor(() => {
      expect(screen.getByTestId('tickets-widget-card-tkt-1')).toBeTruthy();
      expect(screen.getByTestId('tickets-widget-card-tkt-2')).toBeTruthy();
    });
  });

  it('cada card mostra targetName, targetSite e ticketValueUSD', async () => {
    (apiRequest as any).mockResolvedValue({
      tickets: [
        {
          id: 'tkt-1', status: 'available',
          targetName: 'WSOP ME', targetSite: 'GG',
          ticketValueUSD: '215',
          earnedAt: fixedDate(-3 * 24 * 60 * 60 * 1000),
          expiresAt: null,
        },
      ],
    });

    render(withClient(<TicketsWidget />));

    await waitFor(() => {
      const card = screen.getByTestId('tickets-widget-card-tkt-1');
      expect(card.textContent).toMatch(/WSOP ME/);
      expect(card.textContent).toMatch(/GG/);
      expect(card.textContent).toMatch(/215/);
    });
  });

  it('badge "Expira em Xd" quando expiresAt < 7d e > 24h', async () => {
    (apiRequest as any).mockResolvedValue({
      tickets: [
        {
          id: 'tkt-soon', status: 'available',
          targetName: 'X', targetSite: 'GG', ticketValueUSD: '10',
          earnedAt: fixedDate(-1 * 24 * 60 * 60 * 1000),
          expiresAt: fixedDate(3 * 24 * 60 * 60 * 1000), // 3d
        },
      ],
    });

    render(withClient(<TicketsWidget />));

    await waitFor(() => {
      const badge = screen.getByTestId('tickets-widget-card-tkt-soon-expires-badge');
      expect(badge.textContent).toMatch(/3|expira/i);
    });
  });

  it('badge "Hoje!" quando expiresAt < 24h', async () => {
    (apiRequest as any).mockResolvedValue({
      tickets: [
        {
          id: 'tkt-today', status: 'available',
          targetName: 'X', targetSite: 'GG', ticketValueUSD: '10',
          earnedAt: fixedDate(-1 * 24 * 60 * 60 * 1000),
          expiresAt: fixedDate(6 * 60 * 60 * 1000), // 6h
        },
      ],
    });

    render(withClient(<TicketsWidget />));

    await waitFor(() => {
      const badge = screen.getByTestId('tickets-widget-card-tkt-today-expires-badge');
      expect(badge.textContent).toMatch(/hoje|today/i);
    });
  });

  it('card com expiresAt < 24h tem destaque (border vermelho via classe)', async () => {
    (apiRequest as any).mockResolvedValue({
      tickets: [
        {
          id: 'tkt-urgent', status: 'available',
          targetName: 'X', targetSite: 'GG', ticketValueUSD: '10',
          earnedAt: fixedDate(-1 * 24 * 60 * 60 * 1000),
          expiresAt: fixedDate(2 * 60 * 60 * 1000), // 2h
        },
      ],
    });

    render(withClient(<TicketsWidget />));

    await waitFor(() => {
      const card = screen.getByTestId('tickets-widget-card-tkt-urgent');
      // Convencao: classe contem 'border-red' ou data-urgent='true' quando <24h
      const isUrgent =
        /border-red|red|urgent/i.test(card.className) ||
        card.getAttribute('data-urgent') === 'true';
      expect(isUrgent).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Ordenacao
// ---------------------------------------------------------------------------

describe('TicketsWidget - ordenacao', () => {
  it('ordena por expiresAt ASC NULLS LAST', async () => {
    (apiRequest as any).mockResolvedValue({
      tickets: [
        {
          id: 'tkt-late', targetName: 'L', targetSite: 'GG', ticketValueUSD: '10',
          status: 'available',
          earnedAt: fixedDate(-7 * 24 * 60 * 60 * 1000),
          expiresAt: fixedDate(10 * 24 * 60 * 60 * 1000),
        },
        {
          id: 'tkt-noexp', targetName: 'N', targetSite: 'GG', ticketValueUSD: '10',
          status: 'available',
          earnedAt: fixedDate(-2 * 24 * 60 * 60 * 1000),
          expiresAt: null,
        },
        {
          id: 'tkt-soon', targetName: 'S', targetSite: 'GG', ticketValueUSD: '10',
          status: 'available',
          earnedAt: fixedDate(-1 * 24 * 60 * 60 * 1000),
          expiresAt: fixedDate(2 * 24 * 60 * 60 * 1000),
        },
      ],
    });

    render(withClient(<TicketsWidget />));

    await waitFor(() => {
      const list = screen.getByTestId('tickets-widget-list');
      // A primeira card deve ser tkt-soon, depois tkt-late, depois tkt-noexp.
      const cards = list.querySelectorAll('[data-testid^="tickets-widget-card-"]');
      const ids = Array.from(cards).map((c) =>
        c.getAttribute('data-testid')!.replace('tickets-widget-card-', ''),
      );
      expect(ids).toEqual(['tkt-soon', 'tkt-late', 'tkt-noexp']);
    });
  });
});

// ---------------------------------------------------------------------------
// Cancelar ticket
// ---------------------------------------------------------------------------

describe('TicketsWidget - cancel action', () => {
  it('clicar em Cancelar abre AlertDialog de confirmacao (nao chama API ainda)', async () => {
    (apiRequest as any).mockResolvedValue({
      tickets: [
        {
          id: 'tkt-1', status: 'available',
          targetName: 'X', targetSite: 'GG', ticketValueUSD: '50',
          earnedAt: fixedDate(-1 * 24 * 60 * 60 * 1000),
          expiresAt: null,
        },
      ],
    });

    render(withClient(<TicketsWidget />));

    await waitFor(() => screen.getByTestId('tickets-widget-card-tkt-1'));

    fireEvent.click(screen.getByTestId('tickets-widget-card-tkt-1-cancel-button'));

    await waitFor(() => {
      expect(screen.getByTestId('tickets-widget-cancel-confirm-dialog')).toBeTruthy();
    });

    // PATCH ainda nao foi chamado
    expect((apiRequest as any).mock.calls.filter((c: any) =>
      (c[0] === 'PATCH') || (typeof c[0] === 'string' && c[0].includes('cancel')),
    ).length).toBe(0);
  });

  it('confirmar no dialog chama PATCH /api/tickets/:id/cancel e invalida query', async () => {
    (apiRequest as any).mockImplementation((method: string, url: string) => {
      if (url?.includes('/cancel')) {
        return Promise.resolve({ ticket: { id: 'tkt-1', status: 'cancelled' } });
      }
      return Promise.resolve({
        tickets: [
          {
            id: 'tkt-1', status: 'available',
            targetName: 'X', targetSite: 'GG', ticketValueUSD: '50',
            earnedAt: fixedDate(-1 * 24 * 60 * 60 * 1000),
            expiresAt: null,
          },
        ],
      });
    });

    render(withClient(<TicketsWidget />));
    await waitFor(() => screen.getByTestId('tickets-widget-card-tkt-1'));

    fireEvent.click(screen.getByTestId('tickets-widget-card-tkt-1-cancel-button'));
    await waitFor(() => screen.getByTestId('tickets-widget-cancel-confirm-dialog'));

    fireEvent.click(screen.getByTestId('tickets-widget-cancel-confirm-button'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        'PATCH',
        expect.stringContaining('/api/tickets/tkt-1/cancel'),
        expect.any(Object),
      );
    });

    await waitFor(() => {
      expect((queryClient as any).invalidateQueries).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: expect.arrayContaining(['/api/tickets']) }),
      );
    });
  });

  it('cancelar no dialog (botao "Manter") NAO chama PATCH', async () => {
    (apiRequest as any).mockResolvedValue({
      tickets: [
        {
          id: 'tkt-1', status: 'available',
          targetName: 'X', targetSite: 'GG', ticketValueUSD: '50',
          earnedAt: fixedDate(-1 * 24 * 60 * 60 * 1000),
          expiresAt: null,
        },
      ],
    });

    render(withClient(<TicketsWidget />));
    await waitFor(() => screen.getByTestId('tickets-widget-card-tkt-1'));

    fireEvent.click(screen.getByTestId('tickets-widget-card-tkt-1-cancel-button'));
    await waitFor(() => screen.getByTestId('tickets-widget-cancel-confirm-dialog'));

    fireEvent.click(screen.getByTestId('tickets-widget-cancel-keep-button'));

    await waitFor(() => {
      const cancelCall = (apiRequest as any).mock.calls.find(
        (c: any) => typeof c[1] === 'string' && c[1].includes('/cancel'),
      );
      expect(cancelCall).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Header CTA "Registrar manualmente"
// ---------------------------------------------------------------------------

describe('TicketsWidget - header', () => {
  it('header tem botao "Registrar manualmente" mesmo com tickets na lista', async () => {
    (apiRequest as any).mockResolvedValue({
      tickets: [
        {
          id: 'tkt-1', status: 'available',
          targetName: 'X', targetSite: 'GG', ticketValueUSD: '50',
          earnedAt: fixedDate(-1 * 24 * 60 * 60 * 1000),
          expiresAt: null,
        },
      ],
    });

    render(withClient(<TicketsWidget />));

    await waitFor(() => {
      expect(screen.getByTestId('tickets-widget-register-button')).toBeTruthy();
    });
  });

  it('clicar em "Registrar manualmente" no header abre RegisterTicketDialog', async () => {
    (apiRequest as any).mockResolvedValue({
      tickets: [
        {
          id: 'tkt-1', status: 'available',
          targetName: 'X', targetSite: 'GG', ticketValueUSD: '50',
          earnedAt: fixedDate(-1 * 24 * 60 * 60 * 1000),
          expiresAt: null,
        },
      ],
    });

    render(withClient(<TicketsWidget />));
    await waitFor(() => screen.getByTestId('tickets-widget-register-button'));
    fireEvent.click(screen.getByTestId('tickets-widget-register-button'));

    await waitFor(() => {
      expect(screen.getByTestId('register-ticket-dialog')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Query key & filter
// ---------------------------------------------------------------------------

describe('TicketsWidget - query', () => {
  it('chama GET /api/tickets?status=available (filtro padrao)', async () => {
    (apiRequest as any).mockResolvedValue({ tickets: [] });

    render(withClient(<TicketsWidget />));

    await waitFor(() => {
      const calls = (apiRequest as any).mock.calls;
      const url = calls.length > 0 ? (calls[0][1] ?? calls[0][0]) : '';
      expect(url).toMatch(/\/api\/tickets/);
      expect(url).toMatch(/status=available/);
    });
  });
});
