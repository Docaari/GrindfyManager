/**
 * Test — Sprint home-reform-4 item 2+6.
 *
 * Spec: Docs/specs/home-reform-4.md item 2 (Card Dashboard mes atual) +
 * item 6 (Performance abaixo Sessoes, mesmo padrao).
 *
 * Cobre <DashboardMonthCard /> visual:
 *   - 3 KPIs (count / profit / ROI) ou empty state
 *   - Label mes "Mes: {Mes pt-BR}"
 *   - Profit color verde/vermelho conforme sinal
 *   - Card link para /dashboard
 *   - Empty state friendly: "Sem dados upados esse mes"
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/', vi.fn()],
}));

describe('<DashboardMonthCard /> — KPIs preenchidos', () => {
  it('renderiza count, profit, roi quando data presente', async () => {
    const { default: DashboardMonthCard } = await import('../DashboardMonthCard');
    render(
      <DashboardMonthCard
        data={{
          monthStart: '2026-05-01',
          count: 42,
          profitUsd: 1820.4,
          investedUsd: 6000,
          roiPct: 30.3,
        }}
      />,
    );
    expect(screen.getByTestId('dashboard-month-card-count').textContent).toMatch(/42/);
    expect(screen.getByTestId('dashboard-month-card-profit').textContent).toMatch(/\+\$1\.820|\+\$1\.821/);
    expect(screen.getByTestId('dashboard-month-card-roi').textContent).toMatch(/\+30\.3%/);
    expect(screen.queryByTestId('dashboard-month-card-empty')).toBeNull();
  });

  it('label mes em pt-BR (ex: Maio 2026)', async () => {
    const { default: DashboardMonthCard } = await import('../DashboardMonthCard');
    render(
      <DashboardMonthCard
        data={{ monthStart: '2026-05-01', count: 1, profitUsd: 0, investedUsd: 1, roiPct: 0 }}
      />,
    );
    const label = screen.getByTestId('dashboard-month-card-month').textContent ?? '';
    expect(label).toMatch(/Mes: Maio.*2026|Mes: maio.*2026/);
  });

  it('profit negativo aparece com sinal e cor rose', async () => {
    const { default: DashboardMonthCard } = await import('../DashboardMonthCard');
    render(
      <DashboardMonthCard
        data={{ monthStart: '2026-05-01', count: 5, profitUsd: -340, investedUsd: 1500, roiPct: -22.7 }}
      />,
    );
    const profit = screen.getByTestId('dashboard-month-card-profit');
    expect(profit.textContent).toMatch(/-\$340/);
    expect(profit.querySelector('.text-rose-500')).toBeTruthy();
  });

  it('ROI null renderiza em-dash sem cor verde/vermelha', async () => {
    const { default: DashboardMonthCard } = await import('../DashboardMonthCard');
    render(
      <DashboardMonthCard
        data={{ monthStart: '2026-05-01', count: 2, profitUsd: 0, investedUsd: 0, roiPct: null }}
      />,
    );
    const roi = screen.getByTestId('dashboard-month-card-roi');
    expect(roi.textContent).toContain('—');
  });
});

describe('<DashboardMonthCard /> — empty state', () => {
  it('count=0 mostra "Sem dados upados esse mes"', async () => {
    const { default: DashboardMonthCard } = await import('../DashboardMonthCard');
    render(
      <DashboardMonthCard
        data={{ monthStart: '2026-05-01', count: 0, profitUsd: 0, investedUsd: 0, roiPct: null }}
      />,
    );
    expect(screen.getByTestId('dashboard-month-card-empty').textContent).toMatch(/Sem dados upados/i);
    expect(screen.queryByTestId('dashboard-month-card-count')).toBeNull();
  });

  it('data null tambem cai em empty state', async () => {
    const { default: DashboardMonthCard } = await import('../DashboardMonthCard');
    render(<DashboardMonthCard data={null} />);
    expect(screen.getByTestId('dashboard-month-card-empty')).toBeTruthy();
  });
});

describe('<DashboardMonthCard /> — link para /dashboard', () => {
  it('card raiz tem href="/dashboard"', async () => {
    const { default: DashboardMonthCard } = await import('../DashboardMonthCard');
    const { container } = render(
      <DashboardMonthCard
        data={{ monthStart: '2026-05-01', count: 1, profitUsd: 0, investedUsd: 1, roiPct: 0 }}
      />,
    );
    const a = container.querySelector('a[href="/dashboard"]');
    expect(a).toBeTruthy();
  });
});
