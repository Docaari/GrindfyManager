/**
 * WalletActivityPanel — Bankroll-Reform 2026-05-05 (MEDIUM-6 fix)
 *
 * Cobre:
 *   - Tabs Resultados <-> Movimentacoes
 *   - Filtros: results=session_result+manual_report+rakeback,
 *              movements exclui esses 3
 *   - Soma cumulativa correta (results + rakeback)
 *   - "Ver mais" expande lista principal de transacoes
 *   - "Ver mais" interno na tab Movimentacoes
 *
 * Mock recharts (jsdom nao tem layout — sem mock, ResponsiveContainer crasha).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<any>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) => (
      <div style={{ width: 400, height: 200 }}>{children}</div>
    ),
  };
});

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { apiRequest } from '../../../client/src/lib/queryClient';
import { WalletActivityPanel } from '../../../client/src/components/bankroll/WalletActivityPanel';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

const baseTxs = [
  // Result wins/losses
  { id: 't1', occurredAt: '2026-04-01T12:00:00Z', direction: 'in', nativeAmount: '100', nativeCurrency: 'USD', reason: 'session_result' },
  { id: 't2', occurredAt: '2026-04-05T12:00:00Z', direction: 'out', nativeAmount: '30', nativeCurrency: 'USD', reason: 'session_result' },
  { id: 't3', occurredAt: '2026-04-10T12:00:00Z', direction: 'in', nativeAmount: '20', nativeCurrency: 'USD', reason: 'rakeback' },
  // Manual report
  { id: 't4', occurredAt: '2026-04-15T12:00:00Z', direction: 'in', nativeAmount: '50', nativeCurrency: 'USD', reason: 'manual_report' },
  // Movements (excluded da tab results)
  { id: 't5', occurredAt: '2026-04-02T12:00:00Z', direction: 'in', nativeAmount: '500', nativeCurrency: 'USD', reason: 'deposit' },
  { id: 't6', occurredAt: '2026-04-20T12:00:00Z', direction: 'out', nativeAmount: '200', nativeCurrency: 'USD', reason: 'withdrawal' },
  { id: 't7', occurredAt: '2026-04-22T12:00:00Z', direction: 'in', nativeAmount: '15', nativeCurrency: 'USD', reason: 'manual_adjustment' },
];

describe('WalletActivityPanel', () => {
  it('default: tab Resultados ativa', async () => {
    (apiRequest as any).mockResolvedValue({ transactions: baseTxs });

    render(withClient(<WalletActivityPanel walletId="w1" nativeCurrency="USD" />));

    await waitFor(() => {
      expect(screen.getByTestId('wallet-activity-results-pane')).toBeTruthy();
    });
    expect(screen.queryByTestId('wallet-activity-movements-pane')).toBeNull();
  });

  it('total no canto superior direito = soma results + rakeback', async () => {
    (apiRequest as any).mockResolvedValue({ transactions: baseTxs });

    render(withClient(<WalletActivityPanel walletId="w1" nativeCurrency="USD" />));

    await waitFor(() => {
      const total = screen.getByTestId('wallet-activity-results-total');
      // session_result: +100 -30 = +70
      // rakeback: +20
      // manual_report: +50
      // Total = +140
      expect(total.textContent).toMatch(/140/);
    });
  });

  it('total negativo aparece com sinal vermelho', async () => {
    (apiRequest as any).mockResolvedValue({
      transactions: [
        { id: 't1', occurredAt: '2026-04-01T12:00:00Z', direction: 'out', nativeAmount: '500', nativeCurrency: 'USD', reason: 'session_result' },
        { id: 't2', occurredAt: '2026-04-02T12:00:00Z', direction: 'in', nativeAmount: '50', nativeCurrency: 'USD', reason: 'rakeback' },
      ],
    });

    render(withClient(<WalletActivityPanel walletId="w1" nativeCurrency="USD" />));

    await waitFor(() => {
      const total = screen.getByTestId('wallet-activity-results-total');
      expect(total.textContent).toMatch(/-/);
      expect(total.className).toMatch(/rose|red/);
    });
  });

  it('switch para tab Movimentacoes muda pane', async () => {
    (apiRequest as any).mockResolvedValue({ transactions: baseTxs });

    const user = userEvent.setup();
    render(withClient(<WalletActivityPanel walletId="w1" nativeCurrency="USD" />));

    await waitFor(() => {
      expect(screen.getByTestId('wallet-activity-tab-movements')).toBeTruthy();
    });

    await user.click(screen.getByTestId('wallet-activity-tab-movements'));

    await waitFor(() => {
      expect(screen.getByTestId('wallet-activity-movements-pane')).toBeTruthy();
    });
    expect(screen.queryByTestId('wallet-activity-results-pane')).toBeNull();
  });

  it('Movimentacoes: Entradas/Saidas calculados sem incluir results/rakeback/manual_report', async () => {
    (apiRequest as any).mockResolvedValue({ transactions: baseTxs });

    const user = userEvent.setup();
    render(withClient(<WalletActivityPanel walletId="w1" nativeCurrency="USD" />));

    await user.click(await screen.findByTestId('wallet-activity-tab-movements'));

    await waitFor(() => {
      const inEl = screen.getByTestId('wallet-activity-movements-in');
      // deposit 500 + manual_adjustment 15 = 515
      expect(inEl.textContent).toMatch(/515/);
    });
    const outEl = screen.getByTestId('wallet-activity-movements-out');
    // withdrawal 200
    expect(outEl.textContent).toMatch(/200/);
  });

  it('Movimentacoes: lista exclui session_result/rakeback/manual_report', async () => {
    (apiRequest as any).mockResolvedValue({ transactions: baseTxs });

    const user = userEvent.setup();
    render(withClient(<WalletActivityPanel walletId="w1" nativeCurrency="USD" />));

    await user.click(await screen.findByTestId('wallet-activity-tab-movements'));

    await waitFor(() => {
      const list = screen.getByTestId('wallet-activity-movements-list');
      // 3 movements (deposit, withdrawal, manual_adjustment)
      expect(list.querySelectorAll('li').length).toBe(3);
      expect(list.textContent).not.toMatch(/Resultado de sessao|Rakeback|Saldo reportado/);
    });
  });

  it('Lista "Ultimas movimentacoes" renderiza so 10 + Ver mais expande', async () => {
    const many = Array.from({ length: 15 }).map((_, i) => ({
      id: `t${i}`,
      occurredAt: `2026-04-${String((i % 28) + 1).padStart(2, '0')}T12:00:00Z`,
      direction: 'in' as const,
      nativeAmount: '10',
      nativeCurrency: 'USD',
      reason: 'deposit',
    }));
    (apiRequest as any).mockResolvedValue({ transactions: many });

    render(withClient(<WalletActivityPanel walletId="w1" nativeCurrency="USD" />));

    await waitFor(() => {
      expect(screen.getByTestId('wallet-activity-tx-list')).toBeTruthy();
    });

    let listEl = screen.getByTestId('wallet-activity-tx-list');
    expect(listEl.querySelectorAll('li').length).toBe(10);

    const toggle = screen.getByTestId('wallet-activity-toggle-all');
    expect(toggle.textContent).toMatch(/5/); // 15 - 10
    fireEvent.click(toggle);

    await waitFor(() => {
      listEl = screen.getByTestId('wallet-activity-tx-list');
      expect(listEl.querySelectorAll('li').length).toBe(15);
    });
  });

  it('tab Movimentacoes tem Ver mais quando >10 movimentos', async () => {
    const manyMovements = Array.from({ length: 12 }).map((_, i) => ({
      id: `m${i}`,
      occurredAt: `2026-04-${String((i % 28) + 1).padStart(2, '0')}T12:00:00Z`,
      direction: 'in' as const,
      nativeAmount: '10',
      nativeCurrency: 'USD',
      reason: 'deposit',
    }));
    (apiRequest as any).mockResolvedValue({ transactions: manyMovements });

    const user = userEvent.setup();
    render(withClient(<WalletActivityPanel walletId="w1" nativeCurrency="USD" />));

    await user.click(await screen.findByTestId('wallet-activity-tab-movements'));

    await waitFor(() => {
      expect(screen.getByTestId('wallet-activity-movements-list')).toBeTruthy();
    });

    const list = screen.getByTestId('wallet-activity-movements-list');
    expect(list.querySelectorAll('li').length).toBe(10);

    const toggle = screen.getByTestId('wallet-activity-movements-toggle');
    expect(toggle.textContent).toMatch(/2/);
  });

  it('empty state quando wallet nao tem nenhuma transacao', async () => {
    (apiRequest as any).mockResolvedValue({ transactions: [] });

    render(withClient(<WalletActivityPanel walletId="w1" nativeCurrency="USD" />));

    await waitFor(() => {
      expect(screen.getByTestId('wallet-activity-results-pane').textContent).toMatch(
        /Nenhum resultado registrado/i,
      );
    });
  });
});
