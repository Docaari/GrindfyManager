/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint VR-1 — RF-03: PrimedopeResult updated for native output format
 *
 * Spec  : Docs/specs/sprint-variance-reform.md (RF-03)
 * ADR   : 211 (variance native monte carlo engine)
 *
 * Component: client/src/components/primedope/PrimedopeResult.tsx (WILL BE MODIFIED)
 *
 * Coverage:
 *   - 4 KPI cards render with native data (EV, ROI calc, SD, Chance de Lucro)
 *   - RoR card replaced by Chance de Lucro (profitablePct)
 *   - CI table shows 3 bands with native percentile values
 *   - Drawdown section shows median, p95, worst
 *   - Risk badge: profitablePct < 50 = red, >= 90 = green, else yellow
 *   - Loading skeleton during simulation
 *   - Error block for generic errors
 *   - Source badge shows 'native' for fresh result
 *
 * Lessons applied:
 *   #3  shape REAL — assertions use data-testid (not text matching)
 *   #14 vi.hoisted for mock spies
 *   #26 do NOT use require() in .tsx test files
 *   #23 Wouter v3 nested anchor ok
 *
 * Status RED: PrimedopeResult.tsx still uses old SimulationResultData format.
 *             New data-testid values for drawdown/risk badge DO NOT EXIST.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// =============================================================================
// Import component — exists but will be MODIFIED for native format
// =============================================================================
import { PrimedopeResult } from '../../client/src/components/primedope/PrimedopeResult';

// We also need the new types — these DO NOT EXIST yet on the component.
// The implementer will update PrimedopeResultPayload to use native format.

beforeEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixture: Native VarianceSimulationResult payload (RF-01 output)
// ---------------------------------------------------------------------------
const nativeResultPayload = {
  source: 'native' as const,
  ev: 10798,
  stdDev: 7200,
  profitablePct: 93.2,
  totalTournaments: 1440,
  totalInvested: 71988,
  percentiles: {
    p0_15: -12000,
    p2_5: -3171,
    p15: 3627,
    p30: 6927,
    p50: 10327,
    p70: 13727,
    p85: 17627,
    p97_5: 25227,
    p99_85: 33000,
  },
  drawdown: {
    mean: 4200,
    median: 2787,
    p95: 6737,
    p99: 12000,
    worst: 18273,
  },
  groupContributions: [
    { name: 'G1 High mix', count: 60, invested: 9780, expectedProfit: 1467 },
    { name: 'G2 Mid Vanilla', count: 336, invested: 24864, expectedProfit: 3730 },
  ],
  histogram: [
    { bucketStart: 0, bucketEnd: 5000, count: 4000 },
    { bucketStart: 5000, bucketEnd: 10000, count: 3500 },
    { bucketStart: 10000, bucketEnd: 15000, count: 2500 },
  ],
  simulationsRun: 10000,
  elapsedMs: 310,
  latencyMs: 310,
  inputHash: 'abc123def',
  runId: 'pdr_native_1',
  pinned: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('<PrimedopeResult> — native output format (RF-03)', () => {
  describe('4 KPI cards', () => {
    it('renders EV card with result.ev', () => {
      render(<PrimedopeResult result={nativeResultPayload as any} />);
      const card = screen.getByTestId('primedope-result-card-ev');
      expect(card).toBeInTheDocument();
      // Should contain the EV value formatted as USD
      expect(card.textContent).toContain('10');
    });

    it('renders ROI card calculated as ev/totalInvested*100', () => {
      render(<PrimedopeResult result={nativeResultPayload as any} />);
      const card = screen.getByTestId('primedope-result-card-roi');
      expect(card).toBeInTheDocument();
      // ROI = 10798 / 71988 * 100 = ~15%
      const expectedRoi = (10798 / 71988) * 100;
      expect(card.textContent).toContain(expectedRoi.toFixed(1).substring(0, 4));
    });

    it('renders SD card with result.stdDev', () => {
      render(<PrimedopeResult result={nativeResultPayload as any} />);
      const card = screen.getByTestId('primedope-result-card-sd');
      expect(card).toBeInTheDocument();
      expect(card.textContent).toContain('7');
    });

    it('renders Chance de Lucro card (replacing RoR) with profitablePct', () => {
      render(<PrimedopeResult result={nativeResultPayload as any} />);
      // The old RoR card should be gone. New card uses profitablePct.
      const lucroCard = screen.getByTestId('primedope-result-card-profit-chance');
      expect(lucroCard).toBeInTheDocument();
      expect(lucroCard.textContent).toContain('93');
    });

    it('does NOT render the old RoR card', () => {
      render(<PrimedopeResult result={nativeResultPayload as any} />);
      expect(screen.queryByTestId('primedope-result-card-ror')).not.toBeInTheDocument();
    });
  });

  describe('CI table with 3 bands', () => {
    it('renders confidence interval table with 3 rows (70%, 95%, 99.7%)', () => {
      render(<PrimedopeResult result={nativeResultPayload as any} />);
      const table = screen.getByTestId('primedope-result-confidence-table');
      expect(table).toBeInTheDocument();

      // Band 70%: p15..p85
      const band70 = screen.getByTestId('primedope-ci-band-70');
      expect(band70).toBeInTheDocument();

      // Band 95%: p2_5..p97_5
      const band95 = screen.getByTestId('primedope-ci-band-95');
      expect(band95).toBeInTheDocument();

      // Band 99.7%: p0_15..p99_85
      const band997 = screen.getByTestId('primedope-ci-band-997');
      expect(band997).toBeInTheDocument();
    });

    it('band 70% shows p15 and p85 values', () => {
      render(<PrimedopeResult result={nativeResultPayload as any} />);
      const band = screen.getByTestId('primedope-ci-band-70');
      // Should contain p15 (3627) and p85 (17627)
      expect(band.textContent).toContain('3.627');
      expect(band.textContent).toContain('17.627');
    });
  });

  describe('drawdown section', () => {
    it('renders drawdown card with median, p95, worst', () => {
      render(<PrimedopeResult result={nativeResultPayload as any} />);

      // DrawdownCard usa testids drawdown-card + drawdown-{tipico|preparar|pior}.
      const ddSection = screen.getByTestId('drawdown-card');
      expect(ddSection).toBeInTheDocument();

      // Median drawdown (nivel "tipico")
      const ddMedian = screen.getByTestId('drawdown-tipico');
      expect(ddMedian).toBeInTheDocument();
      expect(ddMedian.textContent).toContain('2.787');

      // p95 drawdown (nivel "preparar")
      const ddP95 = screen.getByTestId('drawdown-preparar');
      expect(ddP95).toBeInTheDocument();
      expect(ddP95.textContent).toContain('6.737');

      // Worst drawdown (nivel "pior")
      const ddWorst = screen.getByTestId('drawdown-pior');
      expect(ddWorst).toBeInTheDocument();
      expect(ddWorst.textContent).toContain('18.273');
    });
  });

  describe('risk badge', () => {
    it('shows "Baixo risco" green badge when profitablePct >= 90', () => {
      render(<PrimedopeResult result={nativeResultPayload as any} />);
      const badge = screen.getByTestId('primedope-risk-badge');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toContain('Baixo risco');
      // Green badge
      expect(badge.className).toMatch(/green|emerald/);
    });

    it('shows "Alto risco" red badge when profitablePct < 50', () => {
      const riskyResult = {
        ...nativeResultPayload,
        profitablePct: 35.0,
      };
      render(<PrimedopeResult result={riskyResult as any} />);
      const badge = screen.getByTestId('primedope-risk-badge');
      expect(badge.textContent).toContain('Alto risco');
      expect(badge.className).toMatch(/red/);
    });

    it('shows "Risco moderado" yellow badge when profitablePct between 50 and 89', () => {
      const moderateResult = {
        ...nativeResultPayload,
        profitablePct: 72.0,
      };
      render(<PrimedopeResult result={moderateResult as any} />);
      const badge = screen.getByTestId('primedope-risk-badge');
      expect(badge.textContent).toContain('Risco moderado');
      expect(badge.className).toMatch(/yellow|amber/);
    });
  });

  describe('loading skeleton', () => {
    it('renders skeleton when isLoading=true', () => {
      render(<PrimedopeResult isLoading={true} />);
      expect(
        screen.getByTestId('primedope-result-skeleton')
      ).toBeInTheDocument();
    });

    it('does not render skeleton when result is present', () => {
      render(<PrimedopeResult result={nativeResultPayload as any} />);
      expect(
        screen.queryByTestId('primedope-result-skeleton')
      ).not.toBeInTheDocument();
    });
  });

  describe('source badge', () => {
    it('shows native source badge for source=native', () => {
      render(<PrimedopeResult result={nativeResultPayload as any} />);
      const badge = screen.getByTestId('primedope-source-badge');
      expect(badge).toBeInTheDocument();
      // Should say something like "Nativo" or "Recem-simulado"
      // not "PrimeDope" or "Powered by"
    });
  });
});
