/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-Reports-Detail — RF-09
 * Spec: Docs/specs/sprint-bankroll-reports-detail.md
 * ADR-069
 *
 * Foco: WalletTransactionDialog modo "Reportar saldo" auto-seleciona reason
 * baseado em prop `sessionId`:
 *   - sessionId presente -> reason='session_result' (comportamento atual)
 *   - sessionId ausente -> reason='manual_report' (NOVO)
 * Helper text dinamico + submit body shape correto.
 *
 * Lessons:
 *   #2 — data-testid estavel: `wallet-tx-dialog-mode-toggle` (existente: wallet-tx-mode-toggle),
 *        `wallet-tx-reason-helper` (NOVO).
 *   #11 — default minimo: helper aparece somente em modo balance.
 *   #12 — invalida queries pos-submit: ['wallets'], ['bankroll-snapshots'], ['grind-history'], ['dashboard'].
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { apiRequest, queryClient } from '../../../client/src/lib/queryClient';
import { WalletTransactionDialog } from '../../../client/src/components/bankroll/WalletTransactionDialog';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const mockWallet = {
  id: 'wlt_ps',
  name: 'PokerStars Main',
  platform: 'PokerStars',
  nativeCurrency: 'BRL',
  balance: '1000',
  status: 'active' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WalletTransactionDialog — modo balance, sessionId standalone (RF-09)', () => {
  it('toggle "Movimento / Reportar saldo" presente (data-testid existente)', () => {
    // Existente — passa hoje. Marker que confirma toggle continua presente
    render(withClient(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={mockWallet as any} />,
    ));
    expect(screen.getByTestId('wallet-tx-mode-toggle')).toBeTruthy();
    expect(screen.getByTestId('wallet-tx-mode-balance')).toBeTruthy();
  });

  it('modo balance + prop sessionId presente -> submit envia reason=session_result + sessionId', async () => {
    // RED: dialog atual nao aceita prop sessionId. Quando aceitar, flow:
    // 1. props.sessionId='SES-1' setado
    // 2. modo balance auto-seleciona reason=session_result
    // 3. submit body inclui sessionId
    (apiRequest as any).mockResolvedValue({
      transaction: { id: 'tx_a', reason: 'session_result', sessionId: 'SES-1' },
      wallet: { ...mockWallet, balance: '1247' },
    });

    const user = userEvent.setup();
    render(withClient(
      <WalletTransactionDialog
        open
        onOpenChange={() => {}}
        wallet={mockWallet as any}
        // @ts-expect-error — prop nao existe ainda na interface
        sessionId="SES-1"
      />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));
    await user.clear(screen.getByTestId('wallet-tx-balance-input'));
    await user.type(screen.getByTestId('wallet-tx-balance-input'), '1247');
    await user.click(screen.getByTestId('wallet-tx-submit'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalled();
    });

    const body = (apiRequest as any).mock.calls[0]?.[2];
    expect(body.reason).toBe('session_result');
    expect(body.sessionId).toBe('SES-1');
  });

  it('modo balance + prop sessionId AUSENTE -> submit envia reason=manual_report + sem sessionId', async () => {
    // RED: comportamento NOVO. Hoje dialog forca session_result mesmo sem sessionId.
    (apiRequest as any).mockResolvedValue({
      transaction: { id: 'tx_a', reason: 'manual_report', sessionId: null },
      wallet: { ...mockWallet, balance: '1247' },
    });

    const user = userEvent.setup();
    render(withClient(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={mockWallet as any} />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));
    await user.clear(screen.getByTestId('wallet-tx-balance-input'));
    await user.type(screen.getByTestId('wallet-tx-balance-input'), '1247');
    await user.click(screen.getByTestId('wallet-tx-submit'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalled();
    });

    const body = (apiRequest as any).mock.calls[0]?.[2];
    expect(body.reason).toBe('manual_report');
    expect(body.sessionId).toBeUndefined();
  });

  it('helper text PT-BR "Sem sessao ativa" quando standalone (data-testid wallet-tx-reason-helper)', async () => {
    // RED: helper text + data-testid ainda nao existem
    const user = userEvent.setup();
    render(withClient(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={mockWallet as any} />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));

    await waitFor(() => {
      const helper = screen.getByTestId('wallet-tx-reason-helper');
      expect(helper).toBeTruthy();
      expect(helper.textContent?.toLowerCase()).toMatch(/sem sessao|report manual/);
    });
  });

  it('helper text PT-BR "Vinculado a sessao" quando sessionId presente', async () => {
    // RED: nova prop + texto dinamico
    const user = userEvent.setup();
    render(withClient(
      <WalletTransactionDialog
        open
        onOpenChange={() => {}}
        wallet={mockWallet as any}
        // @ts-expect-error — prop nao existe ainda
        sessionId="SES-1"
      />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));

    await waitFor(() => {
      const helper = screen.getByTestId('wallet-tx-reason-helper');
      expect(helper).toBeTruthy();
      expect(helper.textContent?.toLowerCase()).toMatch(/vinculad|sessao/);
    });
  });

  it('helper visible APENAS em modo balance (NAO em modo movement)', async () => {
    // RED: helper deve sumir quando em movement
    const user = userEvent.setup();
    render(withClient(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={mockWallet as any} />,
    ));

    // movement default — helper NAO existe
    expect(screen.queryByTestId('wallet-tx-reason-helper')).toBeNull();

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));
    await waitFor(() => {
      expect(screen.getByTestId('wallet-tx-reason-helper')).toBeTruthy();
    });

    // volta ao movement — helper somе
    await user.click(screen.getByTestId('wallet-tx-mode-movement'));
    await waitFor(() => {
      expect(screen.queryByTestId('wallet-tx-reason-helper')).toBeNull();
    });
  });

  it('submit success em manual_report invalida queries grind-history e dashboard (#12)', async () => {
    // RED: invalidations adicionais ainda nao incluem grind-history nem dashboard
    (apiRequest as any).mockResolvedValue({
      transaction: { id: 'tx_a', reason: 'manual_report', sessionId: null },
      wallet: { ...mockWallet, balance: '1247' },
    });

    const user = userEvent.setup();
    render(withClient(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={mockWallet as any} />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));
    await user.clear(screen.getByTestId('wallet-tx-balance-input'));
    await user.type(screen.getByTestId('wallet-tx-balance-input'), '1247');
    await user.click(screen.getByTestId('wallet-tx-submit'));

    await waitFor(() => {
      expect((queryClient.invalidateQueries as any)).toHaveBeenCalled();
    });

    // Coletar todas chaves invalidadas
    const calls = (queryClient.invalidateQueries as any).mock.calls.map((c: any) => c[0]);
    const flatKeys = calls.map((c: any) => Array.isArray(c?.queryKey) ? c.queryKey.join(':') : String(c?.queryKey ?? ''));
    const hasGrindHistory = flatKeys.some((k: string) => k.includes('grind') || k.includes('history'));
    const hasDashboard = flatKeys.some((k: string) => k.includes('dashboard') || k.includes('roi'));
    expect(hasGrindHistory).toBe(true);
    expect(hasDashboard).toBe(true);
  });

  it('helper text estavel mesmo sem clicar submit (renderiza apenas por mode change)', async () => {
    // RED: garantir que helper aparece com mode change sem precisar interacao adicional
    const user = userEvent.setup();
    render(withClient(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={mockWallet as any} />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));
    await waitFor(() => {
      expect(screen.getByTestId('wallet-tx-reason-helper')).toBeTruthy();
    });
  });

  it('modo balance NAO renderiza campo wallet-tx-session-id-input (auto-derivado da prop)', async () => {
    // RED: hoje dialog mostra campo session_id-input quando reason=session_result.
    // Spec exige que sessionId vem da prop, nao input manual.
    const user = userEvent.setup();
    render(withClient(
      <WalletTransactionDialog
        open
        onOpenChange={() => {}}
        wallet={mockWallet as any}
        // @ts-expect-error — prop nova
        sessionId="SES-1"
      />,
    ));

    await user.click(screen.getByTestId('wallet-tx-mode-balance'));

    // Em modo balance, NAO deve haver input manual de sessionId — vem da prop
    expect(screen.queryByTestId('wallet-tx-session-id-input')).toBeNull();
  });

  it('regression: modo movement inalterado (sem helper, dialog continua)', async () => {
    render(withClient(
      <WalletTransactionDialog open onOpenChange={() => {}} wallet={mockWallet as any} />,
    ));
    expect(screen.getByTestId('wallet-tx-direction-select')).toBeTruthy();
    expect(screen.getByTestId('wallet-tx-amount-input')).toBeTruthy();
    expect(screen.queryByTestId('wallet-tx-reason-helper')).toBeNull();
  });
});
