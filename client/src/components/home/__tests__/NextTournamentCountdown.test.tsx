/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-12 (S4 next tournament countdown).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-12, §5.4 S4, §3 D15
 *
 * Status RED: componente NAO existe em
 * `client/src/components/home/NextTournamentCountdown.tsx`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/', vi.fn()],
}));

const mockEmit = vi.fn();
vi.mock('@/lib/tracker', () => ({
  emit: (...args: any[]) => mockEmit(...args),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-03T17:00:00Z'));
  mockEmit.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

const tournament = {
  startTime: '2026-05-03T18:30:00Z', // 1h 30min no futuro
  name: 'Sunday Million',
  buyin: 109,
  currency: 'USD',
  platform: 'PokerStars',
};

describe('<NextTournamentCountdown /> — render condicional', () => {
  it('data=null => card oculto', async () => {
    const { default: NextTournamentCountdown } = await import('../NextTournamentCountdown');
    const { container } = render(<NextTournamentCountdown data={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('data=tournament => card visivel', async () => {
    const { default: NextTournamentCountdown } = await import('../NextTournamentCountdown');
    render(<NextTournamentCountdown data={tournament} />);
    expect(screen.getByTestId('next-tournament-countdown')).toBeInTheDocument();
  });
});

describe('<NextTournamentCountdown /> — texto countdown', () => {
  it('com diff > 60s mostra "Em Xh Ymin"', async () => {
    const { default: NextTournamentCountdown } = await import('../NextTournamentCountdown');
    render(<NextTournamentCountdown data={tournament} />);
    const card = screen.getByTestId('next-tournament-countdown');
    expect(card.textContent).toMatch(/em\s+1h\s*30min|1h.*30min/i);
  });

  it('com diff < 60s mostra "Comecando agora"', async () => {
    const { default: NextTournamentCountdown } = await import('../NextTournamentCountdown');
    const data = {
      ...tournament,
      startTime: new Date(Date.now() + 30_000).toISOString(), // +30s
    };
    render(<NextTournamentCountdown data={data} />);
    const card = screen.getByTestId('next-tournament-countdown');
    expect(card.textContent?.toLowerCase()).toContain('comecando agora');
  });

  it('com diff <= 0 mostra "Em andamento" + link /grind-live', async () => {
    const { default: NextTournamentCountdown } = await import('../NextTournamentCountdown');
    const data = {
      ...tournament,
      startTime: new Date(Date.now() - 60_000).toISOString(), // -1 min
    };
    render(<NextTournamentCountdown data={data} />);
    const card = screen.getByTestId('next-tournament-countdown');
    expect(card.textContent?.toLowerCase()).toContain('em andamento');
    const cta = screen.queryByTestId('next-tournament-cta-grind');
    expect(cta).toBeInTheDocument();
    expect(cta?.getAttribute('href')).toBe('/grind-live');
  });
});

describe('<NextTournamentCountdown /> — atualiza com setInterval 1s', () => {
  it('apos 1s, countdown decrementa', async () => {
    const { default: NextTournamentCountdown } = await import('../NextTournamentCountdown');
    render(<NextTournamentCountdown data={tournament} />);
    const initial = screen.getByTestId('next-tournament-countdown').textContent;

    await act(async () => {
      vi.advanceTimersByTime(60_000); // +1 min
    });

    const after = screen.getByTestId('next-tournament-countdown').textContent;
    expect(after).not.toBe(initial);
  });

  it('cleanup do setInterval ao unmount (sem leak)', async () => {
    const { default: NextTournamentCountdown } = await import('../NextTournamentCountdown');
    const { unmount } = render(<NextTournamentCountdown data={tournament} />);

    // Snapshot do count de timers antes de unmount
    const beforeUnmount = vi.getTimerCount();
    unmount();
    const afterUnmount = vi.getTimerCount();

    // Apos unmount, o numero de timers ativos diminui (cleanup chamado)
    expect(afterUnmount).toBeLessThan(beforeUnmount);
  });
});
