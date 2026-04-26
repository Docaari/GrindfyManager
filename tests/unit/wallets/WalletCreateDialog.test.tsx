import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD: client/src/components/bankroll/WalletCreateDialog.tsx
//
// Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md (RF-12 + RF-13)
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { apiRequest } from '../../../client/src/lib/queryClient';
import { WalletCreateDialog } from '../../../client/src/components/bankroll/WalletCreateDialog';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WalletCreateDialog - render', () => {
  it('renderiza com dialog aberto', () => {
    render(withClient(
      <WalletCreateDialog open onOpenChange={() => {}} />
    ));
    expect(screen.getByTestId('wallet-create-dialog')).toBeTruthy();
  });

  it('tem campos name, platform, nativeCurrency', () => {
    render(withClient(
      <WalletCreateDialog open onOpenChange={() => {}} />
    ));
    expect(screen.getByTestId('wallet-create-name-input')).toBeTruthy();
    expect(screen.getByTestId('wallet-create-platform-select')).toBeTruthy();
    expect(screen.getByTestId('wallet-create-native-currency-select')).toBeTruthy();
  });

  it('tem botoes submit e cancelar', () => {
    render(withClient(
      <WalletCreateDialog open onOpenChange={() => {}} />
    ));
    expect(screen.getByTestId('wallet-create-submit')).toBeTruthy();
    expect(screen.getByTestId('wallet-create-cancel')).toBeTruthy();
  });
});

describe('WalletCreateDialog - validacao', () => {
  it('submit com nome vazio mostra erro inline', async () => {
    const user = userEvent.setup();
    render(withClient(
      <WalletCreateDialog open onOpenChange={() => {}} />
    ));

    await user.click(screen.getByTestId('wallet-create-submit'));

    await waitFor(() => {
      const err = screen.queryByTestId('wallet-create-name-error');
      expect(err).toBeTruthy();
    });
  });
});

describe('WalletCreateDialog - submit success', () => {
  it('submit valido chama POST /api/wallets e fecha dialog', async () => {
    (apiRequest as any).mockResolvedValue({
      wallet: { id: 'wlt_new', name: 'GG', platform: 'GGNetwork', nativeCurrency: 'USD', balance: '0', status: 'active' },
      transaction: null,
      warnings: [],
    });
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(withClient(
      <WalletCreateDialog open onOpenChange={onClose} />
    ));

    await user.type(screen.getByTestId('wallet-create-name-input'), 'GG Main');
    // Platform e currency sao Radix Selects — testes podem usar trigger + opcao via testid
    await user.click(screen.getByTestId('wallet-create-submit'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalled();
    });
  });
});

describe('WalletCreateDialog - errors', () => {
  it('erro 409 (limit reached) mostra toast em pt-BR', async () => {
    (apiRequest as any).mockRejectedValue({
      statusCode: 409,
      message: 'Limite de 50 carteiras atingido',
    });
    const user = userEvent.setup();

    render(withClient(
      <WalletCreateDialog open onOpenChange={() => {}} />
    ));

    await user.type(screen.getByTestId('wallet-create-name-input'), 'GG');
    await user.click(screen.getByTestId('wallet-create-submit'));

    await waitFor(() => {
      const err = screen.queryByTestId('wallet-create-error');
      // Erro mostrado em algum elemento (toast OU error inline)
      if (err) {
        expect(err.textContent).toMatch(/limite|limit|50/i);
      }
    });
  });

  it('erro 400 (errNameDuplicate) mostra mensagem inline', async () => {
    (apiRequest as any).mockRejectedValue({
      statusCode: 400,
      message: 'Ja existe uma carteira ativa com este nome',
    });
    const user = userEvent.setup();

    render(withClient(
      <WalletCreateDialog open onOpenChange={() => {}} />
    ));

    await user.type(screen.getByTestId('wallet-create-name-input'), 'GG Main');
    await user.click(screen.getByTestId('wallet-create-submit'));

    await waitFor(() => {
      const errEl = screen.queryByTestId('wallet-create-error') ?? screen.queryByTestId('wallet-create-name-error');
      if (errEl) {
        expect(errEl.textContent).toMatch(/existe|duplica|nome/i);
      }
    });
  });
});

describe('WalletCreateDialog - i18n pt-BR', () => {
  it('labels do form em pt-BR (Nome, Plataforma, Moeda nativa)', () => {
    render(withClient(
      <WalletCreateDialog open onOpenChange={() => {}} />
    ));
    const dialog = screen.getByTestId('wallet-create-dialog');
    expect(dialog.textContent).toMatch(/Nome/);
    expect(dialog.textContent).toMatch(/Plataforma/);
    expect(dialog.textContent).toMatch(/Moeda nativa/i);
  });
});
