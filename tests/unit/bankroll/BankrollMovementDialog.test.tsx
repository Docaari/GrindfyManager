import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD (Sprint 2 - Bankroll): client/src/components/bankroll/BankrollMovementDialog.tsx
//
// Fonte: docs/specs/bankroll-management.md (RF-06 botao "Registrar aporte/saque")
//        docs/architecture/flows/bankroll/sequence-configure.md Cenario C
//
// Contrato esperado do dialog:
//   - Input: delta (numerico, sinal), reason (select), note (textarea opcional), occurredAt (date picker)
//   - Submit -> POST /api/bankroll/snapshot
//   - Validacoes: delta != 0, occurredAt <= hoje
//   - Toast de sucesso apos ok, erro apos falha
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

import { apiRequest } from '../../../client/src/lib/queryClient';
import { BankrollMovementDialog } from '../../../client/src/components/bankroll/BankrollMovementDialog';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BankrollMovementDialog - render', () => {
  it('renderiza com dialog aberto', () => {
    render(withClient(
      <BankrollMovementDialog open onOpenChange={() => {}} />
    ));

    expect(screen.getByTestId('bankroll-movement-dialog')).toBeTruthy();
  });

  it('tem input de delta', () => {
    render(withClient(
      <BankrollMovementDialog open onOpenChange={() => {}} />
    ));

    expect(screen.getByTestId('bankroll-movement-delta-input')).toBeTruthy();
  });

  it('tem select de reason com opcoes deposit/withdrawal/manual_adjustment/session_result', () => {
    render(withClient(
      <BankrollMovementDialog open onOpenChange={() => {}} />
    ));

    expect(screen.getByTestId('bankroll-movement-reason-select')).toBeTruthy();
  });

  it('tem textarea de note (opcional)', () => {
    render(withClient(
      <BankrollMovementDialog open onOpenChange={() => {}} />
    ));

    expect(screen.getByTestId('bankroll-movement-note-input')).toBeTruthy();
  });
});

describe('BankrollMovementDialog - submit', () => {
  it('submit com delta=500 reason=deposit -> chama POST /api/bankroll/snapshot', async () => {
    (apiRequest as any).mockResolvedValue({
      snapshot: { id: 'snap-1', delta: 500, newAmount: 1500, reason: 'deposit', source: 'manual' },
      bankroll: { configured: true, amount: 1500 },
    });

    const onOpenChange = vi.fn();
    render(withClient(
      <BankrollMovementDialog open onOpenChange={onOpenChange} />
    ));

    const input = screen.getByTestId('bankroll-movement-delta-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '500' } });

    const submit = screen.getByTestId('bankroll-movement-submit');
    fireEvent.click(submit);

    await waitFor(() => {
      // MED-2 fix (UX-2 2026-04-25): apiRequest assinatura real eh
      // (method, url, data) — antes o teste assertava assinatura legacy
      // que mascarava bug em runtime (fetch(undefined)).
      expect(apiRequest).toHaveBeenCalledWith(
        'POST',
        expect.stringContaining('/api/bankroll/snapshot'),
        expect.objectContaining({ delta: 500 }),
      );
    });
  });

  it('submit com delta=0 -> NAO chama API (validacao frontend)', async () => {
    render(withClient(
      <BankrollMovementDialog open onOpenChange={() => {}} />
    ));

    const input = screen.getByTestId('bankroll-movement-delta-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0' } });

    const submit = screen.getByTestId('bankroll-movement-submit');
    fireEvent.click(submit);

    await waitFor(() => {
      expect(screen.getByTestId('bankroll-movement-error')).toBeTruthy();
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('submit com occurredAt no futuro -> NAO chama API (validacao frontend)', async () => {
    render(withClient(
      <BankrollMovementDialog open onOpenChange={() => {}} />
    ));

    const delta = screen.getByTestId('bankroll-movement-delta-input') as HTMLInputElement;
    fireEvent.change(delta, { target: { value: '500' } });

    const dateInput = screen.queryByTestId('bankroll-movement-occurred-at-input');
    if (dateInput) {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      fireEvent.change(dateInput, { target: { value: tomorrow } });
      fireEvent.click(screen.getByTestId('bankroll-movement-submit'));

      await waitFor(() => {
        expect(screen.getByTestId('bankroll-movement-error')).toBeTruthy();
      });
      expect(apiRequest).not.toHaveBeenCalled();
    }
  });

  it('apos submit com sucesso, fecha dialog via onOpenChange(false)', async () => {
    (apiRequest as any).mockResolvedValue({
      snapshot: { id: 'snap-1' }, bankroll: { amount: 1500 },
    });
    const onOpenChange = vi.fn();

    render(withClient(
      <BankrollMovementDialog open onOpenChange={onOpenChange} />
    ));

    fireEvent.change(screen.getByTestId('bankroll-movement-delta-input'), { target: { value: '500' } });
    fireEvent.click(screen.getByTestId('bankroll-movement-submit'));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
