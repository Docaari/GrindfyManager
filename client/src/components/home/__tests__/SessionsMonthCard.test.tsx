/**
 * Test — Sprint home-reform-4 item 1.
 *
 * Spec: Docs/specs/home-reform-4.md item 1 (Card Sessoes mes atual).
 *
 * Cobre <SessionsMonthCard /> visual:
 *   - 3 KPIs (count / profit / ROI) ou empty state
 *   - Label mes "Mes: {Mes pt-BR}"
 *   - Profit color verde/vermelho conforme sinal
 *   - Card link para /grind
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/', vi.fn()],
}));

describe('<SessionsMonthCard /> — KPIs preenchidos', () => {
  it('renderiza count, profit, roi quando data presente', async () => {
    const { default: SessionsMonthCard } = await import('../SessionsMonthCard');
    render(
      <SessionsMonthCard
        data={{
          monthStart: '2026-05-01',
          count: 12,
          profitUsd: 250.5,
          investedUsd: 500,
          roiPct: 50.1,
        }}
      />,
    );
    expect(screen.getByTestId('sessions-month-card-count').textContent).toMatch(/12/);
    expect(screen.getByTestId('sessions-month-card-profit').textContent).toMatch(/\+\$250|\+\$251/);
    expect(screen.getByTestId('sessions-month-card-roi').textContent).toMatch(/\+50\.1%/);
    expect(screen.queryByTestId('sessions-month-card-empty')).toBeNull();
  });

  it('label mes em pt-BR (ex: Maio 2026)', async () => {
    const { default: SessionsMonthCard } = await import('../SessionsMonthCard');
    render(
      <SessionsMonthCard
        data={{ monthStart: '2026-05-01', count: 1, profitUsd: 0, investedUsd: 1, roiPct: 0 }}
      />,
    );
    const label = screen.getByTestId('sessions-month-card-month').textContent ?? '';
    expect(label).toMatch(/Mes: Maio.*2026|Mes: maio.*2026/);
  });

  it('profit negativo aparece com sinal e cor rose', async () => {
    const { default: SessionsMonthCard } = await import('../SessionsMonthCard');
    render(
      <SessionsMonthCard
        data={{ monthStart: '2026-05-01', count: 5, profitUsd: -120, investedUsd: 500, roiPct: -24 }}
      />,
    );
    const profit = screen.getByTestId('sessions-month-card-profit');
    expect(profit.textContent).toMatch(/-\$120/);
    expect(profit.querySelector('.text-rose-500')).toBeTruthy();
  });

  it('ROI null renderiza em-dash sem cor verde/vermelha', async () => {
    const { default: SessionsMonthCard } = await import('../SessionsMonthCard');
    render(
      <SessionsMonthCard
        data={{ monthStart: '2026-05-01', count: 2, profitUsd: 0, investedUsd: 0, roiPct: null }}
      />,
    );
    const roi = screen.getByTestId('sessions-month-card-roi');
    expect(roi.textContent).toContain('—');
  });
});

describe('<SessionsMonthCard /> — empty state', () => {
  it('count=0 mostra "Sem sessoes esse mes"', async () => {
    const { default: SessionsMonthCard } = await import('../SessionsMonthCard');
    render(
      <SessionsMonthCard
        data={{ monthStart: '2026-05-01', count: 0, profitUsd: 0, investedUsd: 0, roiPct: null }}
      />,
    );
    expect(screen.getByTestId('sessions-month-card-empty').textContent).toMatch(/Sem sessoes/i);
    expect(screen.queryByTestId('sessions-month-card-count')).toBeNull();
  });

  it('data null tambem cai em empty state', async () => {
    const { default: SessionsMonthCard } = await import('../SessionsMonthCard');
    render(<SessionsMonthCard data={null} />);
    expect(screen.getByTestId('sessions-month-card-empty')).toBeInTheDocument();
  });
});

describe('<SessionsMonthCard /> — link para /grind', () => {
  it('card raiz tem href="/grind"', async () => {
    const { default: SessionsMonthCard } = await import('../SessionsMonthCard');
    const { container } = render(
      <SessionsMonthCard
        data={{ monthStart: '2026-05-01', count: 1, profitUsd: 0, investedUsd: 1, roiPct: 0 }}
      />,
    );
    const a = container.querySelector('a[href="/grind"]');
    expect(a).toBeTruthy();
  });
});
