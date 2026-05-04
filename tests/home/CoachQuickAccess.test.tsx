/**
 * Test — Sprint home-reform-5 item 3.
 *
 * Spec: Docs/specs/home-reform-5.md item 3.
 *
 * Cobre os 2 cards refatorados consumindo coachContext:
 *   - TodayCard       (Item 3.1) — label "B - 152 torneios" / "A + B - 304 torneios" / "DAY OFF".
 *   - NextTournamentCountdown (Item 3.2) — titulo "Iniciar Sessao", CTA -> /grind?open=quickstart,
 *                                          empty state DAY OFF.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('wouter', () => ({
  Link: ({ children, href }: any) =>
    React.cloneElement(React.Children.only(children) as any, { href }),
}));

vi.mock('@/lib/tracker', () => ({
  emit: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

import TodayCard from '@/components/home/TodayCard';
import NextTournamentCountdown from '@/components/home/NextTournamentCountdown';

const todayBase = {
  profile: 'B' as const,
  plannedCount: 152,
  firstStartTime: null,
  stopLoss: null,
  stopTime: null,
  hasWarmupToday: false,
};

// ============================================================================
// 3.1 — TodayCard com coachContext
// ============================================================================

describe('TodayCard — coachContext label (item 3.1)', () => {
  it('1 perfil ativo -> "B - 152 torneios"', () => {
    render(
      <TodayCard
        data={todayBase}
        coachContext={{
          activeProfiles: ['B'],
          todayTournamentsTotal: 152,
          isDayOff: false,
        }}
      />,
    );
    expect(screen.getByTestId('today-card-coach-label').textContent).toBe(
      'B - 152 torneios',
    );
  });

  it('2 perfis ativos -> "A + B - 304 torneios"', () => {
    render(
      <TodayCard
        data={todayBase}
        coachContext={{
          activeProfiles: ['A', 'B'],
          todayTournamentsTotal: 304,
          isDayOff: false,
        }}
      />,
    );
    expect(screen.getByTestId('today-card-coach-label').textContent).toBe(
      'A + B - 304 torneios',
    );
  });

  it('3 perfis ativos -> "A + B + C - X torneios"', () => {
    render(
      <TodayCard
        data={todayBase}
        coachContext={{
          activeProfiles: ['A', 'B', 'C'],
          todayTournamentsTotal: 12,
          isDayOff: false,
        }}
      />,
    );
    expect(screen.getByTestId('today-card-coach-label').textContent).toBe(
      'A + B + C - 12 torneios',
    );
  });

  it('isDayOff -> exibe "DAY OFF"', () => {
    render(
      <TodayCard
        data={todayBase}
        coachContext={{
          activeProfiles: [],
          todayTournamentsTotal: 0,
          isDayOff: true,
        }}
      />,
    );
    expect(screen.getByTestId('today-card-coach-label').textContent).toBe('DAY OFF');
  });

  it('singular: 1 torneio -> "B - 1 torneio"', () => {
    render(
      <TodayCard
        data={todayBase}
        coachContext={{
          activeProfiles: ['B'],
          todayTournamentsTotal: 1,
          isDayOff: false,
        }}
      />,
    );
    expect(screen.getByTestId('today-card-coach-label').textContent).toBe(
      'B - 1 torneio',
    );
  });

  it('coachContext ausente -> fallback para data.profile + plannedCount (back-compat)', () => {
    render(<TodayCard data={todayBase} />);
    // Quando coachContext nao fornecido, mantem layout antigo (sem testid novo).
    expect(screen.queryByTestId('today-card-coach-label')).not.toBeInTheDocument();
  });
});

// ============================================================================
// 3.2 — NextTournamentCountdown rebatizado para "Iniciar Sessao"
// ============================================================================

describe('NextTournamentCountdown — Iniciar Sessao (item 3.2)', () => {
  it('mostra titulo "Iniciar Sessao" (renomeacao)', () => {
    render(
      <NextTournamentCountdown
        data={null}
        coachContext={{
          activeProfiles: ['B'],
          todayTournamentsTotal: 5,
          isDayOff: false,
        }}
      />,
    );
    expect(screen.getByTestId('iniciar-sessao-title').textContent).toBe(
      'Iniciar Sessao',
    );
  });

  it('mostra count torneios planejados quando perfil ativo', () => {
    render(
      <NextTournamentCountdown
        data={null}
        coachContext={{
          activeProfiles: ['A', 'B'],
          todayTournamentsTotal: 304,
          isDayOff: false,
        }}
      />,
    );
    expect(screen.getByTestId('iniciar-sessao-count').textContent).toContain('304');
  });

  it('CTA leva para /grind?open=quickstart', () => {
    render(
      <NextTournamentCountdown
        data={null}
        coachContext={{
          activeProfiles: ['B'],
          todayTournamentsTotal: 5,
          isDayOff: false,
        }}
      />,
    );
    const cta = screen.getByTestId('iniciar-sessao-cta') as HTMLAnchorElement;
    expect(cta.getAttribute('href')).toBe('/grind?open=quickstart');
  });

  it('isDayOff -> exibe "DAY OFF" sem CTA', () => {
    render(
      <NextTournamentCountdown
        data={null}
        coachContext={{
          activeProfiles: [],
          todayTournamentsTotal: 0,
          isDayOff: true,
        }}
      />,
    );
    expect(screen.getByTestId('iniciar-sessao-day-off')).toBeInTheDocument();
    expect(screen.queryByTestId('iniciar-sessao-cta')).not.toBeInTheDocument();
  });

  it('coachContext ausente + nextTournament null -> renderiza null (back-compat)', () => {
    const { container } = render(<NextTournamentCountdown data={null} />);
    expect(container.firstChild).toBeNull();
  });
});
