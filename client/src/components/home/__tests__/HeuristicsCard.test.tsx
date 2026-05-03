/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-2 — RF-34 (B12 Heuristicas server-side, frontend card).
 *
 * Spec : Docs/specs/home-reform-2.md §3 B12, §5 RF-34
 * ADR  : Docs/architecture/decisions/108-home-heuristics-server-side-rules.md
 *
 * Status RED: componente NAO existe em
 * `client/src/components/home/HeuristicsCard.tsx`.
 *
 * Lessons aplicadas:
 *   #14  await import(...) em vez de require — ESM compat
 *   #15  vi.mock no top-level (sem nested vi.unmock)
 *   #2   data-testid estavel
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const mockNavigate = vi.fn();
vi.mock('wouter', () => ({
  Link: ({ href, children, onClick, ...rest }: any) => (
    <a
      href={href}
      onClick={(e: any) => {
        mockNavigate(href);
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
  useLocation: () => ['/', vi.fn()],
}));

const mockEmit = vi.fn();
vi.mock('@/lib/tracker', () => ({
  emit: (...args: any[]) => mockEmit(...args),
}));

beforeEach(() => {
  mockNavigate.mockReset();
  mockEmit.mockReset();
});

// ---------------------------------------------------------------------------
// Fixtures (shape RF-34)
// ---------------------------------------------------------------------------
const sampleHeuristics = [
  {
    id: 'roi-30d-vs-60d-drop',
    message: 'ROI 30d caiu 6.0 pp vs 60d. Revisar selecao de torneios.',
    severity: 'caution' as const,
    ctaHref: '/tournament-selector',
  },
  {
    id: 'best-day-of-week',
    message: 'Dom costuma ser seu melhor dia (ROI 18.2%).',
    severity: 'positive' as const,
    ctaHref: '/dashboard?period=60d',
  },
  {
    id: 'cash-pace-vs-baseline',
    message: 'Pace de cash 23%+ acima da media.',
    severity: 'positive' as const,
    ctaHref: '/dashboard',
  },
];

describe('<HeuristicsCard /> — render basico', () => {
  it('renderiza container com data-testid="home-heuristics-card"', async () => {
    const { default: HeuristicsCard } = await import('../HeuristicsCard');
    render(<HeuristicsCard data={sampleHeuristics} />);
    expect(screen.getByTestId('home-heuristics-card')).toBeInTheDocument();
  });

  it('renderiza ate 3 itens com testids estaveis por id', async () => {
    const { default: HeuristicsCard } = await import('../HeuristicsCard');
    render(<HeuristicsCard data={sampleHeuristics} />);
    const items = screen.getAllByTestId(/^home-heuristics-item-/);
    expect(items.length).toBe(3);
  });

  it('cada item mostra message + severity (cor / data-severity) + CTA quando ctaHref presente', async () => {
    const { default: HeuristicsCard } = await import('../HeuristicsCard');
    render(<HeuristicsCard data={[sampleHeuristics[0]]} />);
    const item = screen.getByTestId('home-heuristics-item-roi-30d-vs-60d-drop');
    expect(item.textContent).toMatch(/ROI 30d caiu/);
    // severity expressa via data-attr ou classe
    const sev = item.getAttribute('data-severity');
    expect(sev === 'caution' || /caution|amber|warning/i.test(item.className)).toBe(true);
    // CTA link
    const link = item.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/tournament-selector');
  });

  it('item sem ctaHref nao renderiza link (anchor opcional)', async () => {
    const { default: HeuristicsCard } = await import('../HeuristicsCard');
    const noCtaItem = [{ ...sampleHeuristics[0], ctaHref: null }];
    render(<HeuristicsCard data={noCtaItem} />);
    const item = screen.getByTestId('home-heuristics-item-roi-30d-vs-60d-drop');
    // Pode haver link de outros elementos da pagina, mas dentro do item nao.
    const innerLinks = item.querySelectorAll('a');
    expect(innerLinks.length).toBe(0);
  });
});

describe('<HeuristicsCard /> — empty state', () => {
  it('com data=[] bloco oculto silenciosamente (NAO renderiza placeholder)', async () => {
    const { default: HeuristicsCard } = await import('../HeuristicsCard');
    render(<HeuristicsCard data={[]} />);
    expect(screen.queryByTestId('home-heuristics-card')).toBeNull();
  });

  it('com data=null tambem bloco oculto', async () => {
    const { default: HeuristicsCard } = await import('../HeuristicsCard');
    render(<HeuristicsCard data={null as any} />);
    expect(screen.queryByTestId('home-heuristics-card')).toBeNull();
  });
});

describe('<HeuristicsCard /> — tracker', () => {
  it('emit("home_heuristics_view", { count }) no mount com count >= 1', async () => {
    const { default: HeuristicsCard } = await import('../HeuristicsCard');
    render(<HeuristicsCard data={sampleHeuristics} />);
    const found = mockEmit.mock.calls.find((c) => c[0] === 'home_heuristics_view');
    expect(found).toBeDefined();
    expect(found?.[1]).toMatchObject({ count: 3 });
  });

  it('NAO emit view quando data=[]', async () => {
    const { default: HeuristicsCard } = await import('../HeuristicsCard');
    render(<HeuristicsCard data={[]} />);
    const found = mockEmit.mock.calls.find((c) => c[0] === 'home_heuristics_view');
    expect(found).toBeUndefined();
  });

  it('emit click event com payload {id, severity}', async () => {
    const { default: HeuristicsCard } = await import('../HeuristicsCard');
    render(<HeuristicsCard data={[sampleHeuristics[0]]} />);
    const item = screen.getByTestId('home-heuristics-item-roi-30d-vs-60d-drop');
    const link = item.querySelector('a') ?? item;
    fireEvent.click(link);
    const found = mockEmit.mock.calls.find((c) => c[0] === 'home_heuristics_click');
    expect(found).toBeDefined();
    expect(found?.[1]).toMatchObject({ id: 'roi-30d-vs-60d-drop', severity: 'caution' });
  });
});
