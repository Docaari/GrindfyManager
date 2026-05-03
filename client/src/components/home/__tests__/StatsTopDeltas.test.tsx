/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-2 — RF-29 (B7 Stats Analyzer Top 3 Deltas).
 *
 * Spec : Docs/specs/home-reform-2.md §3 B7, §5 RF-29
 *
 * Status RED: componente NAO existe em
 * `client/src/components/home/StatsTopDeltas.tsx`.
 *
 * Lessons aplicadas:
 *   #14  await import(...) em vez de require — ESM compat
 *   #15  vi.mock no top-level (sem nested vi.unmock)
 *   #2   data-testid estavel
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock wouter
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Mock tracker — RNF telemetria
// ---------------------------------------------------------------------------
const mockEmit = vi.fn();
vi.mock('@/lib/tracker', () => ({
  emit: (...args: any[]) => mockEmit(...args),
}));

beforeEach(() => {
  mockNavigate.mockReset();
  mockEmit.mockReset();
});

// ---------------------------------------------------------------------------
// Fixtures (shape RF-29)
// ---------------------------------------------------------------------------
const sampleDeltas = [
  {
    stat: 'vpip',
    statLabel: 'VPIP',
    baseline: 22.4,
    current: 28.1,
    delta: 5.7,
    deltaAbs: 5.7,
    severity: 'low' as const,
    direction: 'negative' as const,
    period: '30d' as const,
  },
  {
    stat: 'pfr',
    statLabel: 'PFR',
    baseline: 18.0,
    current: 30.5,
    delta: 12.5,
    deltaAbs: 12.5,
    severity: 'medium' as const,
    direction: 'positive' as const,
    period: '30d' as const,
  },
  {
    stat: '3bet',
    statLabel: '3-Bet',
    baseline: 8.0,
    current: 32.0,
    delta: 24.0,
    deltaAbs: 24.0,
    severity: 'high' as const,
    direction: 'negative' as const,
    period: '30d' as const,
  },
];

describe('<StatsTopDeltas /> — render basico', () => {
  it('renderiza container com data-testid="home-stats-top-deltas"', async () => {
    const { default: StatsTopDeltas } = await import('../StatsTopDeltas');
    render(<StatsTopDeltas data={sampleDeltas} />);
    expect(screen.getByTestId('home-stats-top-deltas')).toBeInTheDocument();
  });

  it('renderiza ate 3 chips quando recebe 3 deltas', async () => {
    const { default: StatsTopDeltas } = await import('../StatsTopDeltas');
    render(<StatsTopDeltas data={sampleDeltas} />);
    const chips = screen.getAllByTestId(/^home-stats-top-deltas-chip-/);
    expect(chips.length).toBe(3);
  });

  it('cada chip mostra statLabel + delta value', async () => {
    const { default: StatsTopDeltas } = await import('../StatsTopDeltas');
    render(<StatsTopDeltas data={[sampleDeltas[2]]} />);
    const chip = screen.getByTestId('home-stats-top-deltas-chip-3bet');
    expect(chip.textContent).toMatch(/3-Bet/);
    // delta formatado (24.0 ou 24)
    expect(chip.textContent).toMatch(/24/);
  });

  it('respeita slice de no maximo 3 mesmo recebendo array maior', async () => {
    const { default: StatsTopDeltas } = await import('../StatsTopDeltas');
    const overflow = [
      ...sampleDeltas,
      {
        stat: 'cbet',
        statLabel: 'CBet',
        baseline: 50,
        current: 60,
        delta: 10,
        deltaAbs: 10,
        severity: 'medium' as const,
        direction: 'positive' as const,
        period: '30d' as const,
      },
    ];
    render(<StatsTopDeltas data={overflow as any} />);
    const chips = screen.getAllByTestId(/^home-stats-top-deltas-chip-/);
    expect(chips.length).toBeLessThanOrEqual(3);
  });
});

describe('<StatsTopDeltas /> — empty state', () => {
  it('com data=[] mostra texto + CTA para /estudos', async () => {
    const { default: StatsTopDeltas } = await import('../StatsTopDeltas');
    render(<StatsTopDeltas data={[]} />);
    // texto orientativo
    expect(screen.getByText(/importe HUD|sem insights|ainda sem/i)).toBeInTheDocument();
    // CTA com testid estavel
    const cta = screen.getByTestId('home-stats-top-deltas-empty-cta');
    expect(cta.getAttribute('href')).toMatch(/^\/estudos|^\/stats-analyzer/);
  });

  it('com data=null tambem mostra empty state (graceful degradation)', async () => {
    const { default: StatsTopDeltas } = await import('../StatsTopDeltas');
    render(<StatsTopDeltas data={null as any} />);
    expect(screen.getByTestId('home-stats-top-deltas-empty-cta')).toBeInTheDocument();
  });
});

describe('<StatsTopDeltas /> — tracker', () => {
  it('emit("home_stats_top_deltas_view", { count }) no mount com count >= 1', async () => {
    const { default: StatsTopDeltas } = await import('../StatsTopDeltas');
    render(<StatsTopDeltas data={sampleDeltas} />);
    const found = mockEmit.mock.calls.find((c) => c[0] === 'home_stats_top_deltas_view');
    expect(found).toBeDefined();
    expect(found?.[1]).toMatchObject({ count: 3 });
  });

  it('NAO emit view quando data=[]', async () => {
    const { default: StatsTopDeltas } = await import('../StatsTopDeltas');
    render(<StatsTopDeltas data={[]} />);
    const found = mockEmit.mock.calls.find((c) => c[0] === 'home_stats_top_deltas_view');
    expect(found).toBeUndefined();
  });

  it('emit click event ao clicar em chip com payload {stat, severity}', async () => {
    const { default: StatsTopDeltas } = await import('../StatsTopDeltas');
    render(<StatsTopDeltas data={[sampleDeltas[2]]} />);
    const chip = screen.getByTestId('home-stats-top-deltas-chip-3bet');
    fireEvent.click(chip);
    const found = mockEmit.mock.calls.find((c) => c[0] === 'home_stats_top_deltas_click');
    expect(found).toBeDefined();
    expect(found?.[1]).toMatchObject({ stat: '3bet', severity: 'high' });
  });
});
