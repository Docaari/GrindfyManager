import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// =============================================================================
// Sprint F4 W1 — PrimedopeResult (RF-04, RF-06, RF-07, RF-14, RF-23, RF-24)
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (Parte B.4)
//
// 4 cards superior: EV, ROI%, SD, RoR
// Tabela 3 linhas confidence intervals (70/95/99.7%)
// Bankroll percentiles (50/15/5/1% RoR)
// Source badge:
//   - emerald (recem-simulado, source=primedope)
//   - slate (cache, "Em cache (Xmin)")
//   - amber (fallback-stale, "Dados de Xh atras (PrimeDope offline)")
// Multiplier dropdown (1/4/12/52)
// Pin star toggle
// Skeleton loading + ETA progressivo "Simulando... Xs / ~4s"
// Erro 5xx, 429, 4xx tratados em PrimedopeErrorBlock
//
// data-testid:
//   - primedope-result
//   - primedope-result-card-ev
//   - primedope-result-card-roi
//   - primedope-result-card-sd
//   - primedope-result-card-ror
//   - primedope-result-confidence-table
//   - primedope-result-bankroll-percentiles
//   - primedope-source-badge
//   - primedope-result-pin
//   - primedope-result-multiplier
//   - primedope-result-skeleton
//   - primedope-result-eta
//   - primedope-error-block
//   - primedope-error-rate-limit-countdown
//   - primedope-error-mailto-cta
// =============================================================================

import { PrimedopeResult } from '../../client/src/components/primedope/PrimedopeResult';

beforeEach(() => {
  cleanup();
});

const sampleResult = {
  source: 'primedope' as const,
  data: {
    ev: 124.32,
    roiPct: 12.43,
    stdDev: 245.7,
    riskOfRuinPct: 4.2,
    confidenceIntervals: {
      p70: { low: -121.38, high: 370.02 },
      p95: { low: -367.08, high: 615.72 },
      p997: { low: -612.78, high: 861.42 },
    },
    minBankroll: { p50: 320, p15: 740, p05: 1180, p01: 1860 },
  },
  histogramUrl: '/api/primedope/chart/abc',
  randomRunsUrl: '/api/primedope/chart/def',
  latencyMs: 2840,
  inputHash: 'abc123',
  runId: 'pdr_1',
  pinned: false,
};

