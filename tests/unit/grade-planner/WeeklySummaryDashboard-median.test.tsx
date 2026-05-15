// Test-Writer (Modo TDD - Red Phase)
// Spec: Docs/specs/grade-planner-mediana-participantes.md (RF-05)
// Cobre card "Mediana Participantes" no WeeklySummaryDashboard.
//
// Componente: client/src/components/grade-planner/WeeklySummaryDashboard.tsx
// Atual: label "Media Participantes" + sublabel "Estimativa" + calculo via media.
// Esperado pos-RF-05: label "Mediana Participantes" + sublabel "Estimativa (mediana)"
// + calculo via median(estimatedFieldSize(t)).
//
// Lessons aplicadas: #14 (await import), #30 (.test.tsx em jsdom).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';

// Helpers para construir conjunto de torneios cujo estimatedFieldSize seja
// previsivel via `Math.round(guaranteed / buyIn)`.
function mkTournament(opts: {
  estimate?: number | null;  // estimatedFieldSize esperado (helper auxiliar)
  buyIn?: string;
  guaranteed?: string;
  site?: string;
  type?: string;
  speed?: string;
  time?: string;
}) {
  const buyIn = opts.buyIn ?? '100';
  let guaranteed: string | undefined;
  if (opts.guaranteed !== undefined) {
    guaranteed = opts.guaranteed;
  } else if (opts.estimate != null) {
    guaranteed = String(opts.estimate * parseFloat(buyIn));
  }
  return {
    site: opts.site ?? 'PokerStars',
    type: opts.type ?? 'Vanilla',
    speed: opts.speed ?? 'Normal',
    time: opts.time ?? '19:00',
    buyIn,
    guaranteed,
  };
}

function makeProps(activeDayTournaments: any[]) {
  return {
    isDayActiveWithTournaments: vi.fn((dayId: number) => dayId === 1 && activeDayTournaments.length > 0),
    getTournamentsForDay: vi.fn((dayId: number) =>
      dayId === 1 ? activeDayTournaments : []
    ),
    getDayStats: vi.fn(() => ({
      count: activeDayTournaments.length,
      avgBuyIn: 100,
      totalBuyIn: 100 * activeDayTournaments.length,
      vanillaPercentage: 100,
      pkoPercentage: 0,
      mysteryPercentage: 0,
      normalPercentage: 100,
      turboPercentage: 0,
      hyperPercentage: 0,
      medianFieldSize: null,
      startTime: '19:00',
      endTime: '22:00',
      durationHours: 3,
    })),
  };
}

describe('WeeklySummaryDashboard — card de mediana de participantes (RF-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('label do card exibe "Mediana Participantes" (NAO "Media Participantes")', async () => {
    const { WeeklySummaryDashboard } = await import('@/components/grade-planner/WeeklySummaryDashboard');
    const tournaments = [
      mkTournament({ estimate: 300 }),
      mkTournament({ estimate: 400 }),
      mkTournament({ estimate: 500 }),
    ];
    render(React.createElement(WeeklySummaryDashboard, makeProps(tournaments) as any));

    expect(screen.getByText(/Mediana Participantes/i)).toBeInTheDocument();
    // Garante remocao do label antigo
    expect(screen.queryByText(/^M[eé]dia Participantes$/i)).toBeNull();
  });

  it('sublabel exibe "Estimativa (mediana)" (NAO so "Estimativa")', async () => {
    const { WeeklySummaryDashboard } = await import('@/components/grade-planner/WeeklySummaryDashboard');
    const tournaments = [
      mkTournament({ estimate: 300 }),
      mkTournament({ estimate: 400 }),
      mkTournament({ estimate: 500 }),
    ];
    render(React.createElement(WeeklySummaryDashboard, makeProps(tournaments) as any));

    expect(screen.getByText(/Estimativa\s*\(mediana\)/i)).toBeInTheDocument();
  });

  it('outlier check: 7 torneios com estimates [150,200,250,300,400,500,10000] -> exibe 300 (NAO ~1714)', async () => {
    const { WeeklySummaryDashboard } = await import('@/components/grade-planner/WeeklySummaryDashboard');
    const tournaments = [
      mkTournament({ estimate: 150 }),
      mkTournament({ estimate: 200 }),
      mkTournament({ estimate: 250 }),
      mkTournament({ estimate: 300 }),
      mkTournament({ estimate: 400 }),
      mkTournament({ estimate: 500 }),
      mkTournament({ estimate: 10000 }), // outlier (ex: Sunday Million)
    ];
    render(React.createElement(WeeklySummaryDashboard, makeProps(tournaments) as any));

    // Localizar o card pela label
    const label = screen.getByText(/Mediana Participantes/i);
    const card = label.closest('.weekly-summary-card') as HTMLElement;
    expect(card).not.toBeNull();

    // O valor exibido (4o elemento de array ordenado = 300) deve estar dentro do card
    expect(within(card).getByText(/^300$/)).toBeInTheDocument();
    // E NAO deve aparecer a media inflacionada
    expect(within(card).queryByText(/1\.?714/)).toBeNull();
    expect(within(card).queryByText(/1\.?686/)).toBeNull();
  });

  it('nenhum torneio com garantido valido -> exibe "N/A"', async () => {
    const { WeeklySummaryDashboard } = await import('@/components/grade-planner/WeeklySummaryDashboard');
    const tournaments = [
      mkTournament({ guaranteed: '0' }),
      { site: 'PokerStars', type: 'Vanilla', speed: 'Normal', time: '19:00', buyIn: '100' }, // sem guaranteed
    ];
    render(React.createElement(WeeklySummaryDashboard, makeProps(tournaments) as any));

    const label = screen.getByText(/Mediana Participantes/i);
    const card = label.closest('.weekly-summary-card') as HTMLElement;
    expect(card).not.toBeNull();
    expect(within(card).getByText(/N\/A/i)).toBeInTheDocument();
  });

  it('nenhum dia ativo -> card mostra "N/A"', async () => {
    const { WeeklySummaryDashboard } = await import('@/components/grade-planner/WeeklySummaryDashboard');
    render(React.createElement(WeeklySummaryDashboard, makeProps([]) as any));

    const label = screen.getByText(/Mediana Participantes/i);
    const card = label.closest('.weekly-summary-card') as HTMLElement;
    expect(card).not.toBeNull();
    expect(within(card).getByText(/N\/A/i)).toBeInTheDocument();
  });
});
