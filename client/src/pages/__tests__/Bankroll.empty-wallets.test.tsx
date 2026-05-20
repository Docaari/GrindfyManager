/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint UX-QW-2 — RF-04
 * Spec: Docs/specs/sprint-ux-qw-2.md
 *
 * Quando /bankroll esta sem wallets ativas:
 *   - <BankrollWidget> NAO renderiza (esconde via conditional render no parent)
 *   - <EmptyState area="bankroll-empty"> renderiza central
 *     - title: "Sua banca espera por voce"
 *     - description: "Crie sua primeira carteira para acompanhar saldos..."
 *     - primaryCTA: "Criar primeira carteira" -> abre WalletCreateDialog
 *     - secondaryLink: { label: "Saber mais", href: "#" } (placeholder ate docs)
 *
 * Condicao: !hasActiveWallets = wallets.length === 0 OR nenhuma com status=active.
 * Quando ha pelo menos 1 wallet ativa, comportamento atual (BankrollWidget visivel).
 *
 * Lessons aplicadas:
 *   #1  hooks primeiro — useQuery NAO pode mover para dentro de if.
 *   #2  data-testid estavel.
 *   #14 import estatico (await import).
 *   #28 mock por path: usar exato path que Bankroll.tsx importa.
 *   #13 apiRequest retorna JSON parseado, NAO Response.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock apiRequest com resposta JSON (lesson #13).
const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: undefined,
  getQueryFn: () => async (ctx: any) => apiRequestMock('GET', ctx.queryKey[0]),
}));

// Mock dialogs/wrappers para nao precisar de mount completo do Radix.
vi.mock('@/components/bankroll/WalletCreateDialog', () => ({
  WalletCreateDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="wallet-create-dialog-open" /> : null,
}));

vi.mock('@/components/bankroll/RakebackDialog', () => ({
  RakebackDialog: () => null,
}));

vi.mock('@/components/bankroll/TransferDialog', () => ({
  TransferDialog: () => null,
}));

vi.mock('@/components/bankroll/WalletTransactionDialog', () => ({
  WalletTransactionDialog: () => null,
}));

vi.mock('@/components/bankroll/BankrollHistoryTable', () => ({
  BankrollHistoryTable: () => <div data-testid="bankroll-history-table-mock" />,
}));

vi.mock('@/components/bankroll/BankrollWidget', () => ({
  BankrollWidget: () => <div data-testid="bankroll-widget-mock" />,
}));

vi.mock('@/components/bankroll/WalletList', () => ({
  WalletList: ({ onCreateClick, wallets }: any) => (
    <div data-testid="wallet-list-mock" data-count={wallets.length}>
      <button data-testid="wallet-list-mock-create" onClick={() => onCreateClick()}>
        Nova
      </button>
    </div>
  ),
}));

vi.mock('@/components/bankroll/WalletDetailPanel', () => ({
  WalletDetailPanel: () => <div data-testid="wallet-detail-mock" />,
}));

