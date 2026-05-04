/**
 * Test — Sprint home-reform-5 item 7.
 *
 * Spec: Docs/specs/home-reform-5.md item 7 (Grafico evolucao all-time).
 *
 * Cobre <AllTimeEvolutionChart />:
 *   - Loading skeleton enquanto query em flight.
 *   - Empty state quando todos os meses com count=0.
 *   - Render normal: total acumulado all-time + chart visivel.
 *   - Chama /api/home/evolution?scope=all (sem month).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
}));

vi.mock('recharts', async () => {
  const actual = await vi.importActual<any>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) => (
      <div style={{ width: 600, height: 280 }} data-testid="rc-container">
        {children}
      </div>
    ),
  };
});

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('<AllTimeEvolutionChart />', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('exibe loading skeleton enquanto fetch nao completa', async () => {
    let resolve: (v: any) => void = () => undefined;
    apiRequestMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { default: AllTimeEvolutionChart } = await import('../AllTimeEvolutionChart');
    renderWithClient(<AllTimeEvolutionChart />);
    expect(screen.getByTestId('all-time-evolution-chart-loading')).toBeTruthy();
    resolve({ months: [], totalProfitUsd: 0 });
  });

  it('empty state quando todos os meses com count=0', async () => {
    apiRequestMock.mockResolvedValue({
      months: [
        { month: '2024-01', profitUsd: 0, cumulativeProfitUsd: 0, count: 0 },
        { month: '2024-02', profitUsd: 0, cumulativeProfitUsd: 0, count: 0 },
      ],
      totalProfitUsd: 0,
    });
    const { default: AllTimeEvolutionChart } = await import('../AllTimeEvolutionChart');
    renderWithClient(<AllTimeEvolutionChart />);
    await waitFor(() => {
      expect(screen.getByTestId('all-time-evolution-chart-empty')).toBeTruthy();
    });
  });

  it('renderiza total acumulado all-time quando ha volume', async () => {
    apiRequestMock.mockResolvedValue({
      months: [
        { month: '2024-01', profitUsd: 100, cumulativeProfitUsd: 100, count: 5 },
        { month: '2024-02', profitUsd: 50, cumulativeProfitUsd: 150, count: 3 },
        { month: '2024-03', profitUsd: -30, cumulativeProfitUsd: 120, count: 4 },
      ],
      totalProfitUsd: 120,
    });
    const { default: AllTimeEvolutionChart } = await import('../AllTimeEvolutionChart');
    renderWithClient(<AllTimeEvolutionChart />);
    await waitFor(() => {
      expect(screen.getByTestId('all-time-evolution-chart-total')).toBeTruthy();
    });
    expect(screen.getByTestId('all-time-evolution-chart-total').textContent).toMatch(/\+\$120/);
  });

  it('chama /api/home/evolution com scope=all', async () => {
    apiRequestMock.mockResolvedValue({ months: [], totalProfitUsd: 0 });
    const { default: AllTimeEvolutionChart } = await import('../AllTimeEvolutionChart');
    renderWithClient(<AllTimeEvolutionChart />);
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });
    expect(apiRequestMock).toHaveBeenCalledWith('GET', '/api/home/evolution?scope=all');
  });
});
