/**
 * Test — Sprint home-reform-5 item 6.
 *
 * Spec: Docs/specs/home-reform-5.md Item 6.
 * Card "Sessoes Registradas" (renome "Performance") com 6 KPIs all-time:
 * Torneios | Profit | ROI | ITM | Mesas Finais | Cravadas.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
}));

describe('<SessionsRegisteredCard />', () => {
  it('mostra titulo "Sessoes Registradas"', async () => {
    const { default: SessionsRegisteredCard } = await import('../SessionsRegisteredCard');
    render(
      <SessionsRegisteredCard
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
    expect(screen.getByText(/Sessoes Registradas/i)).toBeInTheDocument();
  });

  it('renderiza os 6 KPIs com valores corretos (cenario founder real)', async () => {
    const { default: SessionsRegisteredCard } = await import('../SessionsRegisteredCard');
    render(
      <SessionsRegisteredCard
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
    expect(screen.getByTestId('sessions-registered-kpi-tournaments')).toHaveTextContent('124');
    expect(screen.getByTestId('sessions-registered-kpi-profit')).toHaveTextContent('-$255,24');
    expect(screen.getByTestId('sessions-registered-kpi-roi')).toHaveTextContent('-17.4%');
    expect(screen.getByTestId('sessions-registered-kpi-itm')).toHaveTextContent('22');
    expect(screen.getByTestId('sessions-registered-kpi-final-tables')).toHaveTextContent('5');
    expect(screen.getByTestId('sessions-registered-kpi-wins')).toHaveTextContent('1');
  });

  it('empty state quando data null', async () => {
    const { default: SessionsRegisteredCard } = await import('../SessionsRegisteredCard');
    render(<SessionsRegisteredCard data={null} />);
    expect(screen.getByTestId('sessions-registered-card-empty')).toBeInTheDocument();
  });

  it('empty state quando tournaments=0', async () => {
    const { default: SessionsRegisteredCard } = await import('../SessionsRegisteredCard');
    render(
      <SessionsRegisteredCard
        data={{ tournaments: 0, profit: 0, invested: 0, roi: null, itm: 0, finalTables: 0, wins: 0 }}
      />,
    );
    expect(screen.getByTestId('sessions-registered-card-empty')).toBeInTheDocument();
  });

  it('roi null mostra em-dash', async () => {
    const { default: SessionsRegisteredCard } = await import('../SessionsRegisteredCard');
    render(
      <SessionsRegisteredCard
        data={{ tournaments: 1, profit: 0, invested: 0, roi: null, itm: 0, finalTables: 0, wins: 0 }}
      />,
    );
    expect(screen.getByTestId('sessions-registered-kpi-roi')).toHaveTextContent('—');
  });
});
