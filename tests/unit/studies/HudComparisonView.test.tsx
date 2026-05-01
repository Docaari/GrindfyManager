// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Stats-V3 — HudComparisonView (RF-13, RF-14, RF-15)
//
// Spec : docs/specs/sprint-stats-v3.md (RF-13 selector duplo, RF-14 layout
//        4-col cor-coding, RF-15 trend indicator + tooltip)
// ADR  : 066 (3-way comparison semantics)
//
// Componente NAO existe ainda — Implementer criara em
// `client/src/components/studies/stats/HudComparisonView.tsx`.
//
// Comportamentos:
//   - Selector duplo "Snapshot 1" + "Snapshot 2" no header
//   - Default snap1=mais antigo, snap2=mais recente (chronological)
//   - Auto-reorder se user inverte
//   - Layout 4-col por cell (target | snap1 | snap2 | delta)
//   - Cores: verde/laranja/vermelho/cinza per status
//   - Trend ↑↓→ tooltip com magnitude + dias
//   - Threshold por unit (pct 1%/5%, bb 0.1/0.5)
//   - Direction lower_better inverte cor
//   - Empty state quando snap1 OR snap2 ausente
//   - data-testid: compare-snap-{1|2}-cell-{statId}, compare-trend-{statId}
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

// Componente NAO existe ainda — red phase
import HudComparisonView from '@/components/studies/stats/HudComparisonView';

