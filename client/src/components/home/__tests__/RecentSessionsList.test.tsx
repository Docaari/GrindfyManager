/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-15 (F2 ultimas sessoes top 5).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-15, §5.7 F2, §3 D11
 *
 * Status RED: componente NAO existe em
 * `client/src/components/home/RecentSessionsList.tsx`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/', vi.fn()],
}));

const mockEmit = vi.fn();
vi.mock('@/lib/tracker', () => ({
  emit: (...args: any[]) => mockEmit(...args),
}));

beforeEach(() => {
  mockEmit.mockReset();
});

const sessions = [
  { id: 'S1', date: '2026-05-01', pnlUsd: 250, tournamentCount: 8, primaryPlatform: 'GG', status: 'finalized' },
  { id: 'S2', date: '2026-04-30', pnlUsd: -100, tournamentCount: 5, primaryPlatform: 'Stars', status: 'ended' },
  { id: 'S3', date: '2026-04-29', pnlUsd: 0, tournamentCount: 3, primaryPlatform: 'WPN', status: 'finalized' },
  { id: 'S4', date: '2026-04-28', pnlUsd: 1500, tournamentCount: 12, primaryPlatform: 'GG', status: 'live' },
  { id: 'S5', date: '2026-04-27', pnlUsd: -50, tournamentCount: 4, primaryPlatform: 'Stars', status: 'finalized' },
];

describe('<RecentSessionsList /> — lista 5 cards', () => {
  it('renderiza ate 5 cards quando data tem 5+', async () => {
    const { default: RecentSessionsList } = await import('../RecentSessionsList');
    render(<RecentSessionsList data={sessions} />);
    const cards = screen.getAllByTestId(/^recent-session-card-/);
    expect(cards.length).toBe(5);
  });

  it('renderiza N cards quando data tem N < 5', async () => {
    const { default: RecentSessionsList } = await import('../RecentSessionsList');
    render(<RecentSessionsList data={sessions.slice(0, 2)} />);
    const cards = screen.getAllByTestId(/^recent-session-card-/);
    expect(cards.length).toBe(2);
  });
});

describe('<RecentSessionsList /> — cor PnL', () => {
  it('PnL > 0 tem classe verde (text-green ou text-emerald)', async () => {
    const { default: RecentSessionsList } = await import('../RecentSessionsList');
    render(<RecentSessionsList data={[sessions[0]]} />);
    const pnlEl = screen.getByTestId('recent-session-pnl-S1');
    expect(pnlEl.className).toMatch(/text-(green|emerald|success)/);
  });

  it('PnL < 0 tem classe vermelha (text-red ou text-destructive)', async () => {
    const { default: RecentSessionsList } = await import('../RecentSessionsList');
    render(<RecentSessionsList data={[sessions[1]]} />);
    const pnlEl = screen.getByTestId('recent-session-pnl-S2');
    expect(pnlEl.className).toMatch(/text-(red|destructive|danger)/);
  });

  it('PnL = 0 NAO tem classe verde nem vermelha', async () => {
    const { default: RecentSessionsList } = await import('../RecentSessionsList');
    render(<RecentSessionsList data={[sessions[2]]} />);
    const pnlEl = screen.getByTestId('recent-session-pnl-S3');
    expect(pnlEl.className).not.toMatch(/text-(green|emerald|red|destructive)/);
  });
});

describe('<RecentSessionsList /> — empty state', () => {
  it('com data=[] mostra mensagem onboarding', async () => {
    const { default: RecentSessionsList } = await import('../RecentSessionsList');
    render(<RecentSessionsList data={[]} />);
    expect(screen.getByText(/nenhuma sessao registrada/i)).toBeInTheDocument();
  });

  it('com data=[] mostra 2 CTAs (Importar CSV + Iniciar sessao live)', async () => {
    const { default: RecentSessionsList } = await import('../RecentSessionsList');
    render(<RecentSessionsList data={[]} />);
    expect(screen.getByTestId('recent-sessions-empty-cta-import')).toBeInTheDocument();
    expect(screen.getByTestId('recent-sessions-empty-cta-live')).toBeInTheDocument();
  });
});

describe('<RecentSessionsList /> — CTA rodape', () => {
  it('renderiza link "Ver historico completo"', async () => {
    const { default: RecentSessionsList } = await import('../RecentSessionsList');
    render(<RecentSessionsList data={sessions} />);
    const cta = screen.getByTestId('recent-sessions-cta-ver-historico');
    expect(cta).toBeInTheDocument();
  });
});
