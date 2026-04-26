import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD: client/src/components/tickets/RegisterTicketDialog.tsx (RF-03)
//
// Fonte: docs/specs/satellite-tickets-management.md (RF-03)
//
// Contrato esperado:
//  - Campos: targetTemplateId (autocomplete) OU targetName+targetSite;
//    ticketValueUSD (>0); earnedAt (default now); expiresAt (opcional);
//    extraCashUSD (opcional default 0); note (opcional, max 500).
//  - Submit: POST /api/tickets com source='manual'.
//  - onSuccess: invalida ['/api/tickets'], toast, fecha.
//  - onError 4xx: mostra mensagem do backend; nao fecha.
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { apiRequest, queryClient } from '../../../client/src/lib/queryClient';
import { RegisterTicketDialog } from '../../../client/src/components/tickets/RegisterTicketDialog';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('RegisterTicketDialog - render', () => {
  it('renderiza com dialog aberto', () => {
    render(withClient(
      <RegisterTicketDialog open onOpenChange={() => {}} />
    ));
    expect(screen.getByTestId('register-ticket-dialog')).toBeTruthy();
  });

  it('tem campos obrigatorios: targetName, targetSite, ticketValueUSD', () => {
    render(withClient(
      <RegisterTicketDialog open onOpenChange={() => {}} />
    ));
    expect(screen.getByTestId('register-ticket-target-name-input')).toBeTruthy();
    expect(screen.getByTestId('register-ticket-target-site-input')).toBeTruthy();
    expect(screen.getByTestId('register-ticket-value-input')).toBeTruthy();
  });

  it('tem campos opcionais: expiresAt, extraCashUSD, note', () => {
    render(withClient(
      <RegisterTicketDialog open onOpenChange={() => {}} />
    ));
    expect(screen.getByTestId('register-ticket-expires-at-input')).toBeTruthy();
    expect(screen.getByTestId('register-ticket-extra-cash-input')).toBeTruthy();
    expect(screen.getByTestId('register-ticket-note-input')).toBeTruthy();
  });

  it('tem botoes submit e cancel', () => {
    render(withClient(
      <RegisterTicketDialog open onOpenChange={() => {}} />
    ));
    expect(screen.getByTestId('register-ticket-submit')).toBeTruthy();
    expect(screen.getByTestId('register-ticket-cancel')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Validacao client-side
// ---------------------------------------------------------------------------

describe('RegisterTicketDialog - validacao client-side', () => {
  it('submit com ticketValueUSD vazio -> erro inline, NAO chama API', async () => {
    render(withClient(
      <RegisterTicketDialog open onOpenChange={() => {}} />
    ));

    fireEvent.change(screen.getByTestId('register-ticket-target-name-input'), {
      target: { value: 'WSOP ME' },
    });
    fireEvent.click(screen.getByTestId('register-ticket-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('register-ticket-value-error')).toBeTruthy();
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('submit com ticketValueUSD = 0 -> erro inline', async () => {
    render(withClient(
      <RegisterTicketDialog open onOpenChange={() => {}} />
    ));

    fireEvent.change(screen.getByTestId('register-ticket-target-name-input'), {
      target: { value: 'WSOP ME' },
    });
    fireEvent.change(screen.getByTestId('register-ticket-value-input'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByTestId('register-ticket-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('register-ticket-value-error')).toBeTruthy();
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('submit com ticketValueUSD negativo -> erro inline', async () => {
    render(withClient(
      <RegisterTicketDialog open onOpenChange={() => {}} />
    ));

    fireEvent.change(screen.getByTestId('register-ticket-target-name-input'), {
      target: { value: 'WSOP ME' },
    });
    fireEvent.change(screen.getByTestId('register-ticket-value-input'), {
      target: { value: '-5' },
    });
    fireEvent.click(screen.getByTestId('register-ticket-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('register-ticket-value-error')).toBeTruthy();
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('submit sem targetName E sem targetTemplateId -> erro inline', async () => {
    render(withClient(
      <RegisterTicketDialog open onOpenChange={() => {}} />
    ));

    fireEvent.change(screen.getByTestId('register-ticket-value-input'), {
      target: { value: '215' },
    });
    fireEvent.click(screen.getByTestId('register-ticket-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('register-ticket-target-error')).toBeTruthy();
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('submit com expiresAt < earnedAt -> erro inline', async () => {
    render(withClient(
      <RegisterTicketDialog open onOpenChange={() => {}} />
    ));

    fireEvent.change(screen.getByTestId('register-ticket-target-name-input'), {
      target: { value: 'WSOP ME' },
    });
    fireEvent.change(screen.getByTestId('register-ticket-value-input'), {
      target: { value: '215' },
    });
    fireEvent.change(screen.getByTestId('register-ticket-expires-at-input'), {
      target: { value: '2020-01-01' }, // muito no passado
    });
    fireEvent.click(screen.getByTestId('register-ticket-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('register-ticket-expires-error')).toBeTruthy();
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Submit success
// ---------------------------------------------------------------------------

describe('RegisterTicketDialog - submit success', () => {
  it('submit valido chama POST /api/tickets com source=manual', async () => {
    (apiRequest as any).mockResolvedValue({
      ticket: { id: 'tkt-1', status: 'available' },
      walletTransaction: null,
    });

    render(withClient(
      <RegisterTicketDialog open onOpenChange={() => {}} />
    ));

    fireEvent.change(screen.getByTestId('register-ticket-target-name-input'), {
      target: { value: 'WSOP ME' },
    });
    fireEvent.change(screen.getByTestId('register-ticket-target-site-input'), {
      target: { value: 'GG' },
    });
    fireEvent.change(screen.getByTestId('register-ticket-value-input'), {
      target: { value: '215' },
    });
    fireEvent.click(screen.getByTestId('register-ticket-submit'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        'POST',
        expect.stringContaining('/api/tickets'),
        expect.objectContaining({
          source: 'manual',
          ticketValueUSD: 215,
          targetName: 'WSOP ME',
          targetSite: 'GG',
        }),
      );
    });
  });

  it('submit invalida query [/api/tickets] em sucesso', async () => {
    (apiRequest as any).mockResolvedValue({
      ticket: { id: 'tkt-1', status: 'available' },
      walletTransaction: null,
    });

    render(withClient(
      <RegisterTicketDialog open onOpenChange={() => {}} />
    ));

    fireEvent.change(screen.getByTestId('register-ticket-target-name-input'), {
      target: { value: 'WSOP ME' },
    });
    fireEvent.change(screen.getByTestId('register-ticket-value-input'), {
      target: { value: '215' },
    });
    fireEvent.click(screen.getByTestId('register-ticket-submit'));

    await waitFor(() => {
      expect((queryClient as any).invalidateQueries).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: expect.arrayContaining(['/api/tickets']) }),
      );
    });
  });

  it('submit valido fecha o dialog (chama onOpenChange(false))', async () => {
    (apiRequest as any).mockResolvedValue({
      ticket: { id: 'tkt-1', status: 'available' },
      walletTransaction: null,
    });

    const onOpenChange = vi.fn();
    render(withClient(
      <RegisterTicketDialog open onOpenChange={onOpenChange} />
    ));

    fireEvent.change(screen.getByTestId('register-ticket-target-name-input'), {
      target: { value: 'WSOP ME' },
    });
    fireEvent.change(screen.getByTestId('register-ticket-value-input'), {
      target: { value: '215' },
    });
    fireEvent.click(screen.getByTestId('register-ticket-submit'));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Submit error
// ---------------------------------------------------------------------------

describe('RegisterTicketDialog - submit error', () => {
  it('erro 400 do backend mostra mensagem inline (sem fechar dialog)', async () => {
    (apiRequest as any).mockRejectedValue({
      statusCode: 400,
      message: 'Validation failed',
    });

    const onOpenChange = vi.fn();
    render(withClient(
      <RegisterTicketDialog open onOpenChange={onOpenChange} />
    ));

    fireEvent.change(screen.getByTestId('register-ticket-target-name-input'), {
      target: { value: 'WSOP ME' },
    });
    fireEvent.change(screen.getByTestId('register-ticket-value-input'), {
      target: { value: '215' },
    });
    fireEvent.click(screen.getByTestId('register-ticket-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('register-ticket-server-error')).toBeTruthy();
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

// ---------------------------------------------------------------------------
// Pre-fill (race recovery: ResultDialog satellite que falhou pode reabrir
// este dialog ja preenchido com dados do satelite)
// ---------------------------------------------------------------------------

describe('RegisterTicketDialog - pre-fill', () => {
  it('aceita prop initialValues com targetName/ticketValueUSD/extraCashUSD pre-preenchidos', () => {
    render(withClient(
      <RegisterTicketDialog
        open
        onOpenChange={() => {}}
        initialValues={{
          targetName: 'WSOP Main Event',
          targetSite: 'GG',
          ticketValueUSD: 215,
          extraCashUSD: 30,
          note: 'Vindo do satelite #st-1',
        }}
      />
    ));

    const nameInput = screen.getByTestId('register-ticket-target-name-input') as HTMLInputElement;
    const siteInput = screen.getByTestId('register-ticket-target-site-input') as HTMLInputElement;
    const valueInput = screen.getByTestId('register-ticket-value-input') as HTMLInputElement;
    const extraInput = screen.getByTestId('register-ticket-extra-cash-input') as HTMLInputElement;

    expect(nameInput.value).toBe('WSOP Main Event');
    expect(siteInput.value).toBe('GG');
    expect(valueInput.value).toMatch(/215/);
    expect(extraInput.value).toMatch(/30/);
  });
});
