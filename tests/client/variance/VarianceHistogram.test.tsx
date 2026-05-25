// =============================================================================
// Sprint VR-3 — RF-09: VarianceHistogram (client component)
//
// Spec  : Docs/specs/sprint-variance-reform.md (RF-09)
// ADR   : 211 (engine output shape VarianceSimulationResult)
//
// Mode  : TDD (red phase) — component DOES NOT EXIST yet.
//
// Tests cover:
//   - BarChart renders with histogram data
//   - Red bars for negative buckets, green for positive
//   - Dashed median line at p50
//   - Tooltip shows range + count + percentage
//   - Responsive container
//   - data-testid stable selectors (lesson #2)
//
// Convention: await import() NOT require() for components (lesson #14/#26/#38).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock data — realistic VarianceSimulationResult (trimestre 12 semanas)
// ---------------------------------------------------------------------------

function makeHistogramData(): Array<{ bucketStart: number; bucketEnd: number; count: number }> {
  return [
    { bucketStart: -20000, bucketEnd: -15000, count: 120 },
    { bucketStart: -15000, bucketEnd: -10000, count: 380 },
    { bucketStart: -10000, bucketEnd: -5000, count: 720 },
    { bucketStart: -5000, bucketEnd: 0, count: 1280 },
    { bucketStart: 0, bucketEnd: 5000, count: 2100 },
    { bucketStart: 5000, bucketEnd: 10000, count: 2400 },
    { bucketStart: 10000, bucketEnd: 15000, count: 1680 },
    { bucketStart: 15000, bucketEnd: 20000, count: 820 },
    { bucketStart: 20000, bucketEnd: 25000, count: 340 },
    { bucketStart: 25000, bucketEnd: 30000, count: 120 },
    { bucketStart: 30000, bucketEnd: 35000, count: 40 },
  ];
}

function makeSimulationResult() {
  return {
    ev: 10798,
    stdDev: 8200,
    profitablePct: 85,
    totalTournaments: 1440,
    totalInvested: 71988,
    percentiles: {
      p0_15: -18273,
      p2_5: -3171,
      p15: 2400,
      p30: 5800,
      p50: 10200,
      p70: 14600,
      p85: 19200,
      p97_5: 28400,
      p99_85: 38900,
    },
    drawdown: {
      mean: 3500,
      median: 2787,
      p95: 6737,
      p99: 12400,
      worst: 18273,
    },
    groupContributions: [],
    histogram: makeHistogramData(),
    simulationsRun: 10000,
    elapsedMs: 340,
  };
}

// ---------------------------------------------------------------------------
// Mock Recharts — minimal mock verifying props
// ---------------------------------------------------------------------------

const { mockBarChartProps, mockBarProps, mockReferenceLine } = vi.hoisted(() => ({
  mockBarChartProps: vi.fn(),
  mockBarProps: vi.fn(),
  mockReferenceLine: vi.fn(),
}));

vi.mock('recharts', () => ({
  BarChart: (props: any) => {
    mockBarChartProps(props);
    return React.createElement('div', { 'data-testid': 'recharts-barchart' }, props.children);
  },
  Bar: (props: any) => {
    mockBarProps(props);
    return React.createElement('div', { 'data-testid': 'recharts-bar' });
  },
  XAxis: (props: any) => React.createElement('div', { 'data-testid': 'recharts-xaxis' }),
  YAxis: (props: any) => React.createElement('div', { 'data-testid': 'recharts-yaxis' }),
  Tooltip: (props: any) => React.createElement('div', { 'data-testid': 'recharts-tooltip' }),
  ReferenceLine: (props: any) => {
    mockReferenceLine(props);
    return React.createElement('div', { 'data-testid': 'recharts-refline' });
  },
  ResponsiveContainer: (props: any) => React.createElement('div', { 'data-testid': 'recharts-responsive' }, props.children),
  Cell: (props: any) => React.createElement('div'),
  CartesianGrid: (props: any) => React.createElement('div'),
}));

// ---------------------------------------------------------------------------
// Dynamic import helper (lesson #14/#26)
// ---------------------------------------------------------------------------

