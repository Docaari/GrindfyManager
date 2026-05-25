// =============================================================================
// Sprint VR-3 — RF-14: EquityCurves (client component)
//
// Spec  : Docs/specs/sprint-variance-reform.md (RF-14)
// ADR   : 211 (engine output shape VarianceSimulationResult)
//
// Mode  : TDD (red phase) — component DOES NOT EXIST yet.
//
// Tests cover:
//   - LineChart renders 20 semi-transparent equity paths
//   - Shaded band 70% (p15..p85)
//   - Shaded band 95% (p2_5..p97_5)
//   - Dashed horizontal zero line
//   - X axis: weeks, Y axis: cumulative profit USD
//   - Responsive container
//   - data-testid stable selectors (lesson #2)
//
// Convention: await import() NOT require() for components (lesson #14/#26/#38).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock data — 12 weeks, 20 paths
// ---------------------------------------------------------------------------

function makeEquityCurves() {
  // Generate 20 paths of 12 values each (cumulative profit per week)
  const paths: number[][] = [];
  for (let i = 0; i < 20; i++) {
    const path: number[] = [];
    let cumulative = 0;
    for (let w = 0; w < 12; w++) {
      // Deterministic pseudo-data: spread around EV path
      cumulative += (900 - i * 80 + w * 30);
      path.push(cumulative);
    }
    paths.push(path);
  }

  // Bands: arrays of 12 values each
  const bands = {
    p2_5: Array.from({ length: 12 }, (_, w) => -3000 + w * 200),
    p15: Array.from({ length: 12 }, (_, w) => -500 + w * 400),
    p85: Array.from({ length: 12 }, (_, w) => 1500 + w * 800),
    p97_5: Array.from({ length: 12 }, (_, w) => 3000 + w * 1200),
  };

  return { paths, bands };
}

// ---------------------------------------------------------------------------
// Mock Recharts — minimal mock verifying rendered elements
// ---------------------------------------------------------------------------

const { mockLineChartProps, mockLineProps, mockAreaProps, mockReferenceLineProps } = vi.hoisted(() => ({
  mockLineChartProps: vi.fn(),
  mockLineProps: vi.fn(),
  mockAreaProps: vi.fn(),
  mockReferenceLineProps: vi.fn(),
}));

vi.mock('recharts', () => ({
  LineChart: (props: any) => {
    mockLineChartProps(props);
    return React.createElement('div', { 'data-testid': 'recharts-linechart' }, props.children);
  },
  Line: (props: any) => {
    mockLineProps(props);
    return React.createElement('div', { 'data-testid': `recharts-line-${props.dataKey || 'unknown'}` });
  },
  Area: (props: any) => {
    mockAreaProps(props);
    return React.createElement('div', { 'data-testid': `recharts-area-${props.dataKey || 'unknown'}` });
  },
  XAxis: (props: any) => React.createElement('div', { 'data-testid': 'recharts-xaxis' }),
  YAxis: (props: any) => React.createElement('div', { 'data-testid': 'recharts-yaxis' }),
  Tooltip: (props: any) => React.createElement('div', { 'data-testid': 'recharts-tooltip' }),
  ReferenceLine: (props: any) => {
    mockReferenceLineProps(props);
    return React.createElement('div', { 'data-testid': 'recharts-refline' });
  },
  ResponsiveContainer: (props: any) => React.createElement('div', { 'data-testid': 'recharts-responsive' }, props.children),
  CartesianGrid: (props: any) => React.createElement('div'),
  ComposedChart: (props: any) => {
    mockLineChartProps(props);
    return React.createElement('div', { 'data-testid': 'recharts-composedchart' }, props.children);
  },
}));

// ---------------------------------------------------------------------------
// Dynamic import helper (lesson #14/#26)
// ---------------------------------------------------------------------------

