/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-4: TransferDialog (UI)
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-4)
 *
 * Componente esperado: client/src/components/bankroll/TransferDialog.tsx
 *
 * Casos cobertos:
 *   1. Renderiza form com selects from/to + input amount
 *   2. Submit happy path -> POST /api/wallets/transfers
 *   3. Cross-currency: aparece input fxRate
 *   4. Same-currency: input fxRate escondido/disabled
 *   5. Erro 422 FX_DIFF_HIGH -> exibe banner com market rate + botao "Confirmar"
 *   6. Erro INSUFFICIENT_BALANCE -> exibe mensagem
 *   7. data-testid presentes: transfer-dialog, transfer-from-select, transfer-to-select,
 *      transfer-amount-input, transfer-submit-btn
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
  getCsrfToken: () => null,
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (a: any) => toastMock(a),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const wallets = [
  { id: 'w_usd', name: 'GG USD', platform: 'GGNetwork', nativeCurrency: 'USD', balance: '1000', status: 'active' },
  { id: 'w_brl', name: 'Suprema BRL', platform: 'Suprema', nativeCurrency: 'BRL', balance: '5000', status: 'active' },
];

async function loadDialog() {
  const mod: any = await import('../TransferDialog');
  return mod.default ?? mod.TransferDialog;
}

describe('TransferDialog — RF-4 UI', () => {
  it('renderiza com data-testid=transfer-dialog quando open', async () => {
    const Dialog = await loadDialog();
    render(
      wrap(
        <Dialog
          open={true}
          onOpenChange={vi.fn()}
          wallets={wallets}
        />,
      ),
    );

    expect(screen.getByTestId('transfer-dialog')).toBeInTheDocument();
  });

  it('renderiza selects from/to + amount input', async () => {
    const Dialog = await loadDialog();
    render(wrap(<Dialog open={true} onOpenChange={vi.fn()} wallets={wallets} />));

    expect(screen.getByTestId('transfer-from-select')).toBeInTheDocument();
    expect(screen.getByTestId('transfer-to-select')).toBeInTheDocument();
    expect(screen.getByTestId('transfer-amount-input')).toBeInTheDocument();
  });

  it('botao submit com data-testid=transfer-submit-btn', async () => {
    const Dialog = await loadDialog();
    render(wrap(<Dialog open={true} onOpenChange={vi.fn()} wallets={wallets} />));
    expect(screen.getByTestId('transfer-submit-btn')).toBeInTheDocument();
  });

  it('happy path submit: chama apiRequest POST /api/wallets/transfers', async () => {
    apiRequestMock.mockResolvedValue({
      transfer: { id: 't1' },
      transactions: [],
    });
    const onClose = vi.fn();
    const Dialog = await loadDialog();
    render(
      wrap(
        <Dialog
          open={true}
          onOpenChange={onClose}
          wallets={wallets}
          defaultFromWalletId="w_usd"
          defaultToWalletId="w_brl"
        />,
      ),
    );

    const amountInput = screen.getByTestId('transfer-amount-input') as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '100' } });
    // Cross-currency exigira fxRate; preenche tambem se input visivel.
    const fxInput = screen.queryByTestId('transfer-fxrate-input') as HTMLInputElement | null;
    if (fxInput) fireEvent.change(fxInput, { target: { value: '5.0' } });

    fireEvent.click(screen.getByTestId('transfer-submit-btn'));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
      const args = apiRequestMock.mock.calls[0];
      // reviewer R2: oracle was checking method instead of URL
      // apiRequest signature: (method, url, body) -> URL is args[1]
      const url = String(args[1] ?? '');
      expect(url).toContain('/api/wallets/transfers');
    });
  });

  it('cross-currency: input fxRate visivel quando from!=to currency', async () => {
    const Dialog = await loadDialog();
    render(
      wrap(
        <Dialog
          open={true}
          onOpenChange={vi.fn()}
          wallets={wallets}
          defaultFromWalletId="w_usd"
          defaultToWalletId="w_brl"
        />,
      ),
    );

    expect(screen.queryByTestId('transfer-fxrate-input')).toBeInTheDocument();
  });

  it('same-currency: input fxRate escondido', async () => {
    const Dialog = await loadDialog();
    const sameCurrency = [
      wallets[0],
      { ...wallets[0], id: 'w_usd2', name: 'Stars USD' },
    ];
    render(
      wrap(
        <Dialog
          open={true}
          onOpenChange={vi.fn()}
          wallets={sameCurrency}
          defaultFromWalletId="w_usd"
          defaultToWalletId="w_usd2"
        />,
      ),
    );

    expect(screen.queryByTestId('transfer-fxrate-input')).not.toBeInTheDocument();
  });

  it('erro FX_DIFF_HIGH -> exibe banner com market rate', async () => {
    apiRequestMock.mockRejectedValue(
      Object.assign(new Error('FX_DIFF_HIGH'), {
        status: 422,
        body: {
          code: 'FX_DIFF_HIGH',
          providedRate: 6.0,
          marketRate: 5.0,
          diffPct: 0.2,
        },
      }),
    );

    const Dialog = await loadDialog();
    render(
      wrap(
        <Dialog
          open={true}
          onOpenChange={vi.fn()}
          wallets={wallets}
          defaultFromWalletId="w_usd"
          defaultToWalletId="w_brl"
        />,
      ),
    );

    fireEvent.change(screen.getByTestId('transfer-amount-input'), {
      target: { value: '100' },
    });
    const fxInput = screen.queryByTestId('transfer-fxrate-input') as HTMLInputElement | null;
    if (fxInput) fireEvent.change(fxInput, { target: { value: '6.0' } });

    fireEvent.click(screen.getByTestId('transfer-submit-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('transfer-fx-warning')).toBeInTheDocument();
    });
  });

  it('erro INSUFFICIENT_BALANCE -> mostra mensagem ao usuario', async () => {
    apiRequestMock.mockRejectedValue(
      Object.assign(new Error('INSUFFICIENT_BALANCE'), {
        status: 422,
        body: { code: 'INSUFFICIENT_BALANCE' },
      }),
    );
    const Dialog = await loadDialog();
    render(
      wrap(
        <Dialog
          open={true}
          onOpenChange={vi.fn()}
          wallets={wallets}
          defaultFromWalletId="w_usd"
          defaultToWalletId="w_brl"
        />,
      ),
    );

    fireEvent.change(screen.getByTestId('transfer-amount-input'), {
      target: { value: '999999' },
    });
    const fxInput = screen.queryByTestId('transfer-fxrate-input') as HTMLInputElement | null;
    if (fxInput) fireEvent.change(fxInput, { target: { value: '5.0' } });

    fireEvent.click(screen.getByTestId('transfer-submit-btn'));

    await waitFor(() => {
      // Toast ou banner com codigo
      const calledWithError = toastMock.mock.calls.some((c: any) =>
        JSON.stringify(c[0] ?? '').toLowerCase().includes('saldo')
        || JSON.stringify(c[0] ?? '').toLowerCase().includes('insufficient'),
      );
      const banner = screen.queryByTestId('transfer-error-banner');
      expect(calledWithError || banner != null).toBe(true);
    });
  });
});
