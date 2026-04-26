import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD: client/src/components/bankroll/WalletList.tsx
//
// Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md (RF-12)
// Sidebar list: nome, plataforma, balance, color dot. Click seleciona.
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { WalletList } from '../../../client/src/components/bankroll/WalletList';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WalletList - render', () => {
  it('renderiza lista de wallets ativas', () => {
    render(withClient(
      <WalletList
        wallets={[
          { id: 'w1', name: 'GG Main', platform: 'GGNetwork', nativeCurrency: 'USD', balance: '1000', balanceUSD: '1000', status: 'active', color: '#FF5733', displayOrder: 0, isShotPocket: false },
          { id: 'w2', name: 'Suprema X', platform: 'Suprema', nativeCurrency: 'BRL', balance: '5000', balanceUSD: '1000', status: 'active', color: '#3366FF', displayOrder: 1, isShotPocket: false },
        ]}
        selectedWalletId={null}
        onSelect={() => {}}
        onCreateClick={() => {}}
      />
    ));

    expect(screen.getByTestId('wallet-item-w1')).toBeTruthy();
    expect(screen.getByTestId('wallet-item-w2')).toBeTruthy();
  });

  it('mostra balance native + USD equivalente para wallet BRL', () => {
    render(withClient(
      <WalletList
        wallets={[
          { id: 'w1', name: 'Suprema', platform: 'Suprema', nativeCurrency: 'BRL', balance: '5000', balanceUSD: '1000', status: 'active', displayOrder: 0, isShotPocket: false },
        ]}
        selectedWalletId={null}
        onSelect={() => {}}
        onCreateClick={() => {}}
      />
    ));

    const item = screen.getByTestId('wallet-item-w1');
    expect(item.textContent).toMatch(/5\.?000|5,000/);
    expect(item.textContent).toMatch(/1\.?000|1,000|1\.000|1000/);
  });

  it('botao "Nova Carteira" chama onCreateClick', async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    render(withClient(
      <WalletList
        wallets={[]}
        selectedWalletId={null}
        onSelect={() => {}}
        onCreateClick={onCreate}
      />
    ));

    await user.click(screen.getByTestId('wallet-list-new-button'));
    expect(onCreate).toHaveBeenCalled();
  });

  it('click em wallet chama onSelect com walletId', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(withClient(
      <WalletList
        wallets={[
          { id: 'w1', name: 'GG', platform: 'GGNetwork', nativeCurrency: 'USD', balance: '1000', balanceUSD: '1000', status: 'active', displayOrder: 0, isShotPocket: false },
        ]}
        selectedWalletId={null}
        onSelect={onSelect}
        onCreateClick={() => {}}
      />
    ));

    await user.click(screen.getByTestId('wallet-item-w1'));
    expect(onSelect).toHaveBeenCalledWith('w1');
  });

  it('wallet selecionada tem data-selected="true"', () => {
    render(withClient(
      <WalletList
        wallets={[
          { id: 'w1', name: 'GG', platform: 'GGNetwork', nativeCurrency: 'USD', balance: '1000', balanceUSD: '1000', status: 'active', displayOrder: 0, isShotPocket: false },
        ]}
        selectedWalletId="w1"
        onSelect={() => {}}
        onCreateClick={() => {}}
      />
    ));

    const item = screen.getByTestId('wallet-item-w1');
    expect(item.getAttribute('data-selected')).toBe('true');
  });

  it('empty state renderiza quando 0 wallets', () => {
    render(withClient(
      <WalletList
        wallets={[]}
        selectedWalletId={null}
        onSelect={() => {}}
        onCreateClick={() => {}}
      />
    ));

    expect(screen.getByTestId('wallet-list-empty')).toBeTruthy();
  });

  it('archived wallets em accordion separado', () => {
    render(withClient(
      <WalletList
        wallets={[
          { id: 'w1', name: 'A', platform: 'GGNetwork', nativeCurrency: 'USD', balance: '0', balanceUSD: '0', status: 'archived', displayOrder: 0, isShotPocket: false },
        ]}
        selectedWalletId={null}
        onSelect={() => {}}
        onCreateClick={() => {}}
      />
    ));

    expect(screen.getByTestId('wallet-list-archived-section')).toBeTruthy();
  });

  it('shotPocket wallet tem badge visual', () => {
    render(withClient(
      <WalletList
        wallets={[
          { id: 'w1', name: 'Shot', platform: 'GGNetwork', nativeCurrency: 'USD', balance: '500', balanceUSD: '500', status: 'active', displayOrder: 0, isShotPocket: true },
        ]}
        selectedWalletId={null}
        onSelect={() => {}}
        onCreateClick={() => {}}
      />
    ));

    const item = screen.getByTestId('wallet-item-w1');
    expect(item.textContent).toMatch(/shot/i);
  });
});