async function tryLoadComponent(): Promise<any | null> {
  try {
    const p = '@/components/primedope/EquityCurves';
    const mod = await import(/* @vite-ignore */ p);
    return mod.default ?? (mod as any).EquityCurves ?? null;
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

describe('EquityCurves (RF-14)', () => {
  // -------------------------------------------------------------------------
  // Render & data-testid
  // -------------------------------------------------------------------------

  it('deve renderizar container com data-testid="equity-curves-chart"', async () => {
    const EquityCurves = await tryLoadComponent();
    expect(EquityCurves).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const curves = makeEquityCurves();

    render(React.createElement(EquityCurves, { equityCurves: curves, weeks: 12 }));

    expect(screen.getByTestId('equity-curves-chart')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 20 paths
  // -------------------------------------------------------------------------

  it('deve renderizar 20 paths individuais', async () => {
    const EquityCurves = await tryLoadComponent();
    expect(EquityCurves).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const curves = makeEquityCurves();

    render(React.createElement(EquityCurves, { equityCurves: curves, weeks: 12 }));

    // Each of the 20 paths should have a testid
    for (let i = 0; i < 20; i++) {
      expect(screen.getByTestId(`equity-path-${i}`)).toBeInTheDocument();
    }
  });

  it('paths devem ser semi-transparentes (opacity ~0.15)', async () => {
    const EquityCurves = await tryLoadComponent();
    expect(EquityCurves).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const curves = makeEquityCurves();

    render(React.createElement(EquityCurves, { equityCurves: curves, weeks: 12 }));

    // Check that Line components receive low opacity or strokeOpacity
    // Via the mock, we can inspect mockLineProps calls
    expect(mockLineProps).toHaveBeenCalled();
    const lineCalls = mockLineProps.mock.calls;
    // Paths should have low opacity (~0.15 per spec); accept range 0.1..0.3
    const pathLines = lineCalls.filter(
      (call: any[]) => {
        const o = call[0]?.strokeOpacity ?? call[0]?.opacity;
        return typeof o === 'number' && o >= 0.1 && o <= 0.3;
      },
    );
    expect(pathLines.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Bands
  // -------------------------------------------------------------------------

  it('deve renderizar banda 70% (p15..p85) com data-testid="equity-band-70"', async () => {
    const EquityCurves = await tryLoadComponent();
    expect(EquityCurves).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const curves = makeEquityCurves();

    render(React.createElement(EquityCurves, { equityCurves: curves, weeks: 12 }));

    expect(screen.getByTestId('equity-band-70')).toBeInTheDocument();
  });

  it('deve renderizar banda 95% (p2_5..p97_5) com data-testid="equity-band-95"', async () => {
    const EquityCurves = await tryLoadComponent();
    expect(EquityCurves).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const curves = makeEquityCurves();

    render(React.createElement(EquityCurves, { equityCurves: curves, weeks: 12 }));

    expect(screen.getByTestId('equity-band-95')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Zero line
  // -------------------------------------------------------------------------

  it('deve renderizar linha zero horizontal com data-testid="equity-zero-line"', async () => {
    const EquityCurves = await tryLoadComponent();
    expect(EquityCurves).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const curves = makeEquityCurves();

    render(React.createElement(EquityCurves, { equityCurves: curves, weeks: 12 }));

    expect(screen.getByTestId('equity-zero-line')).toBeInTheDocument();
  });

  it('linha zero deve ter y=0', async () => {
    const EquityCurves = await tryLoadComponent();
    expect(EquityCurves).not.toBeNull();

    const { render } = await import('@testing-library/react');
    const curves = makeEquityCurves();

    render(React.createElement(EquityCurves, { equityCurves: curves, weeks: 12 }));

    // ReferenceLine mock should capture y=0 call
    expect(mockReferenceLineProps).toHaveBeenCalled();
    const zeroLine = mockReferenceLineProps.mock.calls.find(
      (call: any[]) => call[0]?.y === 0,
    );
    expect(zeroLine).toBeDefined();
  });

  it('linha zero deve ser tracejada (dashed)', async () => {
    const EquityCurves = await tryLoadComponent();
    expect(EquityCurves).not.toBeNull();

    const { render } = await import('@testing-library/react');
    const curves = makeEquityCurves();

    render(React.createElement(EquityCurves, { equityCurves: curves, weeks: 12 }));

    // ReferenceLine at y=0 should have strokeDasharray (dashed style)
    expect(mockReferenceLineProps).toHaveBeenCalled();
    const zeroLine = mockReferenceLineProps.mock.calls.find(
      (call: any[]) => call[0]?.y === 0,
    );
    expect(zeroLine).toBeDefined();
    expect(zeroLine![0].strokeDasharray).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Responsive
  // -------------------------------------------------------------------------

  it('deve envolver chart em ResponsiveContainer', async () => {
    const EquityCurves = await tryLoadComponent();
    expect(EquityCurves).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const curves = makeEquityCurves();

    render(React.createElement(EquityCurves, { equityCurves: curves, weeks: 12 }));

    expect(screen.getByTestId('recharts-responsive')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Axes
  // -------------------------------------------------------------------------

  it('deve renderizar XAxis (semanas) e YAxis (USD)', async () => {
    const EquityCurves = await tryLoadComponent();
    expect(EquityCurves).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');
    const curves = makeEquityCurves();

    render(React.createElement(EquityCurves, { equityCurves: curves, weeks: 12 }));

    expect(screen.getByTestId('recharts-xaxis')).toBeInTheDocument();
    expect(screen.getByTestId('recharts-yaxis')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Chart receives correct data length
  // -------------------------------------------------------------------------

  it('deve passar dados com length igual a weeks para o chart', async () => {
    const EquityCurves = await tryLoadComponent();
    expect(EquityCurves).not.toBeNull();

    const { render } = await import('@testing-library/react');
    const curves = makeEquityCurves();

    render(React.createElement(EquityCurves, { equityCurves: curves, weeks: 12 }));

    expect(mockLineChartProps).toHaveBeenCalled();
    const chartProps = mockLineChartProps.mock.calls[0][0];
    expect(chartProps.data).toBeDefined();
    expect(chartProps.data.length).toBe(12);
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  it('deve lidar graciosamente com paths vazio', async () => {
    const EquityCurves = await tryLoadComponent();
    expect(EquityCurves).not.toBeNull();

    const { render, screen } = await import('@testing-library/react');

    const emptyCurves = {
      paths: [],
      bands: { p2_5: [], p15: [], p85: [], p97_5: [] },
    };

    render(React.createElement(EquityCurves, { equityCurves: emptyCurves, weeks: 0 }));

    expect(screen.getByTestId('equity-curves-chart')).toBeInTheDocument();
  });
});