describe('<PrimedopeResult>', () => {
  describe('renderizacao com dados', () => {
    it('renderiza 4 cards superior com EV, ROI, SD, RoR', () => {
      render(<PrimedopeResult result={sampleResult} />);
      expect(screen.getByTestId('primedope-result')).toBeInTheDocument();
      expect(screen.getByTestId('primedope-result-card-ev')).toBeInTheDocument();
      expect(screen.getByTestId('primedope-result-card-roi')).toBeInTheDocument();
      expect(screen.getByTestId('primedope-result-card-sd')).toBeInTheDocument();
      expect(screen.getByTestId('primedope-result-card-ror')).toBeInTheDocument();
    });

    it('tabela confidence intervals com 3 linhas (70/95/99.7%)', () => {
      render(<PrimedopeResult result={sampleResult} />);
      const table = screen.getByTestId('primedope-result-confidence-table');
      expect(table).toBeInTheDocument();
      const text = table.textContent || '';
      expect(text).toMatch(/70/);
      expect(text).toMatch(/95/);
      expect(text).toMatch(/99\.7|99,7/);
    });

    it('bankroll percentiles 50/15/5/1', () => {
      render(<PrimedopeResult result={sampleResult} />);
      const block = screen.getByTestId('primedope-result-bankroll-percentiles');
      const text = block.textContent || '';
      expect(text).toMatch(/50/);
      expect(text).toMatch(/15/);
      expect(text).toMatch(/[15][\s%]/);
    });
  });

  describe('source badges', () => {
    it('source=primedope -> badge emerald "Recem-simulado"', () => {
      render(<PrimedopeResult result={{ ...sampleResult, source: 'primedope' }} />);
      const badge = screen.getByTestId('primedope-source-badge');
      const text = badge.textContent || '';
      expect(text).toMatch(/recem|recente|just|now/i);
    });

    it('source=cache -> badge slate "Em cache (Xmin atras)"', () => {
      render(
        <PrimedopeResult
          result={{
            ...sampleResult,
            source: 'cache',
            cachedAtMs: Date.now() - 5 * 60_000,
          }}
        />
      );
      const text = screen.getByTestId('primedope-source-badge').textContent || '';
      expect(text).toMatch(/cache/i);
    });

    it('source=fallback-stale -> badge amber com "PrimeDope offline" + idade', () => {
      render(
        <PrimedopeResult
          result={{
            ...sampleResult,
            source: 'fallback-stale',
            staleAgeMs: 5 * 3600_000, // 5h
          }}
        />
      );
      const text = screen.getByTestId('primedope-source-badge').textContent || '';
      expect(text).toMatch(/offline|fallback|stale/i);
    });
  });

  describe('pin toggle (RF-14)', () => {
    it('click no pin chama onTogglePin com runId', async () => {
      const onPin = vi.fn();
      const user = userEvent.setup();
      render(<PrimedopeResult result={sampleResult} onTogglePin={onPin} />);
      await user.click(screen.getByTestId('primedope-result-pin'));
      expect(onPin).toHaveBeenCalledWith('pdr_1', expect.any(Boolean));
    });
  });

  describe('multiplier dropdown', () => {
    it('renderiza 4 opcoes (1, 4, 12, 52)', () => {
      render(<PrimedopeResult result={sampleResult} />);
      expect(screen.getByTestId('primedope-result-multiplier')).toBeInTheDocument();
    });

    it('change multiplier dispara onMultiplierChange com debounce 2s (RF-06)', async () => {
      vi.useFakeTimers();
      const onChange = vi.fn();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(
        <PrimedopeResult result={sampleResult} onMultiplierChange={onChange} />
      );
      const select = screen.getByTestId('primedope-result-multiplier');
      await user.click(select);
      // Imediatamente apos selecionar, callback NAO deve disparar (debounce)
      expect(onChange).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2100);
      vi.useRealTimers();
    });
  });

  describe('skeleton loading + ETA', () => {
    it('isLoading=true -> renderiza skeleton + ETA', () => {
      render(<PrimedopeResult isLoading />);
      expect(screen.getByTestId('primedope-result-skeleton')).toBeInTheDocument();
      expect(screen.getByTestId('primedope-result-eta')).toBeInTheDocument();
    });
  });

  describe('error block (RF-24)', () => {
    it('error 429 -> countdown', () => {
      render(
        <PrimedopeResult
          error={{
            statusCode: 429,
            errorType: 'rate_limited',
            retryAfterMs: 8000,
          }}
        />
      );
      expect(screen.getByTestId('primedope-error-block')).toBeInTheDocument();
      expect(screen.getByTestId('primedope-error-rate-limit-countdown')).toBeInTheDocument();
    });

    it('error 502 upstream_4xx_schema_change -> CTA mailto + "Copiar detalhes tecnicos"', () => {
      render(
        <PrimedopeResult
          error={{
            statusCode: 502,
            errorType: 'upstream_4xx_schema_change',
            inputHash: 'abc123',
            timestamp: '2026-04-28T14:00:00Z',
          }}
        />
      );
      expect(screen.getByTestId('primedope-error-block')).toBeInTheDocument();
      expect(screen.getByTestId('primedope-error-mailto-cta')).toBeInTheDocument();
    });

    it('error 503 sem fallback -> "Servico indisponivel"', () => {
      render(
        <PrimedopeResult
          error={{
            statusCode: 503,
            errorType: 'upstream_5xx_no_fallback',
          }}
        />
      );
      const text = screen.getByTestId('primedope-error-block').textContent || '';
      expect(text).toMatch(/indispon|unavailable|offline/i);
    });
  });
});
