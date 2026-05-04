/**
 * Test — Sprint home-reform-5 item 7.
 *
 * Spec: Docs/specs/home-reform-5.md item 7 (Dashboard All Time + 6 KPIs).
 *
 * Cobre <DashboardAllTimeCard />:
 *   - 6 KPIs (Torneios | Profit | ROI | ITM | Mesas Finais | Cravadas).
 *   - Header "Dashboard - All Time".
 *   - Empty state quando data null OU tournaments=0.
 *   - Profit color por sinal.
 *   - Card link para /dashboard.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/', vi.fn()],
}));

describe('<DashboardAllTimeCard /> — KPIs preenchidos', () => {
  it('renderiza 6 KPIs quando data presente', async () => {
    const { default: DashboardAllTimeCard } = await import('../DashboardAllTimeCard');
    render(
      <DashboardAllTimeCard
        data={{
          tournaments: 124,
          profit: -255.24,
          invested: 1467.24,
          roi: -17.4,
          itm: 22,
          finalTables: 5,
          wins: 1,
        }}
      />,
    );
    expect(screen.getByTestId('dashboard-all-time-kpi-tournaments').textContent).toMatch(/124/);
    expect(screen.getByTestId('dashboard-all-time-kpi-profit').textContent).toMatch(/-\$255/);
    expect(screen.getByTestId('dashboard-all-time-kpi-roi').textContent).toMatch(/-17\.4%/);
    expect(screen.getByTestId('dashboard-all-time-kpi-itm').textContent).toMatch(/22/);
    expect(screen.getByTestId('dashboard-all-time-kpi-final-tables').textContent).toMatch(/5/);
    expect(screen.getByTestId('dashboard-all-time-kpi-wins').textContent).toMatch(/1/);
  });

  it('header com label "All Time"', async () => {
    const { default: DashboardAllTimeCard } = await import('../DashboardAllTimeCard');
    const { container } = render(
      <DashboardAllTimeCard
        data={{
          tournaments: 1,
          profit: 0,
          invested: 1,
          roi: 0,
          itm: 0,
          finalTables: 0,
          wins: 0,
        }}
      />,
    );
    expect(container.textContent).toMatch(/All Time/i);
    expect(container.textContent).toMatch(/Dashboard/i);
  });

  it('profit positivo renderiza com cor verde', async () => {
    const { default: DashboardAllTimeCard } = await import('../DashboardAllTimeCard');
    render(
      <DashboardAllTimeCard
        data={{
          tournaments: 50,
          profit: 800,
          invested: 2000,
          roi: 40,
          itm: 10,
          finalTables: 2,
          wins: 1,
        }}
      />,
    );
    const profit = screen.getByTestId('dashboard-all-time-kpi-profit');
    expect(profit.querySelector('.text-emerald-500')).toBeTruthy();
  });
});

describe('<DashboardAllTimeCard /> — empty state', () => {
  it('data null cai em empty state', async () => {
    const { default: DashboardAllTimeCard } = await import('../DashboardAllTimeCard');
    render(<DashboardAllTimeCard data={null} />);
    expect(screen.getByTestId('dashboard-all-time-card-empty')).toBeTruthy();
  });

  it('tournaments=0 mostra empty state', async () => {
    const { default: DashboardAllTimeCard } = await import('../DashboardAllTimeCard');
    render(
      <DashboardAllTimeCard
        data={{
          tournaments: 0,
          profit: 0,
          invested: 0,
          roi: null,
          itm: 0,
          finalTables: 0,
          wins: 0,
        }}
      />,
    );
    expect(screen.getByTestId('dashboard-all-time-card-empty')).toBeTruthy();
    expect(screen.queryByTestId('dashboard-all-time-kpi-tournaments')).toBeNull();
  });
});

describe('<DashboardAllTimeCard /> — link para /dashboard', () => {
  it('card raiz tem href="/dashboard"', async () => {
    const { default: DashboardAllTimeCard } = await import('../DashboardAllTimeCard');
    const { container } = render(
      <DashboardAllTimeCard
        data={{
          tournaments: 5,
          profit: 0,
          invested: 5,
          roi: 0,
          itm: 0,
          finalTables: 0,
          wins: 0,
        }}
      />,
    );
    const a = container.querySelector('a[href="/dashboard"]');
    expect(a).toBeTruthy();
  });
});
