/**
 * Tests v1 (Spec §3 16 KPIs) — KPIs novos em DashboardMetricsCards.
 *
 * Cobre: Sessões, Tempo Médio Sessão, Jogos por Dia, Lucro Médio Dia,
 *         Lucro Médio Torneio, Lucro Médio Hora, Registros, Maior Resultado.
 *
 * Helper formatDurationMin: minutos -> "Xh YYm".
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import DashboardMetricsCards from '../../../client/src/components/grind-session/DashboardMetricsCards';
import type { DashboardMetrics } from '../../../client/src/components/grind-session/types';

const baseMetrics: DashboardMetrics = {
  totalSessions: 5,
  totalVolume: 50,
  totalProfit: 250,
  avgABI: 22,
  avgROI: 12.5,
  totalFTs: 3,
  totalCravadas: 1,
  avgEnergia: 0,
  avgFoco: 0,
  avgConfianca: 0,
  avgInteligenciaEmocional: 0,
  avgInterferencias: 0,
  avgPreparationPercentage: 0,
  totalReentradas: 8,
  avgParticipants: 1234,
  itmPercentage: 22.5,
  maiorResultado: 350,
  // v1 novos
  totalRegistros: 50,
  avgSessionDurationMin: 150,        // 2h 30m
  gamesPerActiveDay: 12.5,
  profitPerActiveDay: 50,
  profitPerHour: 20,
  profitPerTournament: 5,
};

const defaultProps = {
  dashboardMetrics: baseMetrics,
  showTournamentToggle: false,
  setShowTournamentToggle: () => {},
  showMentalToggle: false,
  setShowMentalToggle: () => {},
};

describe('DashboardMetricsCards — v1 KPIs novos', () => {
  it('renderiza Sessões com valor totalSessions', () => {
    const { container } = render(<DashboardMetricsCards {...defaultProps} />);
    expect(container.textContent).toContain('Sessões');
    expect(container.textContent).toContain('5');
  });

  it('renderiza Tempo Médio Sessão formatado "2h 30m"', () => {
    const { container } = render(<DashboardMetricsCards {...defaultProps} />);
    expect(container.textContent).toContain('Tempo Médio Sessão');
    expect(container.textContent).toContain('2h 30m');
  });

  it('renderiza Jogos por Dia com 1 decimal', () => {
    const { container } = render(<DashboardMetricsCards {...defaultProps} />);
    expect(container.textContent).toContain('Jogos por Dia');
    expect(container.textContent).toContain('12.5');
  });

  it('renderiza Lucro Médio Hora formatado moeda', () => {
    const { container } = render(<DashboardMetricsCards {...defaultProps} />);
    expect(container.textContent).toContain('Lucro Médio Hora');
    expect(container.textContent).toMatch(/\$\s*20[.,]/);
  });

  it('renderiza Lucro Médio Torneio (profitPerTournament)', () => {
    const { container } = render(<DashboardMetricsCards {...defaultProps} />);
    expect(container.textContent).toContain('Lucro Médio Torneio');
    expect(container.textContent).toMatch(/\$\s*5[.,]/);
  });

  it('renderiza Lucro Médio Dia (profitPerActiveDay)', () => {
    const { container } = render(<DashboardMetricsCards {...defaultProps} />);
    expect(container.textContent).toContain('Lucro Médio Dia');
  });

  it('renderiza Registros (totalRegistros) em vez de Contagem', () => {
    const { container } = render(<DashboardMetricsCards {...defaultProps} />);
    expect(container.textContent).toContain('Registros');
    expect(container.textContent).not.toContain('Contagem');
  });

  it('Maior Resultado mostra valor formatado quando > 0', () => {
    const { container } = render(<DashboardMetricsCards {...defaultProps} />);
    expect(container.textContent).toContain('Maior Resultado');
    expect(container.textContent).toMatch(/\$\s*350[.,]/);
  });

  it('campos com divisor zero -> "—"', () => {
    const empty: DashboardMetrics = {
      ...baseMetrics,
      totalSessions: 0,
      totalRegistros: 0,
      avgSessionDurationMin: 0,
      gamesPerActiveDay: 0,
      profitPerActiveDay: 0,
      profitPerHour: 0,
      profitPerTournament: 0,
      maiorResultado: 0,
      avgParticipants: 0,
    };
    const { container } = render(
      <DashboardMetricsCards {...defaultProps} dashboardMetrics={empty} />,
    );
    // Pelo menos 4 ocorrencias do em-dash em campos com divisor zero.
    const matches = (container.textContent ?? '').match(/—/g);
    expect(matches).not.toBeNull();
    expect((matches as string[]).length).toBeGreaterThanOrEqual(4);
  });

  it('respeita visibility kpisSession=false -> esconde linha', () => {
    const { container } = render(
      <DashboardMetricsCards
        {...defaultProps}
        visibility={{
          kpisVolume: true,
          kpisSession: false,
          kpisProfit: true,
          kpisItm: true,
          kpisTypes: false,
          kpisSpeeds: false,
          kpisPlatforms: false,
          history: true,
        }}
      />,
    );
    expect(container.textContent).not.toContain('Tempo Médio Sessão');
    expect(container.textContent).not.toContain('Jogos por Dia');
  });
});