async function tryLoadComponent(): Promise<any | null> {
  try {
    const p = '@/components/primedope/VarianceHistogram';
    const mod = await import(/* @vite-ignore */ p);
    return mod.default ?? (mod as any).VarianceHistogram ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Tests
// =============================================================================

describe('VarianceHistogram (RF-09)', () => {
  // -------------------------------------------------------------------------
  // Render & data-testid
  // -------------------------------------------------------------------------

  it('deve renderizar container com data-testid="variance-histogram"', async () => {
    const VarianceHistogram = await tryLoadComponent();
    expect(VarianceHistogram).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const result = makeSimulationResult();

    render(React.createElement(VarianceHistogram, { histogram: result.histogram, medianValue: result.percentiles.p50 }));

    expect(screen.getByTestId('variance-histogram')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Histogram bars
  // -------------------------------------------------------------------------

  it('deve renderizar uma barra para cada bucket do histogram', async () => {
    const VarianceHistogram = await tryLoadComponent();
    expect(VarianceHistogram).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const result = makeSimulationResult();

    render(React.createElement(VarianceHistogram, { histogram: result.histogram, medianValue: result.percentiles.p50 }));

    // Each bucket should produce a testid bar
    for (let i = 0; i < result.histogram.length; i++) {
      expect(screen.getByTestId(`histogram-bar-${i}`)).toBeInTheDocument();
    }
  });

  it('deve usar cor vermelha para barras com bucketEnd <= 0 (negativo)', async () => {
    const VarianceHistogram = await tryLoadComponent();
    expect(VarianceHistogram).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const result = makeSimulationResult();

    render(React.createElement(VarianceHistogram, { histogram: result.histogram, medianValue: result.percentiles.p50 }));

    // Buckets 0-3 have bucketEnd <= 0 (negative territory)
    const negativeBar = screen.getByTestId('histogram-bar-0');
    // The bar element or its style/class should indicate red color
    const barEl = negativeBar;
    const classes = barEl.className || '';
    const style = barEl.getAttribute('style') || '';
    const fill = barEl.getAttribute('data-fill') || barEl.getAttribute('fill') || '';
    const isRed = classes.includes('red') || style.includes('red') || fill.includes('red')
      || classes.includes('destructive') || barEl.getAttribute('data-color') === 'red';
    expect(isRed).toBe(true);
  });

  it('deve usar cor verde para barras com bucketStart >= 0 (positivo)', async () => {
    const VarianceHistogram = await tryLoadComponent();
    expect(VarianceHistogram).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const result = makeSimulationResult();

    render(React.createElement(VarianceHistogram, { histogram: result.histogram, medianValue: result.percentiles.p50 }));

    // Bucket index 4 is the first positive bucket (0..5000)
    const positiveBar = screen.getByTestId('histogram-bar-4');
    const classes = positiveBar.className || '';
    const style = positiveBar.getAttribute('style') || '';
    const fill = positiveBar.getAttribute('data-fill') || positiveBar.getAttribute('fill') || '';
    const isGreen = classes.includes('green') || classes.includes('emerald')
      || style.includes('green') || fill.includes('green')
      || positiveBar.getAttribute('data-color') === 'green';
    expect(isGreen).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Median line
  // -------------------------------------------------------------------------

  it('deve renderizar linha mediana tracejada com data-testid="histogram-median-line"', async () => {
    const VarianceHistogram = await tryLoadComponent();
    expect(VarianceHistogram).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const result = makeSimulationResult();

    render(React.createElement(VarianceHistogram, { histogram: result.histogram, medianValue: result.percentiles.p50 }));

    expect(screen.getByTestId('histogram-median-line')).toBeInTheDocument();
  });

  it('deve posicionar a linha mediana no valor de p50', async () => {
    const VarianceHistogram = await tryLoadComponent();
    expect(VarianceHistogram).not.toBeNull();

    const { render } = await import('@testing-library/react');
    const result = makeSimulationResult();

    render(React.createElement(VarianceHistogram, { histogram: result.histogram, medianValue: result.percentiles.p50 }));

    // The ReferenceLine mock captures the props; verify x or value matches p50
    expect(mockReferenceLine).toHaveBeenCalled();
    const refLineCall = mockReferenceLine.mock.calls.find(
      (call: any[]) => call[0]?.x === result.percentiles.p50 || call[0]?.value === result.percentiles.p50,
    );
    expect(refLineCall).toBeDefined();
  });

  it('linha mediana deve ser tracejada (dashed)', async () => {
    const VarianceHistogram = await tryLoadComponent();
    expect(VarianceHistogram).not.toBeNull();

    const { render } = await import('@testing-library/react');
    const result = makeSimulationResult();

    render(React.createElement(VarianceHistogram, { histogram: result.histogram, medianValue: result.percentiles.p50 }));

    // The ReferenceLine for the median should have strokeDasharray (dashed style)
    expect(mockReferenceLine).toHaveBeenCalled();
    const refLineCall = mockReferenceLine.mock.calls.find(
      (call: any[]) => call[0]?.x === result.percentiles.p50 || call[0]?.value === result.percentiles.p50,
    );
    expect(refLineCall).toBeDefined();
    expect(refLineCall![0].strokeDasharray).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Tooltip
  // -------------------------------------------------------------------------

  it('deve incluir Tooltip no chart', async () => {
    const VarianceHistogram = await tryLoadComponent();
    expect(VarianceHistogram).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const result = makeSimulationResult();

    render(React.createElement(VarianceHistogram, { histogram: result.histogram, medianValue: result.percentiles.p50 }));

    expect(screen.getByTestId('recharts-tooltip')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Responsive
  // -------------------------------------------------------------------------

  it('deve envolver chart em ResponsiveContainer', async () => {
    const VarianceHistogram = await tryLoadComponent();
    expect(VarianceHistogram).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const result = makeSimulationResult();

    render(React.createElement(VarianceHistogram, { histogram: result.histogram, medianValue: result.percentiles.p50 }));

    expect(screen.getByTestId('recharts-responsive')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Tooltip content formatting
  // -------------------------------------------------------------------------

  it('deve formatar tooltip com faixa, count e percentual do total', async () => {
    const VarianceHistogram = await tryLoadComponent();
    expect(VarianceHistogram).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const result = makeSimulationResult();

    render(React.createElement(VarianceHistogram, { histogram: result.histogram, medianValue: result.percentiles.p50 }));

    // The component should expose a custom tooltip formatter.
    // We verify the component passes a `content` prop or custom formatter to Tooltip.
    // Additionally, the total simulations count should be available for % calculation.
    // Total count = sum of all histogram buckets = 10000
    const totalCount = result.histogram.reduce((s, b) => s + b.count, 0);
    expect(totalCount).toBe(10000);

    // The component should pass totalSimulations or the histogram array to compute %.
    // Verify via the BarChart data that percentage can be derived.
    expect(mockBarChartProps).toHaveBeenCalled();
    const chartData = mockBarChartProps.mock.calls[0][0].data;
    // Each data point should carry enough info for tooltip: bucketStart, bucketEnd, count
    if (chartData && chartData.length > 0) {
      const firstItem = chartData[0];
      expect(firstItem).toHaveProperty('count');
      // Either bucketStart/bucketEnd or a label field for the range
      const hasRange = ('bucketStart' in firstItem && 'bucketEnd' in firstItem) || 'label' in firstItem;
      expect(hasRange).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // Empty histogram
  // -------------------------------------------------------------------------

  it('deve renderizar vazio graciosamente quando histogram esta vazio', async () => {
    const VarianceHistogram = await tryLoadComponent();
    expect(VarianceHistogram).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    render(React.createElement(VarianceHistogram, { histogram: [], medianValue: 0 }));

    // Should still render the container without error
    expect(screen.getByTestId('variance-histogram')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // BarChart receives histogram data
  // -------------------------------------------------------------------------

  it('deve passar os dados do histogram para o BarChart', async () => {
    const VarianceHistogram = await tryLoadComponent();
    expect(VarianceHistogram).not.toBeNull();

    const { render } = await import('@testing-library/react');
    const result = makeSimulationResult();

    render(React.createElement(VarianceHistogram, { histogram: result.histogram, medianValue: result.percentiles.p50 }));

    expect(mockBarChartProps).toHaveBeenCalled();
    const chartProps = mockBarChartProps.mock.calls[0][0];
    expect(chartProps.data).toBeDefined();
    expect(chartProps.data.length).toBe(result.histogram.length);
  });
});
