/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-3 — RF-A4 (Sparklines em Banca + ROI 30d).
 *
 * Spec: Docs/specs/home-reform-3.md §RF-A4
 * ADR : Docs/architecture/decisions/110-news-feed-ranking-and-zoning.md
 *
 * StatusStrip atual NAO renderiza sparklines. Sera modificado pelo implementer
 * para incluir Recharts <LineChart> 60x20 ao lado dos KPIs Banca e ROI quando
 * sparkline.length > 1 (default spec >=3, mas sentinela > 1 cobre safe).
 *
 * Status RED: classes/elementos sparkline ainda nao existem.
 *
 * Lessons aplicadas:
 *   #14 await import(...) em vez de require — ESM compat
 *   #2  data-testid estavel
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock wouter Link to avoid Router context.
vi.mock('wouter', () => ({
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock('@/lib/tracker', () => ({
  emit: vi.fn(),
}));

// Mock Recharts — exportamos shells que renderizam div data-testid.
vi.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="recharts-line-chart">{children}</div>,
  Line: ({ stroke }: any) => <div data-testid="recharts-line" data-stroke={stroke} />,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  YAxis: () => null,
  XAxis: () => null,
  Tooltip: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// RF-A4 — Banca sparkline
// =============================================================================

describe('StatusStrip — sparkline Banca (RF-A4)', () => {
  it('renderiza sparkline Banca quando sparkline.length > 1', async () => {
    const { default: StatusStrip } = await import('@/components/home/StatusStrip');
    const data: any = {
      banca: { totalUsd: 5000, bisAvailable: 50, deltaPct7d: 2.5, sparkline: [100, 110, 120, 115] },
      roi30d: { value: 10.0, sparkline: [10, 11, 12] },
      today: null,
      pendencias: null,
    };
    render(<StatusStrip data={data} />);
    expect(screen.getByTestId('sparkline-banca')).toBeInTheDocument();
  });

  it('NAO renderiza sparkline Banca quando sparkline ausente / vazio', async () => {
    const { default: StatusStrip } = await import('@/components/home/StatusStrip');
    const data: any = {
      banca: { totalUsd: 5000, bisAvailable: 50, deltaPct7d: null, sparkline: [] },
      roi30d: null,
      today: null,
      pendencias: null,
    };
    render(<StatusStrip data={data} />);
    expect(screen.queryByTestId('sparkline-banca')).not.toBeInTheDocument();
  });

  it('cor stroke emerald quando deltaPct7d positivo', async () => {
    const { default: StatusStrip } = await import('@/components/home/StatusStrip');
    const data: any = {
      banca: { totalUsd: 5000, bisAvailable: 50, deltaPct7d: 5.0, sparkline: [100, 110, 120, 130] },
      roi30d: null,
      today: null,
      pendencias: null,
    };
    render(<StatusStrip data={data} />);
    const sparkline = screen.getByTestId('sparkline-banca');
    // stroke pode ser via class ou data-stroke; aceita qualquer ref a "emerald"
    const html = sparkline.outerHTML.toLowerCase();
    expect(html).toMatch(/emerald/);
  });

  it('cor stroke rose quando deltaPct7d negativo', async () => {
    const { default: StatusStrip } = await import('@/components/home/StatusStrip');
    const data: any = {
      banca: { totalUsd: 5000, bisAvailable: 50, deltaPct7d: -4.0, sparkline: [120, 110, 100, 95] },
      roi30d: null,
      today: null,
      pendencias: null,
    };
    render(<StatusStrip data={data} />);
    const sparkline = screen.getByTestId('sparkline-banca');
    const html = sparkline.outerHTML.toLowerCase();
    expect(html).toMatch(/rose/);
  });
});

// =============================================================================
// RF-A4 — ROI 30d sparkline
// =============================================================================

describe('StatusStrip — sparkline ROI 30d (RF-A4)', () => {
  it('renderiza sparkline ROI 30d quando sparkline.length > 1', async () => {
    const { default: StatusStrip } = await import('@/components/home/StatusStrip');
    const data: any = {
      banca: null,
      roi30d: { value: 10.0, sparkline: [5, 7, 10, 12] },
      today: null,
      pendencias: null,
    };
    render(<StatusStrip data={data} />);
    expect(screen.getByTestId('sparkline-roi30d')).toBeInTheDocument();
  });

  it('NAO renderiza sparkline ROI quando sparkline ausente', async () => {
    const { default: StatusStrip } = await import('@/components/home/StatusStrip');
    const data: any = {
      banca: null,
      roi30d: { value: 10.0, sparkline: [] },
      today: null,
      pendencias: null,
    };
    render(<StatusStrip data={data} />);
    expect(screen.queryByTestId('sparkline-roi30d')).not.toBeInTheDocument();
  });

  it('cor emerald quando ROI positivo', async () => {
    const { default: StatusStrip } = await import('@/components/home/StatusStrip');
    const data: any = {
      banca: null,
      roi30d: { value: 15.0, sparkline: [5, 8, 10, 15] },
      today: null,
      pendencias: null,
    };
    render(<StatusStrip data={data} />);
    const sparkline = screen.getByTestId('sparkline-roi30d');
    expect(sparkline.outerHTML.toLowerCase()).toMatch(/emerald/);
  });

  it('cor rose quando ROI negativo', async () => {
    const { default: StatusStrip } = await import('@/components/home/StatusStrip');
    const data: any = {
      banca: null,
      roi30d: { value: -8.0, sparkline: [10, 5, 0, -8] },
      today: null,
      pendencias: null,
    };
    render(<StatusStrip data={data} />);
    const sparkline = screen.getByTestId('sparkline-roi30d');
    expect(sparkline.outerHTML.toLowerCase()).toMatch(/rose/);
  });
});
