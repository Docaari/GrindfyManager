/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-17 (F8 Pending hands top 5).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-17, §5.9 F8, §3 D13
 *
 * Status RED: componente NAO existe em
 * `client/src/components/home/PendingHandsList.tsx`.
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

const hands = [
  { id: 'H1', hero: 'AQ on K72r', context: 'UTG vs BB', tag: '3-bet pot', ageRelative: 'ha 2d' },
  { id: 'H2', hero: 'JJ on T84tt', context: 'CO vs BTN', tag: 'overpair', ageRelative: 'ha 1d' },
  { id: 'H3', hero: '99 on 9TJ', context: 'BTN vs BB', tag: 'set', ageRelative: 'ha 5h' },
  { id: 'H4', hero: 'KK on AT2', context: 'SB vs BTN', tag: 'overpair', ageRelative: 'ha 3d' },
  { id: 'H5', hero: '76s on 568', context: 'BB vs BTN', tag: 'OESD', ageRelative: 'ha 6d' },
];

describe('<PendingHandsList /> — render', () => {
  it('renderiza ate 5 cards', async () => {
    const { default: PendingHandsList } = await import('../PendingHandsList');
    render(<PendingHandsList data={hands} />);
    const cards = screen.getAllByTestId(/^pending-hand-card-/);
    expect(cards.length).toBe(5);
  });

  it('cada card mostra hero + context + tag + ageRelative', async () => {
    const { default: PendingHandsList } = await import('../PendingHandsList');
    render(<PendingHandsList data={[hands[0]]} />);
    const card = screen.getByTestId('pending-hand-card-H1');
    expect(card.textContent).toContain('AQ on K72r');
    expect(card.textContent).toContain('UTG vs BB');
    expect(card.textContent).toContain('ha 2d');
  });
});

describe('<PendingHandsList /> — empty state', () => {
  it('com data=[] mostra mensagem positiva', async () => {
    const { default: PendingHandsList } = await import('../PendingHandsList');
    render(<PendingHandsList data={[]} />);
    expect(screen.getByText(/em dia/i)).toBeInTheDocument();
  });

  it('empty state NAO tem CTA (RF-17 AC #5)', async () => {
    const { default: PendingHandsList } = await import('../PendingHandsList');
    render(<PendingHandsList data={[]} />);
    // Empty state nao tem testid de CTA
    const ctas = screen.queryAllByTestId(/^pending-hands-empty-cta/);
    expect(ctas.length).toBe(0);
  });
});

describe('<PendingHandsList /> — CTA rodape', () => {
  it('mostra link "Revisar todas" -> /estudos', async () => {
    const { default: PendingHandsList } = await import('../PendingHandsList');
    render(<PendingHandsList data={hands} />);
    const cta = screen.getByTestId('pending-hands-cta-revisar-todas');
    expect(cta).toBeInTheDocument();
    expect(cta.getAttribute('href')).toBe('/estudos');
  });
});

describe('<PendingHandsList /> — click navigation', () => {
  it('card link para /estudos?spot=:id', async () => {
    const { default: PendingHandsList } = await import('../PendingHandsList');
    render(<PendingHandsList data={[hands[0]]} />);
    const card = screen.getByTestId('pending-hand-card-H1');
    const link = card.querySelector('a');
    expect(link?.getAttribute('href')).toMatch(/\/estudos\?spot=H1/);
  });
});
