/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-2 — RF-31 (B9 Tournament Selector Top 3 Hoje).
 *
 * Spec : Docs/specs/home-reform-2.md §3 B9, §5 RF-31
 *
 * Status RED: componente NAO existe em
 * `client/src/components/home/TournamentRecommendations.tsx`.
 *
 * Lessons aplicadas:
 *   #14  await import(...) em vez de require — ESM compat
 *   #15  vi.mock no top-level (sem nested vi.unmock)
 *   #2   data-testid estavel
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const mockNavigate = vi.fn();
vi.mock('wouter', () => ({
  Link: ({ href, children, onClick, ...rest }: any) => (
    <a
      href={href}
      onClick={(e: any) => {
        mockNavigate(href);
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
  useLocation: () => ['/', vi.fn()],
}));

const mockEmit = vi.fn();
vi.mock('@/lib/tracker', () => ({
  emit: (...args: any[]) => mockEmit(...args),
}));

beforeEach(() => {
  mockNavigate.mockReset();
  mockEmit.mockReset();
});

// ---------------------------------------------------------------------------
// Fixtures (shape RF-31)
// ---------------------------------------------------------------------------
const recs = [
  {
    id: 'TR1',
    name: 'Sunday Million $109',
    buyinUsd: 109,
    buyinNative: 109,
    currency: 'USD',
    score: 92,
    grade: 'S' as const,
    startTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    platform: 'PokerStars',
    alreadyInGrid: false,
  },
  {
    id: 'TR2',
    name: 'GG Bounty Hunters $55',
    buyinUsd: 55,
    buyinNative: 55,
    currency: 'USD',
    score: 81,
    grade: 'A' as const,
    startTime: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    platform: 'GGPoker',
    alreadyInGrid: false,
  },
  {
    id: 'TR3',
    name: 'ACR The Big $33',
    buyinUsd: 33,
    buyinNative: 33,
    currency: 'USD',
    score: 73,
    grade: 'B' as const,
    startTime: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString(),
    platform: 'ACR',
    alreadyInGrid: true,
  },
];

describe('<TournamentRecommendations /> — render basico', () => {
  it('renderiza container com data-testid="home-tournament-recommendations"', async () => {
    const { default: TournamentRecommendations } = await import('../TournamentRecommendations');
    render(<TournamentRecommendations data={recs} plannedTodayCount={0} />);
    expect(screen.getByTestId('home-tournament-recommendations')).toBeInTheDocument();
  });

  it('renderiza 3 cards com testids estaveis por id', async () => {
    const { default: TournamentRecommendations } = await import('../TournamentRecommendations');
    render(<TournamentRecommendations data={recs} plannedTodayCount={0} />);
    const cards = screen.getAllByTestId(/^home-tournament-recommendations-card-/);
    expect(cards.length).toBe(3);
  });

  it('cada card mostra name + buyin + score + grade', async () => {
    const { default: TournamentRecommendations } = await import('../TournamentRecommendations');
    render(<TournamentRecommendations data={[recs[0]]} plannedTodayCount={0} />);
    const card = screen.getByTestId('home-tournament-recommendations-card-TR1');
    expect(card.textContent).toMatch(/Sunday Million/);
    expect(card.textContent).toMatch(/109/);
    expect(card.textContent).toMatch(/92/);
    expect(card.textContent).toMatch(/S/);
  });
});

describe('<TournamentRecommendations /> — empty states', () => {
  it('com data=[] e sem grade configurada -> mostra CTA p/ /grade-planner', async () => {
    const { default: TournamentRecommendations } = await import('../TournamentRecommendations');
    render(<TournamentRecommendations data={[]} plannedTodayCount={0} />);
    const cta = screen.getByTestId('home-tournament-recommendations-empty-cta');
    expect(cta.getAttribute('href')).toMatch(/grade-planner|coach/);
  });

  it('com data=[] e plannedTodayCount > 0 -> texto "sem recomendacoes acima de score 70 hoje"', async () => {
    const { default: TournamentRecommendations } = await import('../TournamentRecommendations');
    render(<TournamentRecommendations data={[]} plannedTodayCount={3} />);
    expect(screen.getByText(/sem recomenda|score 70|nada acima/i)).toBeInTheDocument();
  });
});

describe('<TournamentRecommendations /> — tracker', () => {
  it('emit("home_tournament_recommendations_view", { count }) no mount', async () => {
    const { default: TournamentRecommendations } = await import('../TournamentRecommendations');
    render(<TournamentRecommendations data={recs} plannedTodayCount={0} />);
    const found = mockEmit.mock.calls.find((c) => c[0] === 'home_tournament_recommendations_view');
    expect(found).toBeDefined();
    expect(found?.[1]).toMatchObject({ count: 3 });
  });

  it('emit click no CTA com payload {grade, score}', async () => {
    const { default: TournamentRecommendations } = await import('../TournamentRecommendations');
    render(<TournamentRecommendations data={[recs[0]]} plannedTodayCount={0} />);
    const card = screen.getByTestId('home-tournament-recommendations-card-TR1');
    fireEvent.click(card);
    const found = mockEmit.mock.calls.find((c) => c[0] === 'home_tournament_recommendations_click');
    expect(found).toBeDefined();
    expect(found?.[1]).toMatchObject({ grade: 'S', score: 92 });
  });
});