vi.mock('@/components/bankroll/OverallWalletPanel', () => ({
  OverallWalletPanel: () => <div data-testid="wallet-overall-mock" />,
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

async function loadBankrollPage() {
  const mod: any = await import('@/pages/Bankroll');
  return (mod.default ?? mod.BankrollPage) as React.ComponentType<any>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Sem wallets -> EmptyState + sem BankrollWidget
// ===========================================================================

describe('RF-04 Bankroll — sem wallets ativas', () => {
  beforeEach(() => {
    apiRequestMock.mockImplementation((_method: string, url: string) => {
      if (url.startsWith('/api/wallets')) {
        return Promise.resolve({ wallets: [] });
      }
      if (url.startsWith('/api/bankroll/consolidated')) {
        return Promise.resolve({
          totalUSD: '0',
          walletCount: 0,
          aggregationMode: 'global',
          byWallet: [],
        });
      }
      return Promise.resolve({});
    });
  });

  it('renderiza <EmptyState> com data-area="bankroll-empty"', async () => {
    const Bankroll = await loadBankrollPage();
    render(wrap(<Bankroll />));
    await waitFor(() => {
      const empty = screen.queryByTestId('empty-state');
      expect(empty).toBeInTheDocument();
      expect(empty!.getAttribute('data-area')).toBe('bankroll-empty');
    });
  });

  it('NAO renderiza <BankrollWidget> quando sem wallets', async () => {
    const Bankroll = await loadBankrollPage();
    render(wrap(<Bankroll />));
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('bankroll-widget-mock')).toBeNull();
  });

  it('exibe headline "Sua banca espera por voce"', async () => {
    const Bankroll = await loadBankrollPage();
    render(wrap(<Bankroll />));
    await waitFor(() => {
      expect(screen.getByText(/Sua banca espera por voce/i)).toBeInTheDocument();
    });
  });

  it('CTA primario label inclui "Criar primeira carteira"', async () => {
    const Bankroll = await loadBankrollPage();
    render(wrap(<Bankroll />));
    await waitFor(() => {
      const cta = screen.getByTestId('empty-state-cta');
      expect(cta.textContent).toMatch(/Criar primeira carteira/i);
    });
  });

  it('click no CTA primario abre WalletCreateDialog', async () => {
    const Bankroll = await loadBankrollPage();
    render(wrap(<Bankroll />));
    await waitFor(() => {
      expect(screen.getByTestId('empty-state-cta')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId('empty-state-cta'));
    await waitFor(() => {
      expect(
        screen.getByTestId('wallet-create-dialog-open'),
      ).toBeInTheDocument();
    });
  });

  it('renderiza secondary link "Saber mais"', async () => {
    const Bankroll = await loadBankrollPage();
    render(wrap(<Bankroll />));
    await waitFor(() => {
      const link = screen.queryByTestId('empty-state-secondary-link');
      expect(link).toBeInTheDocument();
      expect(link!.textContent).toMatch(/Saber mais/i);
    });
  });
});

// ===========================================================================
// Com wallets ativas -> renderiza widget normal
// ===========================================================================

describe('RF-04 Bankroll — com wallets ativas (sem regressao)', () => {
  beforeEach(() => {
    apiRequestMock.mockImplementation((_method: string, url: string) => {
      if (url.startsWith('/api/wallets')) {
        return Promise.resolve({
          wallets: [
            {
              id: 'w1',
              name: 'GG Main',
              platform: 'GGNetwork',
              nativeCurrency: 'USD',
              balance: '500',
              status: 'active',
              displayOrder: 1,
              color: '#22c55e',
            },
          ],
        });
      }
      if (url.startsWith('/api/bankroll/consolidated')) {
        return Promise.resolve({
          totalUSD: '500',
          walletCount: 1,
          aggregationMode: 'global',
          byWallet: [],
        });
      }
      return Promise.resolve({});
    });
  });

  it('renderiza <BankrollWidget> quando ha wallet ativa', async () => {
    const Bankroll = await loadBankrollPage();
    render(wrap(<Bankroll />));
    await waitFor(() => {
      expect(screen.getByTestId('bankroll-widget-mock')).toBeInTheDocument();
    });
  });

  it('NAO renderiza <EmptyState> quando ha wallet ativa', async () => {
    const Bankroll = await loadBankrollPage();
    render(wrap(<Bankroll />));
    await waitFor(() => {
      expect(screen.getByTestId('bankroll-widget-mock')).toBeInTheDocument();
    });
    const empty = screen.queryByTestId('empty-state');
    // O empty state com area="bankroll-empty" NAO deve aparecer; outros
    // empty states genericos (ex: "Selecione uma carteira") sao aceitaveis.
    if (empty) {
      expect(empty.getAttribute('data-area')).not.toBe('bankroll-empty');
    }
  });
});

// ===========================================================================
// Wallets todas arquivadas -> empty state aparece (regra: only active counts)
// ===========================================================================

describe('RF-04 Bankroll — wallets todas arquivadas', () => {
  beforeEach(() => {
    apiRequestMock.mockImplementation((_method: string, url: string) => {
      if (url.startsWith('/api/wallets')) {
        return Promise.resolve({
          wallets: [
            {
              id: 'w-old',
              name: 'Wallet Antiga',
              platform: 'PokerStars',
              nativeCurrency: 'USD',
              balance: '0',
              status: 'archived',
              displayOrder: 1,
            },
          ],
        });
      }
      if (url.startsWith('/api/bankroll/consolidated')) {
        return Promise.resolve({
          totalUSD: '0',
          walletCount: 0,
          aggregationMode: 'global',
          byWallet: [],
        });
      }
      return Promise.resolve({});
    });
  });

  it('renderiza <EmptyState> quando todas wallets estao archived', async () => {
    const Bankroll = await loadBankrollPage();
    render(wrap(<Bankroll />));
    await waitFor(() => {
      const empty = screen.queryByTestId('empty-state');
      expect(empty).toBeInTheDocument();
      expect(empty!.getAttribute('data-area')).toBe('bankroll-empty');
    });
  });

  it('NAO renderiza <BankrollWidget> quando todas wallets estao archived', async () => {
    const Bankroll = await loadBankrollPage();
    render(wrap(<Bankroll />));
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('bankroll-widget-mock')).toBeNull();
  });
});