function withQuery(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

// Compare response do server (RF-16 shape)
const baseCompareResponse = {
  layoutId: 'lyt-1',
  snap1: {
    id: 'snap-old',
    capturedAt: new Date('2026-04-17T10:00:00Z').toISOString(),
    captureMethod: 'manual',
    sampleSize: 5400,
  },
  snap2: {
    id: 'snap-new',
    capturedAt: new Date('2026-05-01T10:00:00Z').toISOString(),
    captureMethod: 'ocr',
    sampleSize: 7200,
  },
  groups: [
    {
      id: 'basics',
      name: 'Basicos',
      stats: [
        {
          id: 'vpip',
          label: 'VPIP',
          target: { min: 20, max: 25 },
          snap1Value: 22,
          snap2Value: 24,
          delta: 2,
          direction: 'context',
          unit: 'pct',
          status: 'context_ambiguous',
          trend: 'stable',
          trendIcon: '→',
        },
        {
          id: 'wwsf_pct',
          label: 'WWSF',
          target: { min: 45, max: 55 },
          snap1Value: 40,
          snap2Value: 48,
          delta: 8,
          direction: 'higher_better',
          unit: 'pct',
          status: 'improving',
          trend: 'big_positive',
          trendIcon: '↑↑',
        },
        {
          id: 'fold_to_3bet',
          label: 'Fold to 3Bet',
          target: { min: 50, max: 60 },
          snap1Value: 55,
          snap2Value: 70,
          delta: 15,
          direction: 'lower_better',
          unit: 'pct',
          status: 'regressing',
          trend: 'big_negative',
          trendIcon: '↓↓',
        },
      ],
    },
  ],
  summary: {
    snap1OffTarget: 1,
    snap2OffTarget: 1,
    improvingCount: 1,
    regressingCount: 1,
    stableCount: 1,
  },
};

const baseSnapshots = [
  { id: 'snap-old', capturedAt: '2026-04-17T10:00:00Z', source: 'manual' },
  { id: 'snap-new', capturedAt: '2026-05-01T10:00:00Z', source: 'ocr' },
];

const baseProps = {
  layoutId: 'lyt-1',
  snapshots: baseSnapshots,
  selectedSnap1Id: 'snap-old',
  selectedSnap2Id: 'snap-new',
  onSelectSnap1: vi.fn(),
  onSelectSnap2: vi.fn(),
  compareResponse: baseCompareResponse,
};

// =============================================================================
// Selector duplo
// =============================================================================

describe('<HudComparisonView /> — selector duplo', () => {
  it('renderiza select snap1 e snap2', () => {
    render(withQuery(<HudComparisonView {...baseProps} />));
    expect(screen.getByTestId('compare-snap1-select')).toBeInTheDocument();
    expect(screen.getByTestId('compare-snap2-select')).toBeInTheDocument();
  });

  it('default snap1 = mais antigo, snap2 = mais recente', () => {
    render(withQuery(<HudComparisonView {...baseProps} />));
    const snap1 = screen.getByTestId('compare-snap1-select') as HTMLSelectElement;
    const snap2 = screen.getByTestId('compare-snap2-select') as HTMLSelectElement;
    // snap-old (2026-04-17) eh mais antigo
    expect(snap1.value).toBe('snap-old');
    expect(snap2.value).toBe('snap-new');
  });
});

// =============================================================================
// Layout 4-col com cores
// =============================================================================

describe('<HudComparisonView /> — cor por status', () => {
  it('verde para both_in_target', () => {
    // mod baseCompareResponse: vpip context-ambiguous default; criar variante in-target
    const inTargetResp = {
      ...baseCompareResponse,
      groups: [{
        ...baseCompareResponse.groups[0],
        stats: [{
          ...baseCompareResponse.groups[0].stats[0],
          snap1Value: 22,
          snap2Value: 24,
          status: 'both_in_target',
        }],
      }],
    };
    render(withQuery(<HudComparisonView {...baseProps} compareResponse={inTargetResp} />));
    const cell = screen.getByTestId('compare-cell-vpip');
    expect(cell.className).toMatch(/emerald|green/);
  });

  it('laranja para improving (higher_better snap1 fora -> snap2 dentro)', () => {
    render(withQuery(<HudComparisonView {...baseProps} />));
    const cell = screen.getByTestId('compare-cell-wwsf_pct');
    expect(cell.className).toMatch(/orange/);
  });

  it('vermelho para regressing (lower_better snap1 dentro -> snap2 fora)', () => {
    render(withQuery(<HudComparisonView {...baseProps} />));
    const cell = screen.getByTestId('compare-cell-fold_to_3bet');
    expect(cell.className).toMatch(/red/);
  });

  it('cinza para context (status context_ambiguous)', () => {
    render(withQuery(<HudComparisonView {...baseProps} />));
    const cell = screen.getByTestId('compare-cell-vpip');
    expect(cell.className).toMatch(/slate|gray/);
  });
});

// =============================================================================
// Trend indicator + tooltip
// =============================================================================

describe('<HudComparisonView /> — trend indicator', () => {
  it('renderiza icone trend baseado em trendIcon do server', () => {
    render(withQuery(<HudComparisonView {...baseProps} />));
    const trendVpip = screen.getByTestId('compare-trend-vpip');
    expect(trendVpip.textContent).toContain('→');
    const trendWwsf = screen.getByTestId('compare-trend-wwsf_pct');
    expect(trendWwsf.textContent).toContain('↑↑');
    const trendFold = screen.getByTestId('compare-trend-fold_to_3bet');
    expect(trendFold.textContent).toContain('↓↓');
  });
});

// =============================================================================
// Null handling
// =============================================================================

describe('<HudComparisonView /> — value null', () => {
  it('snap1Value null -> "—" cinza', () => {
    const nullResp = {
      ...baseCompareResponse,
      groups: [{
        ...baseCompareResponse.groups[0],
        stats: [{
          ...baseCompareResponse.groups[0].stats[0],
          snap1Value: null,
          snap2Value: 24,
          delta: null,
          status: 'snap1_null',
          trend: 'n_a',
          trendIcon: null,
        }],
      }],
    };
    render(withQuery(<HudComparisonView {...baseProps} compareResponse={nullResp} />));
    const cell = screen.getByTestId('compare-cell-vpip');
    expect(cell.textContent).toContain('—');
  });
});

// =============================================================================
// Empty state
// =============================================================================

describe('<HudComparisonView /> — empty state', () => {
  it('zero snapshots -> CTA "Criar primeiro snapshot"', () => {
    render(withQuery(<HudComparisonView {...baseProps} snapshots={[]} compareResponse={null} />));
    expect(screen.getByTestId('compare-empty-state')).toBeInTheDocument();
  });
});
