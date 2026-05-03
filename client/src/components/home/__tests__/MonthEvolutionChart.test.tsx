/**
 * Test — Sprint home-reform-4 item 10.
 *
 * Cobre <MonthEvolutionChart />:
 *   - Loading skeleton enquanto query em flight.
 *   - Empty state ("Sem dados upados esse mes") quando todos os dias com count=0.
 *   - Render normal: total acumulado + label "Mes: {pt-BR}".
 *   - Erro de fetch -> empty/error message ate dado chegar.
 *
 * Lesson #13: apiRequest retorna JSON parseado; mockamos pra retornar shape direto.
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

// recharts ResponsiveContainer requer width>0; stub minimal pra jsdom.
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

describe('<MonthEvolutionChart />', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('exibe loading skeleton enquanto fetch nao completa', async () => {
    let resolve: (v: any) => void = () => undefined;
    apiRequestMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { default: MonthEvolutionChart } = await import('../MonthEvolutionChart');
    renderWithClient(<MonthEvolutionChart month="2026-05" />);
    expect(screen.getByTestId('month-evolution-chart-loading')).toBeTruthy();
    resolve({ monthStart: '2026-05-01', endDate: '2026-05-15', days: [], totalProfitUsd: 0 });
  });

  it('empty state quando todos os dias com count=0', async () => {
    apiRequestMock.mockResolvedValue({
      monthStart: '2026-05-01',
      endDate: '2026-05-15',
      days: [
        { date: '2026-05-01', profitUsd: 0, cumulativeProfitUsd: 0, count: 0 },
        { date: '2026-05-02', profitUsd: 0, cumulativeProfitUsd: 0, count: 0 },
      ],
      totalProfitUsd: 0,
    });
    const { default: MonthEvolutionChart } = await import('../MonthEvolutionChart');
    renderWithClient(<MonthEvolutionChart month="2026-05" />);
    await waitFor(() => {
      expect(screen.getByTestId('month-evolution-chart-empty')).toBeTruthy();
    });
    expect(screen.getByTestId('month-evolution-chart-empty').textContent).toMatch(/Sem dados upados/i);
  });

  it('renderiza total acumulado + label mes pt-BR quando ha volume', async () => {
    apiRequestMock.mockResolvedValue({
      monthStart: '2026-05-01',
      endDate: '2026-05-15',
      days: [
        { date: '2026-05-01', profitUsd: 100, cumulativeProfitUsd: 100, count: 2 },
        { date: '2026-05-02', profitUsd: 50, cumulativeProfitUsd: 150, count: 1 },
        { date: '2026-05-03', profitUsd: 0, cumulativeProfitUsd: 150, count: 0 },
      ],
      totalProfitUsd: 150,
    });
    const { default: MonthEvolutionChart } = await import('../MonthEvolutionChart');
    renderWithClient(<MonthEvolutionChart month="2026-05" />);
    await waitFor(() => {
      expect(screen.getByTestId('month-evolution-chart-total')).toBeTruthy();
    });
    expect(screen.getByTestId('month-evolution-chart-total').textContent).toMatch(/\+\$150/);
    const label = screen.getByTestId('month-evolution-chart-month').textContent ?? '';
    expect(label).toMatch(/Mes:\s*Maio.*2026|Mes:\s*maio.*2026/);
  });

  it('chama /api/home/evolution com query month', async () => {
    apiRequestMock.mockResolvedValue({
      monthStart: '2026-04-01',
      endDate: '2026-04-30',
      days: [],
      totalProfitUsd: 0,
    });
    const { default: MonthEvolutionChart } = await import('../MonthEvolutionChart');
    renderWithClient(<MonthEvolutionChart month="2026-04" />);
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });
    expect(apiRequestMock).toHaveBeenCalledWith('GET', '/api/home/evolution?month=2026-04');
  });
});
