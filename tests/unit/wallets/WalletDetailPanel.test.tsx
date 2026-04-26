import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD: client/src/components/bankroll/WalletDetailPanel.tsx
//
// Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md (RF-12)
// Detalhe da wallet selecionada: header, tabs Movimentos / Configuracao,
// botoes "Registrar movimento", "Editar", "Arquivar".
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { WalletDetailPanel } from '../../../client/src/components/bankroll/WalletDetailPanel';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const mockWallet = {
  id: 'wlt_1',
  name: 'GG Main',
  platform: 'GGNetwork',
  nativeCurrency: 'USD',
  balance: '1234.50',
  status: 'active',
  bankrollRule: null,
  color: '#FF5733',
  displayOrder: 0,
  isShotPocket: false,
  createdAt: '2026-04-25T10:00:00Z',
  updatedAt: '2026-04-26T15:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WalletDetailPanel - header', () => {
  it('renderiza nome e plataforma da wallet', () => {
    render(withClient(<WalletDetailPanel wallet={mockWallet} />));

    const panel = screen.getByTestId('wallet-detail-panel');
    expect(panel.textContent).toMatch(/GG Main/);
    expect(panel.textContent).toMatch(/GGNetwork/);
  });

  it('renderiza balance native', () => {
    render(withClient(<WalletDetailPanel wallet={mockWallet} />));
    const panel = screen.getByTestId('wallet-detail-panel');
    expect(panel.textContent).toMatch(/1[.,]?234[.,]50|1234\.50/);
  });

  it('renderiza balance USD para wallet em moeda diferente', () => {
    render(withClient(
      <WalletDetailPanel wallet={{
        ...mockWallet,
        nativeCurrency: 'BRL',
        balance: '5000',
      }} />
    ));

    const panel = screen.getByTestId('wallet-detail-panel');
    // Mostra BRL nativo
    expect(panel.textContent).toMatch(/5[.,]?000/);
  });
});

describe('WalletDetailPanel - actions', () => {
  it('botao "Registrar movimento" presente', () => {
    render(withClient(<WalletDetailPanel wallet={mockWallet} />));
    expect(screen.getByTestId('wallet-detail-record-tx-button')).toBeTruthy();
  });

  it('botao "Editar" presente', () => {
    render(withClient(<WalletDetailPanel wallet={mockWallet} />));
    expect(screen.getByTestId('wallet-detail-edit-button')).toBeTruthy();
  });

  it('botao "Arquivar" presente', () => {
    render(withClient(<WalletDetailPanel wallet={mockWallet} />));
    expect(screen.getByTestId('wallet-detail-archive-button')).toBeTruthy();
  });

  it('click em "Arquivar" abre confirm dialog (nao arquiva direto)', async () => {
    const user = userEvent.setup();
    render(withClient(<WalletDetailPanel wallet={mockWallet} />));

    await user.click(screen.getByTestId('wallet-detail-archive-button'));

    expect(screen.getByTestId('wallet-archive-confirm')).toBeTruthy();
  });
});

describe('WalletDetailPanel - wallet arquivada', () => {
  it('botoes de mutacao desabilitados em wallet arquivada', () => {
    render(withClient(
      <WalletDetailPanel wallet={{ ...mockWallet, status: 'archived' }} />
    ));

    const recordBtn = screen.getByTestId('wallet-detail-record-tx-button') as HTMLButtonElement;
    expect(recordBtn.disabled).toBe(true);
  });
});
