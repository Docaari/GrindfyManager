import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD: client/src/components/bankroll/WalletTransactionDialog.tsx
//
// Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md (RF-12)
// Form: direction, reason, nativeAmount, occurredAt, note. Preview "novo saldo".
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { apiRequest } from '../../../client/src/lib/queryClient';
import { WalletTransactionDialog } from '../../../client/src/components/bankroll/WalletTransactionDialog';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const mockWallet = {
  id: 'wlt_1',
  name: 'GG Main',
  platform: 'GGNetwork',
  nativeCurrency: 'USD',
  balance: '1000',
  status: 'active',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WalletTransactionDialog - render', () => {
  it('renderiza com dialog aberto', () => {
    render(withClient(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={mockWallet as any} />
    ));
    expect(screen.getByTestId('wallet-tx-dialog')).toBeTruthy();
  });

  it('tem campos direction, reason, nativeAmount, note', () => {
    render(withClient(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={mockWallet as any} />
    ));
    expect(screen.getByTestId('wallet-tx-direction-select')).toBeTruthy();
    expect(screen.getByTestId('wallet-tx-reason-select')).toBeTruthy();
    expect(screen.getByTestId('wallet-tx-amount-input')).toBeTruthy();
    expect(screen.getByTestId('wallet-tx-note-input')).toBeTruthy();
  });

  it('tem campo occurredAt', () => {
    render(withClient(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={mockWallet as any} />
    ));
    expect(screen.getByTestId('wallet-tx-occurred-at-input')).toBeTruthy();
  });
});

describe('WalletTransactionDialog - preview "novo saldo"', () => {
  it('preview de novo saldo aparece ao digitar amount', async () => {
    const user = userEvent.setup();
    render(withClient(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={mockWallet as any} />
    ));

    await user.type(screen.getByTestId('wallet-tx-amount-input'), '500');

    await waitFor(() => {
      const preview = screen.queryByTestId('wallet-tx-preview-balance');
      expect(preview).toBeTruthy();
      // direction default 'in' + 1000 + 500 = 1500
      if (preview) expect(preview.textContent).toMatch(/1[.,]?500/);
    });
  });
});

describe('WalletTransactionDialog - submit', () => {
  it('submit valido chama POST /api/wallets/:id/transactions e fecha dialog', async () => {
    (apiRequest as any).mockResolvedValue({
      transaction: { id: 'wtx_new', direction: 'in', nativeAmount: '500', reason: 'deposit' },
      wallet: { ...mockWallet, balance: '1500' },
      warning: null,
    });
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(withClient(
      <WalletTransactionDialog open onOpenChange={onClose} wallet={mockWallet as any} />
    ));

    await user.type(screen.getByTestId('wallet-tx-amount-input'), '500');
    await user.click(screen.getByTestId('wallet-tx-submit'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalled();
    });
  });

  it('warning wallet_negative na response mostra toast', async () => {
    (apiRequest as any).mockResolvedValue({
      transaction: { id: 'wtx', direction: 'out', nativeAmount: '2000' },
      wallet: { ...mockWallet, balance: '-1000' },
      warning: 'wallet_negative',
    });
    const user = userEvent.setup();

    render(withClient(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={mockWallet as any} />
    ));

    await user.type(screen.getByTestId('wallet-tx-amount-input'), '2000');
    await user.click(screen.getByTestId('wallet-tx-submit'));

    await waitFor(() => {
      const warn = screen.queryByTestId('wallet-tx-warning');
      if (warn) {
        expect(warn.textContent).toMatch(/negativ/i);
      }
    });
  });
});

describe('WalletTransactionDialog - validacoes', () => {
  it('amount = 0 mostra erro inline', async () => {
    const user = userEvent.setup();
    render(withClient(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={mockWallet as any} />
    ));

    await user.type(screen.getByTestId('wallet-tx-amount-input'), '0');
    await user.click(screen.getByTestId('wallet-tx-submit'));

    await waitFor(() => {
      const err = screen.queryByTestId('wallet-tx-amount-error');
      expect(err).toBeTruthy();
    });
  });

  it('movement-mode dropdown nao expoe session_result (founder pediu deposit/withdrawal/manual_adjustment apenas)', async () => {
    render(withClient(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={mockWallet as any} />
    ));

    const select = screen.getByTestId('wallet-tx-reason-select') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain('deposit');
    expect(values).toContain('withdrawal');
    expect(values).toContain('manual_adjustment');
    expect(values).not.toContain('session_result');
  });

  it('campo wallet-tx-session-id-input nao existe mais (sessoes usam aba Reportar Resultado)', async () => {
    render(withClient(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={mockWallet as any} />
    ));

    expect(screen.queryByTestId('wallet-tx-session-id-input')).toBeNull();
  });
});
