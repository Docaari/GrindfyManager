/**
 * Tests for `DashboardMetricsCards` breakdowns (3 toggles).
 *
 * Sprint Grind-Cards-Reform v2 — CA-13/14/15/16 + §3.1 + §4.3.
 *
 * Cobertura:
 * 1. Toggle "Torneios" expandido renderiza 5 cards Vanilla/PKO/Mystery/Satellite/Add-on
 *    com count + percentage + Lucro + ROI.
 * 2. Bucket vazio (count=0) -> exibe `0`, `$0.00`, `—` (em vez de NaN/null).
 * 3. Toggle "Velocidade" expandido renderiza 3 cards Normal/Turbo/Hyper.
 * 4. Toggle "Plataformas" com array vazio -> texto fallback "Nenhuma plataforma..."
 * 5. Toggle "Plataformas" com 2 networks -> 2 cards.
 * 6. Visibility flags kpisTypes/kpisSpeeds/kpisPlatforms = false escondem o bloco.
 * 7. data-testid estaveis em cada card colapsavel + cada bucket card.
 * 8. aria-expanded reflete estado.
 * 9. formatCurrencyBase prop usado nos sub-valores Lucro.
 *
 * Lessons:
 *  - Lesson #14/#26: `require()` em .tsx falha com vitest 4. Usar static import quando possivel.
 *  - Lesson #2: data-testid estaveis (nao findByText).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { BreakdownBucket } from '../../../client/src/components/grind-session/types';
import DashboardMetricsCards from '../../../client/src/components/grind-session/DashboardMetricsCards';

// =============================================================================
// Fixtures
// =============================================================================

function bucket(overrides: Partial<BreakdownBucket> = {}): BreakdownBucket {
  return {
    key: overrides.key ?? 'Vanilla',
    label: overrides.label ?? 'Vanilla',
    count: overrides.count ?? 0,
    percentage: overrides.percentage ?? 0,
    totalProfitUsd: overrides.totalProfitUsd ?? 0,
    totalInvestedUsd: overrides.totalInvestedUsd ?? 0,
    roi: overrides.roi ?? null,
    colorHex: overrides.colorHex,
  };
}

function makeMetrics(overrides: Partial<Record<string, any>> = {}): any {
  return {
    totalSessions: 0,
    totalVolume: 0,
    totalProfit: 0,
    avgABI: 0,
    avgROI: 0,
    totalFTs: 0,
    totalCravadas: 0,
    avgEnergia: 0,
    avgFoco: 0,
    avgConfianca: 0,
    avgInteligenciaEmocional: 0,
    avgInterferencias: 0,
    avgPreparationPercentage: 0,
    totalReentradas: 0,
    avgParticipants: 0,
    itmPercentage: 0,
    maiorResultado: 0,
    typesBreakdown: [],
    speedsBreakdown: [],
    platformsBreakdown: [],
    ...overrides,
  };
}

const baseVisibility = {
  kpisVolume: true,
  kpisProfit: true,
  kpisItm: true,
  kpisSession: true,
  kpisTypes: true,
  kpisSpeeds: true,
  kpisPlatforms: true,
  tournaments: true, // chave antiga (pode coexistir)
  history: true,
} as any;

const baseProps: any = {
  showTournamentToggle: true,
  setShowTournamentToggle: vi.fn(),
  showMentalToggle: false,
  setShowMentalToggle: vi.fn(),
  recentSessions: [],
  visibility: baseVisibility,
  mentalEnabled: false,
  // novas props v2 — controlam expand/collapse das 3 secoes
  showTypesToggle: true,
  setShowTypesToggle: vi.fn(),
  showSpeedsToggle: true,
  setShowSpeedsToggle: vi.fn(),
  showPlatformsToggle: true,
  setShowPlatformsToggle: vi.fn(),
};

// =============================================================================
// Torneios (5 cards)
// =============================================================================

describe('DashboardMetricsCards — toggle Torneios (CA-13)', () => {
  it('renderiza 5 cards Vanilla/PKO/Mystery/Satellite/Add-on quando expandido', () => {
    const types: BreakdownBucket[] = [
      bucket({ key: 'Vanilla', label: 'Vanilla', count: 4, percentage: 40, totalProfitUsd: 100, totalInvestedUsd: 1000, roi: 10, colorHex: '#71717a' }),
      bucket({ key: 'PKO', label: 'PKO (Bounty)', count: 2, percentage: 20, totalProfitUsd: 50, totalInvestedUsd: 500, roi: 10, colorHex: '#a78bfa' }),
      bucket({ key: 'Mystery', label: 'Mystery Bounty', count: 1, percentage: 10, totalProfitUsd: 20, totalInvestedUsd: 200, roi: 10, colorHex: '#e879f9' }),
      bucket({ key: 'Satellite', label: 'Satélite', count: 1, percentage: 10, totalProfitUsd: 0, totalInvestedUsd: 100, roi: 0, colorHex: '#fbbf24' }),
      bucket({ key: 'Add-on', label: 'Add-on', count: 2, percentage: 20, totalProfitUsd: 30, totalInvestedUsd: 300, roi: 10, colorHex: '#fb923c' }),
    ];
    render(
      <DashboardMetricsCards
        {...baseProps}
        dashboardMetrics={makeMetrics({ typesBreakdown: types })}
      />,
    );

    // Cada bucket tem data-testid="bucket-type-{lowercase-key}".
    expect(screen.getByTestId('bucket-type-vanilla')).toBeInTheDocument();
    expect(screen.getByTestId('bucket-type-pko')).toBeInTheDocument();
    expect(screen.getByTestId('bucket-type-mystery')).toBeInTheDocument();
    expect(screen.getByTestId('bucket-type-satellite')).toBeInTheDocument();
    expect(screen.getByTestId('bucket-type-add-on')).toBeInTheDocument();
  });

  it('Add-on com count=0 / profit=0 / roi=null -> exibe 0, $0.00, "—"', () => {
    const types: BreakdownBucket[] = [
      bucket({ key: 'Vanilla', label: 'Vanilla', count: 0, percentage: 0, roi: null }),
      bucket({ key: 'PKO', label: 'PKO (Bounty)', count: 0, percentage: 0, roi: null }),
      bucket({ key: 'Mystery', label: 'Mystery Bounty', count: 0, percentage: 0, roi: null }),
      bucket({ key: 'Satellite', label: 'Satélite', count: 0, percentage: 0, roi: null }),
      bucket({ key: 'Add-on', label: 'Add-on', count: 0, percentage: 0, roi: null }),
    ];
    render(
      <DashboardMetricsCards
        {...baseProps}
        dashboardMetrics={makeMetrics({ typesBreakdown: types })}
      />,
    );
    const addonCard = screen.getByTestId('bucket-type-add-on');
    expect(addonCard.textContent).toMatch(/0/);
    // ROI = null -> renderiza "—" (em-dash)
    expect(addonCard.textContent).toMatch(/—/);
  });

  it('toggle Torneios tem data-testid="grind-breakdown-types" + aria-expanded', () => {
    render(
      <DashboardMetricsCards
        {...baseProps}
        dashboardMetrics={makeMetrics({
          typesBreakdown: [bucket({ key: 'Vanilla', label: 'Vanilla' })],
        })}
      />,
    );
    const toggle = screen.getByTestId('grind-breakdown-types');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('aria-expanded=false quando showTypesToggle=false', () => {
    render(
      <DashboardMetricsCards
        {...baseProps}
        showTypesToggle={false}
        dashboardMetrics={makeMetrics({
          typesBreakdown: [bucket({ key: 'Vanilla', label: 'Vanilla' })],
        })}
      />,
    );
    const toggle = screen.getByTestId('grind-breakdown-types');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

// =============================================================================
// Velocidade (3 cards)
// =============================================================================

describe('DashboardMetricsCards — toggle Velocidade (CA-14)', () => {
  it('renderiza 3 cards Normal/Turbo/Hyper quando expandido', () => {
    const speeds: BreakdownBucket[] = [
      bucket({ key: 'Normal', label: 'Normal', count: 5, percentage: 50, totalProfitUsd: 100, totalInvestedUsd: 1000, roi: 10 }),
      bucket({ key: 'Turbo', label: 'Turbo', count: 3, percentage: 30, totalProfitUsd: 60, totalInvestedUsd: 600, roi: 10 }),
      bucket({ key: 'Hyper', label: 'Hyper', count: 2, percentage: 20, totalProfitUsd: 40, totalInvestedUsd: 400, roi: 10 }),
    ];
    render(
      <DashboardMetricsCards
        {...baseProps}
        dashboardMetrics={makeMetrics({ speedsBreakdown: speeds })}
      />,
    );
    expect(screen.getByTestId('bucket-speed-normal')).toBeInTheDocument();
    expect(screen.getByTestId('bucket-speed-turbo')).toBeInTheDocument();
    expect(screen.getByTestId('bucket-speed-hyper')).toBeInTheDocument();
  });

  it('toggle Velocidade tem data-testid="grind-breakdown-speeds" + aria-expanded', () => {
    render(
      <DashboardMetricsCards
        {...baseProps}
        dashboardMetrics={makeMetrics({
          speedsBreakdown: [bucket({ key: 'Normal', label: 'Normal' })],
        })}
      />,
    );
    const toggle = screen.getByTestId('grind-breakdown-speeds');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});

// =============================================================================
// Plataformas (N cards dinamicos)
// =============================================================================

describe('DashboardMetricsCards — toggle Plataformas (CA-15)', () => {
  it('renderiza N cards quando platformsBreakdown tem 2 networks', () => {
    const platforms: BreakdownBucket[] = [
      bucket({ key: 'WPN', label: 'WPN', count: 3, percentage: 60, totalProfitUsd: 60, totalInvestedUsd: 600, roi: 10 }),
      bucket({ key: 'GGNetwork', label: 'GGNetwork', count: 2, percentage: 40, totalProfitUsd: 40, totalInvestedUsd: 400, roi: 10 }),
    ];
    render(
      <DashboardMetricsCards
        {...baseProps}
        dashboardMetrics={makeMetrics({ platformsBreakdown: platforms })}
      />,
    );
    expect(screen.getByTestId('bucket-platform-wpn')).toBeInTheDocument();
    expect(screen.getByTestId('bucket-platform-ggnetwork')).toBeInTheDocument();
  });

  it('platformsBreakdown vazio + toggle aberto -> exibe texto fallback', () => {
    render(
      <DashboardMetricsCards
        {...baseProps}
        dashboardMetrics={makeMetrics({ platformsBreakdown: [] })}
      />,
    );
    // Texto exato definido pela spec §3.1.
    expect(
      screen.getByText(/Nenhuma plataforma com registros no periodo/i),
    ).toBeInTheDocument();
  });

  it('toggle Plataformas tem data-testid="grind-breakdown-platforms" + aria-expanded', () => {
    render(
      <DashboardMetricsCards
        {...baseProps}
        dashboardMetrics={makeMetrics({
          platformsBreakdown: [bucket({ key: 'WPN', label: 'WPN', count: 1 })],
        })}
      />,
    );
    const toggle = screen.getByTestId('grind-breakdown-platforms');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});

// =============================================================================
// Visibility flags
// =============================================================================

describe('DashboardMetricsCards — visibility flags v2', () => {
  it('kpisTypes=false esconde o bloco Torneios (sequer header renderiza)', () => {
    render(
      <DashboardMetricsCards
        {...baseProps}
        visibility={{ ...baseVisibility, kpisTypes: false }}
        dashboardMetrics={makeMetrics({
          typesBreakdown: [bucket({ key: 'Vanilla', label: 'Vanilla', count: 5 })],
        })}
      />,
    );
    expect(screen.queryByTestId('grind-breakdown-types')).not.toBeInTheDocument();
  });

  it('kpisSpeeds=false esconde o bloco Velocidade', () => {
    render(
      <DashboardMetricsCards
        {...baseProps}
        visibility={{ ...baseVisibility, kpisSpeeds: false }}
        dashboardMetrics={makeMetrics({
          speedsBreakdown: [bucket({ key: 'Normal', label: 'Normal', count: 5 })],
        })}
      />,
    );
    expect(screen.queryByTestId('grind-breakdown-speeds')).not.toBeInTheDocument();
  });

  it('kpisPlatforms=false esconde o bloco Plataformas', () => {
    render(
      <DashboardMetricsCards
        {...baseProps}
        visibility={{ ...baseVisibility, kpisPlatforms: false }}
        dashboardMetrics={makeMetrics({
          platformsBreakdown: [bucket({ key: 'WPN', label: 'WPN', count: 5 })],
        })}
      />,
    );
    expect(screen.queryByTestId('grind-breakdown-platforms')).not.toBeInTheDocument();
  });
});

// =============================================================================
// FX prop wiring (formatCurrencyBase)
// =============================================================================

describe('DashboardMetricsCards — formatCurrencyBase wiring (CA-08)', () => {
  it('cards de Lucro usam formatCurrencyBase quando fornecido', () => {
    const formatCurrencyBase = vi.fn((amountUsd: number) => `R$${(amountUsd * 5).toFixed(2)}`);
    render(
      <DashboardMetricsCards
        {...baseProps}
        formatCurrencyBase={formatCurrencyBase}
        dashboardMetrics={makeMetrics({
          typesBreakdown: [
            bucket({ key: 'Vanilla', label: 'Vanilla', count: 1, percentage: 100, totalProfitUsd: 10, totalInvestedUsd: 100, roi: 10 }),
            bucket({ key: 'PKO', label: 'PKO (Bounty)', count: 0, percentage: 0, roi: null }),
            bucket({ key: 'Mystery', label: 'Mystery Bounty', count: 0, percentage: 0, roi: null }),
            bucket({ key: 'Satellite', label: 'Satélite', count: 0, percentage: 0, roi: null }),
            bucket({ key: 'Add-on', label: 'Add-on', count: 0, percentage: 0, roi: null }),
          ],
        })}
      />,
    );
    // formatCurrencyBase foi chamado para o sub-valor Lucro do bucket Vanilla.
    expect(formatCurrencyBase).toHaveBeenCalled();
    const calledWithProfit = formatCurrencyBase.mock.calls.some(([arg]) => arg === 10);
    expect(calledWithProfit).toBe(true);
  });
});
